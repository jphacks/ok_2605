const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDatabase } = require('./helpers/database.cjs');
const { initializeMedicationDatabase, saveMedication, listMedications } = require('../src/features/medications/medication-repository.ts');
const { saveDoseRecord } = require('../src/features/medications/dose-record-repository.ts');
const { doseCountdown, doseDeadline, formatDoseCountdown, wasScheduledBeforeDose, reconcilePenalties, listPenaltyPayments, acknowledgePenalties, retryPenaltyPayment } = require('../src/features/payments/penalty-repository.ts');
const { editMedication, archiveMedication, listMedicationSchedules } = require('../src/features/medications/medication-lifecycle.ts');
const { deviceQrPayload } = require('../src/features/boxes/medicine-box-repository.ts');
const { confirmQrDose } = require('../src/features/verification/qr-confirmation.ts');
const { pendingNfcDoses } = require('../src/features/nfc/nfc-box-repository.ts');
const { buildHistoryDay } = require('../src/features/medications/medication-history.ts');
const { listDoseRecordsForDay } = require('../src/features/medications/dose-record-repository.ts');
const day = '2026-10-18';
const date = (dayNumber, hour, minute = 0, second = 0) => new Date(2026, 9, dayNumber, hour, minute, second);
async function setup(t, file) {
  const connection = createDatabase(file); t.after(connection.close);
  await initializeMedicationDatabase(connection.db);
  const medication = await saveMedication(connection.db, { name: '朝の薬', doseTime: '08:00', penaltyAmount: '300' });
  const created = date(18, 7).toISOString();
  await connection.db.runAsync('UPDATE medications SET created_at = ? WHERE id = ?', created, medication.id);
  await connection.db.runAsync('UPDATE medication_schedules SET starts_at = ? WHERE medication_id = ?', created, medication.id);
  return { ...connection, medication };
}

test('actual time: early, grace, exact deadline, parallel checks and acknowledgment', async (t) => {
  const { db, medication } = await setup(t);
  assert.equal((await reconcilePenalties(db, date(18, 7))).length, 0);
  assert.equal((await reconcilePenalties(db, date(18, 8, 29))).length, 0);
  const results = await Promise.all(Array.from({ length: 5 }, () => reconcilePenalties(db, date(18, 8, 30))));
  assert.ok(results.every((rows) => rows.length === 1 && rows[0].amount === 300));
  const [payment] = results[0];
  assert.equal(payment.medicationId, medication.id);
  assert.equal(payment.mode, 'test');
  assert.equal((await db.getFirstAsync('SELECT count(*) AS count FROM penalty_attempts')).count, 1);
  await acknowledgePenalties(db, [payment.id]);
  assert.ok((await reconcilePenalties(db, date(18, 20)))[0].acknowledgedAt);
});

test('custom grace period drives the countdown and exact payment boundary', async (t) => {
  const { db, medication } = await setup(t);
  await db.runAsync('UPDATE medication_schedules SET grace_minutes = 5 WHERE medication_id = ?', medication.id);
  await db.runAsync('UPDATE medication_groups SET grace_minutes = 5 WHERE id = ?', medication.id);
  const configured = { ...medication, graceMinutes: 5 };
  assert.equal(doseDeadline(day, '08:00', 5).getTime(), date(18, 8, 5).getTime());
  assert.deepEqual(doseCountdown(configured, day, date(18, 7, 55)), { phase: 'until-dose', remainingSeconds: 300 });
  assert.deepEqual(doseCountdown({ ...configured, graceBeforeMinutes: 10 }, day, date(18, 7, 55)), { phase: 'until-dose', remainingSeconds: 300 });
  assert.deepEqual(doseCountdown(configured, day, date(18, 8)), { phase: 'until-penalty', remainingSeconds: 300 });
  assert.deepEqual(doseCountdown(configured, day, date(18, 8, 4, 1)), { phase: 'until-penalty', remainingSeconds: 59 });
  assert.deepEqual(doseCountdown(configured, day, date(18, 8, 5)), { phase: 'expired', remainingSeconds: 0 });
  assert.equal(formatDoseCountdown(300, true), '5分0秒');
  assert.equal(formatDoseCountdown(277, true), '4分37秒');
  assert.equal(formatDoseCountdown(45 * 60, false), '45分');
  assert.equal(formatDoseCountdown((3 * 60 + 20) * 60, false), '3時間20分');
  assert.equal(formatDoseCountdown((24 * 60 + 15) * 60, false), '1日15分');
  assert.deepEqual(await reconcilePenalties(db, date(18, 8, 4, 59)), []);
  assert.equal((await reconcilePenalties(db, date(18, 8, 5))).length, 1);
  assert.equal(doseDeadline(day, '08:00', 60).getTime(), date(18, 9).getTime());
});

