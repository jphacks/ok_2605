const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');

const { buildDailySchedule, localDay, nextScheduledDose } = require('../src/features/medications/dose-record.ts');
const { listDoseRecordsBetween, listDoseRecordsForDay, saveDoseRecord } = require('../src/features/medications/dose-record-repository.ts');
const { initializeMedicationDatabase, saveMedication } = require('../src/features/medications/medication-repository.ts');
const { buildHistoryDay, monthCalendarDays, monthRange } = require('../src/features/medications/medication-history.ts');

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
  };
  return { connection, db };
}

test('dose records are unique per medication and local day', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const medication = await saveMedication(db, { name: '朝の薬', doseTime: '08:00', penaltyAmount: '300' });
  const first = await saveDoseRecord(db, medication.id, '2026-10-18', 'qr', '2026-10-17T23:05:00.000Z');
  const duplicate = await saveDoseRecord(db, medication.id, '2026-10-18', 'demo', '2026-10-17T23:06:00.000Z');
  const nextDay = await saveDoseRecord(db, medication.id, '2026-10-19', 'demo', '2026-10-18T23:05:00.000Z');
  assert.deepEqual(duplicate, first);
  assert.notEqual(nextDay.id, first.id);
  assert.deepEqual(await listDoseRecordsForDay(db, '2026-10-18'), [first]);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 9);
});

test('dose records reject unknown medication and invalid input', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  await assert.rejects(saveDoseRecord(db, 999, '2026-10-18', 'qr'), /見つかりません/);
  await assert.rejects(saveDoseRecord(db, 1, '2026-02-30', 'qr'), /日付/);
  await assert.rejects(saveDoseRecord(db, 1, '2026-10-18', 'invalid'), /方法/);
  assert.deepEqual(await listDoseRecordsForDay(db, '2026-10-18'), []);
});

test('schedule selects overdue, upcoming, then tomorrow', () => {
  const medications = [
    { id: 1, name: '朝の薬', doseTime: '08:00', penaltyAmount: 100, createdAt: '2026-10-18T00:00:00Z' },
    { id: 2, name: '夜の薬', doseTime: '20:00', penaltyAmount: 100, createdAt: '2026-10-18T00:00:00Z' },
  ];
  const now = new Date(2026, 9, 18, 9, 0);
  const day = localDay(now);
  const initial = buildDailySchedule(medications, [], now);
  assert.deepEqual(initial.map((item) => item.status), ['due', 'upcoming']);
  assert.equal(nextScheduledDose(initial, medications, now).medication.id, 1);
  assert.equal(nextScheduledDose(initial, medications, now).due, true);

  const afterMorning = buildDailySchedule(medications, [{
    id: 1, medicationId: 1, scheduledDay: day, takenAt: now.toISOString(), source: 'qr',
  }], now);
  assert.equal(nextScheduledDose(afterMorning, medications, now).medication.id, 2);
  assert.equal(nextScheduledDose(afterMorning, medications, now).due, false);

  const afterAll = buildDailySchedule(medications, medications.map((medication) => ({
    id: medication.id, medicationId: medication.id, scheduledDay: day,
    takenAt: now.toISOString(), source: 'demo',
  })), now);
  const tomorrow = nextScheduledDose(afterAll, medications, now);
  assert.equal(tomorrow.medication.id, 1);
  assert.notEqual(tomorrow.day, day);

  const future = nextScheduledDose([], [{
    id: 3, name: '来週の薬', doseTime: '09:00', penaltyAmount: 100,
    createdAt: '2026-10-18T00:00:00Z', activeStartDay: '2026-10-25', activeEndDay: '2026-10-27',
  }], now);
  assert.equal(future.day, '2026-10-25');
  assert.equal(future.medication.id, 3);
});

test('history records can be loaded by an inclusive date range', async (context) => {
  const { connection, db } = createDatabase();
  context.after(() => connection.close());
  await initializeMedicationDatabase(db);
  const medication = await saveMedication(db, { name: '朝の薬', doseTime: '08:00', penaltyAmount: '300' });
  const october = await saveDoseRecord(db, medication.id, '2026-10-18', 'qr', '2026-10-17T23:05:00.000Z');
  await saveDoseRecord(db, medication.id, '2026-11-01', 'demo', '2026-10-31T23:05:00.000Z');
  assert.deepEqual(await listDoseRecordsBetween(db, '2026-10-01', '2026-10-31'), [october]);
  await assert.rejects(listDoseRecordsBetween(db, '2026-11-01', '2026-10-31'), /期間/);
});

test('history marks complete, missed, pending, future, and days before registration', () => {
  const medications = [
    { id: 1, name: '朝の薬', doseTime: '08:00', penaltyAmount: 100, createdAt: new Date(2026, 9, 1, 12).toISOString() },
    { id: 2, name: '夜の薬', doseTime: '20:00', penaltyAmount: 100, createdAt: new Date(2026, 9, 15, 12).toISOString() },
  ];
  const record = (id, medicationId, scheduledDay) => ({
    id, medicationId, scheduledDay, takenAt: new Date(2026, 9, 18, 9).toISOString(), source: 'qr',
  });
  const today = '2026-10-18';
  assert.equal(buildHistoryDay('2026-09-30', medications, [], today).status, 'none');
  assert.equal(buildHistoryDay('2026-10-10', medications, [record(1, 1, '2026-10-10')], today).status, 'complete');
  assert.equal(buildHistoryDay('2026-10-16', medications, [record(2, 1, '2026-10-16')], today).status, 'missed');
  assert.equal(buildHistoryDay('2026-10-18', medications, [record(3, 1, '2026-10-18')], today).status, 'pending');
  assert.equal(buildHistoryDay('2026-10-20', medications, [], today).status, 'future');
});

test('month helpers return the query range and aligned calendar cells', () => {
  assert.deepEqual(monthRange(2026, 9), { firstDay: '2026-10-01', lastDay: '2026-10-31' });
  const cells = monthCalendarDays(2026, 9);
  assert.equal(cells.findIndex(Boolean), new Date(2026, 9, 1, 12).getDay());
  assert.equal(cells.filter(Boolean).length, 31);
  assert.equal(cells.length % 7, 0);
});
