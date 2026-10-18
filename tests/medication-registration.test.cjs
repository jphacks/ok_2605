const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { dirname, join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');

const {
  MedicationValidationError,
  validateMedicationInput,
} = require('../src/features/medications/medication.ts');
const {
  initializeMedicationDatabase,
  listMedications,
  saveMedication,
  saveMedicationPlan,
} = require('../src/features/medications/medication-repository.ts');

const validInput = { name: '朝のお薬', doseTime: '08:00', penaltyAmount: '100' };

function createDatabase(path = ':memory:') {
  const connection = new DatabaseSync(path);
  const db = {
    async execAsync(source) {
      connection.exec(source);
    },
    async runAsync(source, ...params) {
      const result = connection.prepare(source).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getAllAsync(source, ...params) {
      return connection.prepare(source).all(...params).map((row) => ({ ...row }));
    },
    async getFirstAsync(source, ...params) {
      const row = connection.prepare(source).get(...params);
      return row ? { ...row } : null;
    },
    async withExclusiveTransactionAsync(task) {
      connection.exec('BEGIN IMMEDIATE');
      try { await task(db); connection.exec('COMMIT'); }
      catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
  };
  return { connection, db };
}

test('registration normalizes time and yen but preserves the medicine name', () => {
  assert.deepEqual(
    validateMedicationInput({ name: '　Ａ薬💊　', doseTime: ' ９：０５ ', penaltyAmount: ' １００ ' }),
    { success: true, value: { name: 'Ａ薬💊', doseTime: '09:05', penaltyAmount: 100 } },
  );
  for (const doseTime of ['0:00', '00:00', '23:59']) {
    const result = validateMedicationInput({ ...validInput, doseTime, penaltyAmount: '100' });
    assert.equal(result.success, true);
    assert.equal(result.value.doseTime, doseTime.padStart(5, '0'));
    assert.equal(result.value.penaltyAmount, 100);
  }
  assert.equal(validateMedicationInput({ ...validInput, name: '💊'.repeat(100) }).success, true);
  assert.equal(
    validateMedicationInput({ ...validInput, penaltyAmount: String(Number.MAX_SAFE_INTEGER) }).success,
    true,
  );
});

test('registration reports each invalid field and rejects name boundaries', () => {
  const result = validateMedicationInput({ name: '　 ', doseTime: '24:00', penaltyAmount: '' });
  assert.equal(result.success, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['doseTime', 'name', 'penaltyAmount']);
  for (const name of ['', ' \t\n ', '💊'.repeat(101), '薬\0名']) {
    const result = validateMedicationInput({ ...validInput, name });
    assert.equal(result.success, false, JSON.stringify(name));
    assert.ok(result.errors.name);
  }
});

test('invalid time and money formats never pass registration', () => {
  for (const doseTime of ['', '24:00', '23:60', '-1:00', '8:5', '8:000', '8:00pm', '8.00', '008:00']) {
    const result = validateMedicationInput({ ...validInput, doseTime });
    assert.equal(result.success, false, doseTime);
    assert.ok(result.errors.doseTime);
  }
  for (const penaltyAmount of ['', ' ', '0', '99', '-1', '+1', '1.0', '.5', '1e3', '1,000', 'Infinity', 'NaN', '9007199254740992']) {
    const result = validateMedicationInput({ ...validInput, penaltyAmount });
    assert.equal(result.success, false, penaltyAmount);
    assert.ok(result.errors.penaltyAmount);
  }
});

test('registered medicines survive a file database close and reopen and remain time ordered', async () => {
  const directory = await mkdtemp(join(dirname(require.resolve('../package.json')), 'tests', '.medication-test-'));
  const file = join(directory, 'medications.db');
  let database;
  try {
    database = createDatabase(file);
    await initializeMedicationDatabase(database.db);
    const night = await saveMedication(database.db, { ...validInput, name: '夜のお薬', doseTime: '21:00' });
    const morning = await saveMedication(database.db, { ...validInput, name: '朝のお薬', doseTime: '8:00', penaltyAmount: '100' });
    const sameTime = await saveMedication(database.db, { ...validInput, name: '朝のお薬２', doseTime: '8:00' });
    assert.ok(night.id > 0);
    assert.notEqual(night.id, morning.id);
    assert.notEqual(morning.id, sameTime.id);
    assert.ok(Number.isFinite(Date.parse(morning.createdAt)));
    database.connection.close();
    database = createDatabase(file);
    await initializeMedicationDatabase(database.db);
    assert.deepEqual(await listMedications(database.db), [morning, sameTime, night]);
    assert.deepEqual(await database.db.getFirstAsync('PRAGMA user_version'), { user_version: 6 });
  } finally {
    database?.connection.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('SQL-looking medicine names are stored as text with parameter binding', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const name = "薬'); DROP TABLE medications; --";
  const medication = await saveMedication(db, { ...validInput, name });
  assert.deepEqual(await listMedications(db), [medication]);
  assert.equal(medication.name, name);
  await saveMedication(db, validInput);
  assert.equal((await listMedications(db)).length, 2);
});

test('database constraints reject invalid stored values', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const insert = 'INSERT INTO medications (name, dose_time, penalty_amount, created_at) VALUES (?, ?, ?, ?)';
  const invalidRows = [
    ['', '08:00', 100, '2026-10-17T00:00:00.000Z'],
    ['   ', '08:00', 100, '2026-10-17T00:00:00.000Z'],
    ['💊'.repeat(101), '08:00', 100, '2026-10-17T00:00:00.000Z'],
    ['薬\0名', '08:00', 100, '2026-10-17T00:00:00.000Z'],
    ['薬', '8:00', 100, '2026-10-17T00:00:00.000Z'],
    ['薬', '24:00', 100, '2026-10-17T00:00:00.000Z'],
    ['薬', '08:60', 100, '2026-10-17T00:00:00.000Z'],
    ['薬', '08:00', -1, '2026-10-17T00:00:00.000Z'],
    ['薬', '08:00', 1.5, '2026-10-17T00:00:00.000Z'],
    ['薬', '08:00', Number.MAX_SAFE_INTEGER + 1, '2026-10-17T00:00:00.000Z'],
    ['薬', '08:00', 100, ''],
    [null, '08:00', 100, '2026-10-17T00:00:00.000Z'],
  ];
  for (const row of invalidRows) {
    await assert.rejects(db.runAsync(insert, ...row));
  }
  assert.deepEqual(await listMedications(db), []);
});

test('reinitializing accepts the shipped iOS v6 database and leaves newer schemas untouched', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const medication = await saveMedication(db, validInput);
  await initializeMedicationDatabase(db);
  assert.deepEqual(await listMedications(db), [medication]);
  assert.deepEqual(await db.getFirstAsync('PRAGMA user_version'), { user_version: 6 });
  await initializeMedicationDatabase(db);
  assert.deepEqual(await listMedications(db), [medication]);
  await db.execAsync('PRAGMA user_version = 7;');
  await assert.rejects(initializeMedicationDatabase(db), /新しいデータベース形式/);
  assert.deepEqual(await listMedications(db), [medication]);
  assert.deepEqual(await db.getFirstAsync('PRAGMA user_version'), { user_version: 7 });
});

test('repository validates independently and leaves no record after a failed insert', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  await assert.rejects(saveMedication(db, { ...validInput, name: '' }), MedicationValidationError);
  await db.execAsync("CREATE TRIGGER reject_medication BEFORE INSERT ON medications BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  await assert.rejects(saveMedication(db, validInput), /test failure/);
  assert.deepEqual(await listMedications(db), []);
});

test('a committed registration succeeds even when listing is temporarily unavailable', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const medication = await saveMedication(
    { ...db, async getAllAsync() { throw new Error('read unavailable'); } },
    validInput,
  );
  assert.deepEqual(await listMedications(db), [medication]);
});


test('minimum penalty is 100 yen for validation and database writes', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  assert.equal(validateMedicationInput({ ...validInput, penaltyAmount: '99' }).success, false);
  assert.equal(validateMedicationInput({ ...validInput, penaltyAmount: '100' }).success, true);
  const saved = await saveMedication(db, validInput);
  await assert.rejects(db.runAsync('UPDATE medications SET penalty_amount = ? WHERE id = ?', 99, saved.id));
  await assert.rejects(db.runAsync('INSERT INTO medications (name, dose_time, penalty_amount, created_at) VALUES (?, ?, ?, ?)', '薬', '09:00', 99, saved.createdAt));
});

test('applying the new minimum preserves older records without raising their amounts', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  await db.execAsync('DROP TRIGGER medications_minimum_insert;');
  await db.runAsync('INSERT INTO medications (name, dose_time, penalty_amount, created_at) VALUES (?, ?, ?, ?)', '以前の薬', '09:00', 0, '2026-10-17T00:00:00Z');
  await initializeMedicationDatabase(db);
  assert.equal((await listMedications(db))[0].penaltyAmount, 0);
  await assert.rejects(saveMedication(db, { ...validInput, penaltyAmount: '99' }));
  const saved = await saveMedication(db, validInput);
  assert.equal(saved.penaltyAmount, 100);
});