test('QR and NFC confirmation windows use the selected grace period', async (t) => {
  const { db, medication } = await setup(t);
  await db.runAsync('UPDATE medication_schedules SET grace_minutes = 60 WHERE medication_id = ?', medication.id);
  await db.runAsync('UPDATE medication_groups SET grace_minutes = 60 WHERE id = ?', medication.id);
  const configured = { ...medication, graceMinutes: 60 };
  assert.equal(pendingNfcDoses({ tagId: 'AABB', medications: [configured] }, date(18, 8, 59)).length, 1);
  assert.equal(pendingNfcDoses({ tagId: 'AABB', medications: [configured] }, date(18, 9)).length, 0);
  const payload = await deviceQrPayload(db);
  const result = await confirmQrDose(db, medication.id, day, payload, date(18, 8, 59));
  assert.equal(result.record.medicationId, medication.id);
  await assert.rejects(confirmQrDose(db, medication.id, day, payload, date(18, 9)), /期限/);
});

test('on-time taken is exempt; legacy late records retain the penalty', async (t) => {
  const { db, medication } = await setup(t);
  await saveDoseRecord(db, medication.id, day, 'qr', date(18, 8, 1).toISOString());
  assert.deepEqual(await reconcilePenalties(db, date(18, 10)), []);
  await saveDoseRecord(db, medication.id, '2026-10-19', 'qr', date(19, 9).toISOString());
  const rows = await reconcilePenalties(db, date(19, 10));
  assert.equal(rows.length, 1); assert.equal(rows[0].scheduledDay, '2026-10-19');
});

