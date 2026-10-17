const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');

const { listDoseRecordsForDay } = require('../src/features/medications/dose-record-repository.ts');
const { initializeMedicationDatabase, saveMedication } = require('../src/features/medications/medication-repository.ts');
const { confirmNfcDose, loadNfcBox, saveNfcBox } = require('../src/features/nfc/nfc-box-repository.ts');

function createDatabase() {
  const connection = new DatabaseSync(':memory:');
  const db = {
    async execAsync(source) { connection.exec(source); },
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

test('focused NFC confirmation records only the medication selected on home', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const first = await saveMedication(db, { name: '朝の薬', doseTime: '08:00', penaltyAmount: '300' });
  const second = await saveMedication(db, { name: 'サプリ', doseTime: '08:05', penaltyAmount: '300' });
  const signal = new AbortController().signal;
  await saveNfcBox(db, 'A1B2C3D4', signal);

  const result = await confirmNfcDose(
    db,
    'A1B2C3D4',
    first.id,
    '2026-10-18',
    signal,
    new Date(2026, 9, 18, 8, 10),
  );

  assert.equal(result.recorded, true);
  assert.equal(result.medicationName, '朝の薬');
  assert.deepEqual((await listDoseRecordsForDay(db, '2026-10-18')).map((record) => record.medicationId), [first.id]);
});

test('focused NFC confirmation rejects another tag and leaves no dose record', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const medication = await saveMedication(db, { name: '朝の薬', doseTime: '08:00', penaltyAmount: '300' });
  const signal = new AbortController().signal;
  await saveNfcBox(db, 'A1B2C3D4', signal);

  await assert.rejects(confirmNfcDose(
    db,
    'FFEEDDCC',
    medication.id,
    '2026-10-18',
    signal,
    new Date(2026, 9, 18, 8, 10),
  ), /登録した薬箱のタグではありません/);
  assert.deepEqual(await listDoseRecordsForDay(db, '2026-10-18'), []);
});

test('a medication added after box registration is linked automatically', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const signal = new AbortController().signal;

  const registration = await saveNfcBox(db, 'A1B2C3D4', signal);
  assert.equal(registration.linkedMedicationCount, 0);
  const medication = await saveMedication(db, { name: 'あとから追加した薬', doseTime: '21:00', penaltyAmount: '300' });
  const snapshot = await loadNfcBox(db, new Date(2026, 9, 18, 21, 0));

  assert.equal(snapshot.box.tagId, 'A1B2C3D4');
  assert.deepEqual(snapshot.box.medications.map((item) => item.id), [medication.id]);
});