test('one medication plan links every dose time and stores its inclusive period', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const saved = await saveMedicationPlan(db, {
    name: '朝夜の薬',
    doses: [
      { doseTime: '20:00', doseAmount: '2' },
      { doseTime: '08:00', doseAmount: '1' },
    ],
    penaltyAmount: '300',
    startDay: '2026-10-20',
    endDay: '2026-11-18',
    notificationsEnabled: true,
    unit: '錠',
    inventory: '90',
    memo: '食後',
  });
  assert.equal(saved.length, 2);
  assert.deepEqual(saved.map((item) => item.doseTime), ['08:00', '20:00']);
  assert.equal(saved[0].groupId, saved[1].groupId);
  assert.deepEqual(await listMedications(db), saved);
  const schedules = await db.getAllAsync(`SELECT medication_id AS medicationId, starts_at AS startsAt, ends_at AS endsAt
    FROM medication_schedules ORDER BY medication_id`);
  assert.equal(schedules.length, 2);
  assert.ok(schedules.every((item) => item.startsAt === '2026-10-19T15:00:00.000Z'));
  assert.deepEqual(schedules.map((item) => item.endsAt), ['2026-11-18T23:00:00.000Z', '2026-11-19T11:00:00.000Z']);
  const groups = await db.getAllAsync('SELECT id, inventory, memo FROM medication_groups WHERE is_plan = 1');
  assert.deepEqual(groups, [{ id: saved[0].groupId, inventory: 90, memo: '食後' }]);
});