test('closed app catches up all missed days, without schedules before registration', async (t) => {
  const { db } = await setup(t);
  const rows = await reconcilePenalties(db, date(21, 9));
  assert.deepEqual(rows.map((p) => p.scheduledDay).sort(), ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
  assert.equal((await reconcilePenalties(db, date(21, 9))).length, 4);
});

test('registration after a scheduled time never back-charges that morning', async (t) => {
  const { db, medication } = await setup(t);
  await db.runAsync('UPDATE medication_schedules SET starts_at = ? WHERE medication_id = ?', date(18, 9).toISOString(), medication.id);
  assert.deepEqual(await reconcilePenalties(db, date(18, 10)), []);
  assert.equal((await reconcilePenalties(db, date(19, 9))).length, 1);
});

test('home countdown distinguishes chargeable doses from newly registered or edited past times', () => {
  assert.equal(wasScheduledBeforeDose({ createdAt: date(18, 7, 59).toISOString(), doseTime: '08:00' }, day), true);
  assert.equal(wasScheduledBeforeDose({ createdAt: date(18, 8, 0, 1).toISOString(), doseTime: '08:00' }, day), false);
  assert.equal(wasScheduledBeforeDose({ createdAt: date(18, 7, 59).toISOString(), scheduleStartsAt: date(18, 8, 0, 1).toISOString(), doseTime: '08:00' }, day), false);
});

test('editing after the dose time updates the active schedule used by the home countdown', async (t) => {
  const { db, medication } = await setup(t);
  await editMedication(db, medication.id, { name: '変更後', doseTime: '08:00', penaltyAmount: '300' }, date(18, 8, 0, 1));
  const [current] = await listMedications(db);
  assert.equal(wasScheduledBeforeDose(current, day), false);
  assert.deepEqual(await reconcilePenalties(db, date(18, 8, 31)), []);
});

test('late night grace crossing midnight uses the previous scheduled day', async (t) => {
  const { db, medication } = await setup(t);
  await editMedication(db, medication.id, { name: '夜の薬', doseTime: '23:50', penaltyAmount: '500' }, date(18, 7, 30));
  assert.deepEqual(await reconcilePenalties(db, date(19, 0, 19)), []);
  const [payment] = await reconcilePenalties(db, date(19, 0, 20));
  assert.equal(payment.scheduledDay, day); assert.equal(payment.amount, 500);
});

test('failed writes roll back payment, attempt and cursor, and permit a later check', async (t) => {
  const { db } = await setup(t);
  await db.execAsync("CREATE TRIGGER fail_attempt BEFORE INSERT ON penalty_attempts BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
  await assert.rejects(reconcilePenalties(db, date(18, 9)), /disk full/);
  assert.deepEqual(await listPenaltyPayments(db), []);
  assert.equal((await db.getFirstAsync('SELECT checked_day FROM medication_schedules')).checked_day, null);
  await db.execAsync('DROP TRIGGER fail_attempt');
  assert.equal((await reconcilePenalties(db, date(18, 9))).length, 1);
});

test('failure is uncharged, retries preserve amount and cannot settle twice', async (t) => {
  const { db, medication } = await setup(t);
  const [failed] = await reconcilePenalties(db, date(18, 9), 'failure');
  assert.equal(failed.status, 'failed');
  await editMedication(db, medication.id, { name: '変更後', doseTime: '20:00', penaltyAmount: '900' }, date(18, 10));
  const retry = await retryPenaltyPayment(db, failed.id);
  assert.equal(retry[0].amount, 300); assert.equal(retry[0].status, 'succeeded');
  await retryPenaltyPayment(db, failed.id);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS count FROM penalty_attempts')).count, 2);
});

test('device QR persists, rejects unrelated codes, and confirms only the selected medication within its time window', async (t) => {
  const { db, medication } = await setup(t);
  const other = await saveMedication(db, { name: '別の薬', doseTime: '08:00', penaltyAmount: '100' });
  const payload = await deviceQrPayload(db);
  await initializeMedicationDatabase(db);
  assert.equal(await deviceQrPayload(db), payload);
  await assert.rejects(confirmQrDose(db, medication.id, day, 'nomupay:medication:v1:old-token', date(18, 8, 1)), /この端末/);
  await assert.rejects(confirmQrDose(db, medication.id, day, 'nomupay:demo:morning', date(18, 8, 1)), /この端末/);
  await assert.rejects(confirmQrDose(db, medication.id, day, payload, date(18, 7, 59)), /から記録/);
  await assert.rejects(confirmQrDose(db, medication.id, day, payload, date(18, 8, 30)), /期限/);
  assert.deepEqual(await listDoseRecordsForDay(db, day), []);
  const result = await confirmQrDose(db, medication.id, day, payload, date(18, 8, 1));
  assert.equal(result.record.source, 'qr');
  assert.equal((await confirmQrDose(db, medication.id, day, payload, date(18, 8, 2))).record.id, result.record.id);
  assert.equal((await listDoseRecordsForDay(db, day)).length, 1);
  const second = await confirmQrDose(db, other.id, day, payload, date(18, 8, 2));
  assert.equal(second.record.medicationId, other.id);
  assert.equal((await reconcilePenalties(db, date(18, 9))).length, 0);
});

test('edits and deletion retain original calendar records, QR and penalty amount', async (t) => {
  const { db, medication } = await setup(t);
  const payload = await deviceQrPayload(db);
  await confirmQrDose(db, medication.id, day, payload, date(18, 8, 1));
  await editMedication(db, medication.id, { name: '新しい名前', doseTime: '09:00', penaltyAmount: '500' }, date(18, 10));
  assert.equal(await deviceQrPayload(db), payload);
  const [payment] = await reconcilePenalties(db, date(19, 10));
  assert.equal(payment.amount, 500); assert.equal(payment.medicationName, '新しい名前');
  await archiveMedication(db, medication.id, date(19, 11));
  assert.deepEqual(await listMedications(db), []);
  assert.equal(await deviceQrPayload(db), payload);
  await assert.rejects(confirmQrDose(db, medication.id, '2026-10-20', payload, date(20, 9, 1)), /見つかりません/);
  const history = buildHistoryDay(day, await listMedicationSchedules(db), await listDoseRecordsForDay(db, day), '2026-10-20');
  assert.equal(history.status, 'complete'); assert.equal(history.entries[0].medication.name, '朝の薬');
  assert.equal((await reconcilePenalties(db, date(21, 12))).length, 1);
});

test('reopening the database retains notices, acknowledgements and idempotency', async (t) => {
  const { mkdtemp, rm } = require('node:fs/promises'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
  const dir = await mkdtemp(join(tmpdir(), 'nomupay-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { db, reopen } = await setup(t, join(dir, 'medications.db'));
  const [payment] = await reconcilePenalties(db, date(18, 9));
  reopen(); await initializeMedicationDatabase(db);
  assert.equal((await reconcilePenalties(db, date(18, 10)))[0].acknowledgedAt, null);
  await acknowledgePenalties(db, [payment.id]);
  reopen(); await initializeMedicationDatabase(db);
  assert.ok((await reconcilePenalties(db, date(18, 11)))[0].acknowledgedAt);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS count FROM penalty_attempts')).count, 1);
});

test('calendar shows today’s penalty and original schedule after a same-day edit', async (t) => {
  const { db, medication } = await setup(t);
  await reconcilePenalties(db, date(18, 9));
  await editMedication(db, medication.id, { name: '夜に変更', doseTime: '20:00', penaltyAmount: '700' }, date(18, 10));
  const history = buildHistoryDay(day, await listMedicationSchedules(db), [], day, await listPenaltyPayments(db));
  assert.equal(history.status, 'missed');
  assert.equal(history.entries[0].medication.name, '朝の薬');
  assert.equal(history.entries[0].medication.doseTime, '08:00');
});

test('v4 migration retains records and the stable device QR identifier', async (t) => {
  const { db, medication } = await setup(t);
  await saveDoseRecord(db, medication.id, day, 'qr', date(18, 8, 1).toISOString());
  await db.execAsync('DROP TRIGGER medication_details_on_insert; DROP TABLE medication_schedules; DROP TABLE medication_details; DROP TABLE penalty_attempts; DROP TABLE penalty_payments; PRAGMA user_version = 4;');
  await initializeMedicationDatabase(db);
  assert.equal((await listDoseRecordsForDay(db, day)).length, 1);
  const payload = await deviceQrPayload(db);
  await initializeMedicationDatabase(db);
  assert.equal(await deviceQrPayload(db), payload);
  assert.deepEqual(await reconcilePenalties(db, date(18, 9)), []);
});

test('deleted medication cannot be confirmed by the previously registered NFC tag', async (t) => {
  const { db, medication } = await setup(t);
  const { saveNfcBox, confirmNfcDose } = require('../src/features/nfc/nfc-box-repository.ts');
  const signal = new AbortController().signal;
  await saveNfcBox(db, '1234ABCD', signal);
  await archiveMedication(db, medication.id, date(18, 7, 30));
  await assert.rejects(confirmNfcDose(db, '1234ABCD', medication.id, day, signal, date(18, 8, 1)), /対象ではありません/);
  assert.deepEqual(await listDoseRecordsForDay(db, day), []);
});
