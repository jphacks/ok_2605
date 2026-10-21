const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createDatabase } = require('./helpers/database.cjs');
const { initializeMedicationDatabase, saveMedication } = require('../src/features/medications/medication-repository.ts');
const { saveDoseRecord } = require('../src/features/medications/dose-record-repository.ts');
const { acknowledgePenalties, reconcilePenalties, retryPenaltyPayment } = require('../src/features/payments/penalty-repository.ts');
const { archiveMedication, editMedication } = require('../src/features/medications/medication-lifecycle.ts');
const { resolveVerificationEntry, isDoseReminder, isReminderVerification } = require('../src/features/verification/verification-entry.ts');
const { doseReminderOccurrence, doseReminderDestination } = require('../src/features/verification/dose-reminder-entry.ts');
const { reminderRequest } = require('../src/features/reminders/reminder-plan.ts');

const day = '2026-10-18';
const at = (hour, minute = 0, second = 0, date = 18) => new Date(2026, 9, date, hour, minute, second);
async function setup(t, { doseTime = '08:00', graceMinutes = 5, graceBeforeMinutes = 0, file } = {}) {
  const connection = createDatabase(file); t.after(connection.close);
  const { db } = connection;
  await initializeMedicationDatabase(db);
  const medication = await saveMedication(db, { name: '朝の薬', doseTime, penaltyAmount: '300' });
  await db.runAsync('UPDATE medications SET created_at = ? WHERE id = ?', at(7).toISOString(), medication.id);
  await db.runAsync(`UPDATE medication_groups SET is_plan = 1, starts_on = ?, ends_on = ?, grace_minutes = ?, grace_before_minutes = ? WHERE id = ?`,
    day, day, graceMinutes, graceBeforeMinutes, medication.id);
  const [hour, minute] = doseTime.split(':').map(Number);
  await db.runAsync('UPDATE medication_schedules SET starts_at = ?, ends_at = ?, grace_minutes = ?, grace_before_minutes = ? WHERE medication_id = ?',
    at(7).toISOString(), at(hour, minute, 0, 19).toISOString(), graceMinutes, graceBeforeMinutes, medication.id);
  const input = { medicationId: medication.id, scheduledDay: day, expectedDoseAt: at(hour, minute).toISOString() };
  return { ...connection, medication, input };
}

test('an at-dose notification opens the reader only while its current grace window is open', async (t) => {
  const { db, input } = await setup(t);
  const start = await resolveVerificationEntry(db, input, at(8));
  assert.equal(start.kind, 'ready');
  assert.equal(start.deadlineAt, at(8, 5).toISOString());
  assert.equal((await resolveVerificationEntry(db, input, new Date(+at(8, 5) - 1))).kind, 'ready');
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_payments')).n, 0);
});

test('the exact deadline and a later tap show a real unacknowledged payment, never NFC', async (t) => {
  const { db, input } = await setup(t);
  const boundary = await resolveVerificationEntry(db, input, at(8, 5));
  const later = await resolveVerificationEntry(db, input, at(9));
  assert.equal(boundary.kind, 'payment');
  assert.deepEqual(later, boundary);
  const row = await db.getFirstAsync('SELECT status, amount, deadline_at FROM penalty_payments');
  assert.deepEqual(row, { status: 'succeeded', amount: 300, deadline_at: at(8, 5).toISOString() });
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_attempts')).n, 1);
});

test('a previously acknowledged payment shows out-of-time without reopening or repeating payment', async (t) => {
  const { db, input } = await setup(t);
  const payment = await resolveVerificationEntry(db, input, at(8, 5));
  await acknowledgePenalties(db, [payment.paymentId]);
  for (let index = 0; index < 3; index++) {
    assert.equal((await resolveVerificationEntry(db, input, at(10))).kind, 'expired');
  }
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_payments')).n, 1);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_attempts')).n, 1);
  assert.ok((await db.getFirstAsync('SELECT acknowledged_at FROM penalty_payments')).acknowledged_at);
});

for (const source of ['nfc', 'qr']) {
  test(`${source}: a saved on-time dose is shown as recorded even when an old notification is tapped late`, async (t) => {
    const { db, input } = await setup(t);
    await saveDoseRecord(db, input.medicationId, day, source, at(8, 4, 59).toISOString());
    assert.equal((await resolveVerificationEntry(db, input, at(8, 4, 59))).kind, 'taken');
    assert.equal((await resolveVerificationEntry(db, input, at(10))).kind, 'taken');
    assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_payments')).n, 0);
  });
}

test('a legacy late record does not hide an actual unconfirmed penalty', async (t) => {
  const { db, input } = await setup(t);
  await saveDoseRecord(db, input.medicationId, day, 'nfc', at(8, 5).toISOString());
  assert.equal((await resolveVerificationEntry(db, input, at(9))).kind, 'payment');
});

test('failed settlement remains a failure result and a tap never performs a payment retry', async (t) => {
  const { db, input } = await setup(t);
  const [payment] = await reconcilePenalties(db, at(8, 5), 'failure');
  const result = await resolveVerificationEntry(db, input, at(9));
  assert.equal(result.kind, 'payment');
  assert.equal(result.paymentId, payment.id);
  assert.equal((await db.getFirstAsync('SELECT status FROM penalty_payments')).status, 'failed');
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_attempts')).n, 1);
  await retryPenaltyPayment(db, payment.id);
  assert.equal((await resolveVerificationEntry(db, input, at(9))).kind, 'payment');
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_attempts')).n, 2);
});

test('cold startup reconciliation and multiple notification taps share one payment transaction key', async (t) => {
  const { db, input } = await setup(t);
  const [payments, ...results] = await Promise.all([
    reconcilePenalties(db, at(9)),
    ...Array.from({ length: 5 }, () => resolveVerificationEntry(db, input, at(9))),
  ]);
  assert.equal(payments.length, 1);
  assert.ok(results.every((result) => result.kind === 'payment' && result.paymentId === payments[0].id));
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_attempts')).n, 1);
});

test('reopening a database and tapping a previous-day notification preserves acknowledgment and never selects today', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'nomupay-entry-'));
  const { db, input, reopen } = await setup(t, { file: join(directory, 'medication.sqlite') });
  t.after(() => rmSync(directory, { recursive: true }));
  const payment = await resolveVerificationEntry(db, input, at(9));
  await acknowledgePenalties(db, [payment.paymentId]);
  reopen();
  assert.equal((await resolveVerificationEntry(db, input, at(9, 0, 0, 19))).kind, 'expired');
  assert.deepEqual(await db.getAllAsync('SELECT scheduled_day FROM penalty_payments'), [{ scheduled_day: day }]);
});

test('a grace period crossing midnight uses the original scheduled date and correct exact boundary', async (t) => {
  const { db, input } = await setup(t, { doseTime: '23:50', graceMinutes: 30 });
  assert.equal((await resolveVerificationEntry(db, input, at(0, 19, 59, 19))).kind, 'ready');
  assert.equal((await resolveVerificationEntry(db, input, at(0, 20, 0, 19))).kind, 'payment');
  assert.equal((await db.getFirstAsync('SELECT scheduled_day FROM penalty_payments')).scheduled_day, day);
});

test('the configured early grace is respected before opening a camera or NFC session', async (t) => {
  const { db, input } = await setup(t, { doseTime: '10:00', graceBeforeMinutes: 10 });
  assert.equal((await resolveVerificationEntry(db, input, at(9, 49, 59))).kind, 'not-started');
  assert.equal((await resolveVerificationEntry(db, input, at(9, 50))).kind, 'ready');
});

test('a stale at-dose notification never opens an edited time slot', async (t) => {
  const { db, input } = await setup(t);
  // The legacy edit API operates on an open-ended schedule, unlike the
  // one-day plan used by the other fixtures.
  await db.runAsync('UPDATE medication_schedules SET ends_at = NULL WHERE medication_id = ?', input.medicationId);
  await editMedication(db, input.medicationId, { name: '朝の薬', doseTime: '09:00', penaltyAmount: '300' }, at(8, 1));
  assert.equal((await resolveVerificationEntry(db, input, at(9))).kind, 'unavailable');
  assert.equal((await resolveVerificationEntry(db, { ...input, expectedDoseAt: at(9).toISOString() }, at(9))).kind, 'ready');
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_payments')).n, 0);
});

test('deleted medication cannot start reading, but a previously missed payment remains viewable', async (t) => {
  const { db, input } = await setup(t);
  await db.runAsync('UPDATE medication_schedules SET ends_at = NULL WHERE medication_id = ?', input.medicationId);
  await archiveMedication(db, input.medicationId, at(8, 1));
  assert.equal((await resolveVerificationEntry(db, input, at(9))).kind, 'unavailable');
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_payments')).n, 0);
});

test('archiving after a missed deadline retains that payment and its original amount', async (t) => {
  const { db, input } = await setup(t);
  await archiveMedication(db, input.medicationId, at(9));
  assert.equal((await resolveVerificationEntry(db, input, at(10))).kind, 'payment');
  assert.equal((await db.getFirstAsync('SELECT amount FROM penalty_payments')).amount, 300);
});

test('registering after the dose time does not turn an expired notification into a back-charge', async (t) => {
  const { db, input } = await setup(t);
  await db.runAsync('UPDATE medication_schedules SET starts_at = ? WHERE medication_id = ?', at(8, 1).toISOString(), input.medicationId);
  assert.equal((await resolveVerificationEntry(db, input, at(9))).kind, 'expired');
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_payments')).n, 0);
});

test('invalid, unknown and malformed notification targets fail closed without settlement', async (t) => {
  const { db, input } = await setup(t);
  for (const value of [
    { ...input, medicationId: -1 }, { ...input, medicationId: 999 },
    { ...input, scheduledDay: '2026-02-30' }, { ...input, expectedDoseAt: 'invalid' },
  ]) assert.equal((await resolveVerificationEntry(db, value, at(9))).kind, 'unavailable');
  assert.equal((await resolveVerificationEntry(db, input, new Date(NaN))).kind, 'unavailable');
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_payments')).n, 0);
});

test('a failed database write cannot result in a false completed-payment route', async (t) => {
  const { db, input } = await setup(t);
  await db.execAsync("CREATE TRIGGER fail_entry BEFORE INSERT ON penalty_attempts BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
  await assert.rejects(resolveVerificationEntry(db, input, at(9)), /disk full/);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_payments')).n, 0);
  await db.execAsync('DROP TRIGGER fail_entry');
  assert.equal((await resolveVerificationEntry(db, input, at(9))).kind, 'payment');
});

test('only dose notifications and their guarded routes defer the generic payment redirect', () => {
  assert.equal(isDoseReminder({ kind: 'medication-reminder', medicationId: 1, pattern: 'at-dose' }), true);
  for (const data of [undefined, {}, { kind: 'other', medicationId: 1 },
    { kind: 'medication-reminder', medicationId: '../verify' },
    { kind: 'medication-reminder', medicationId: 1, demo: true },
    { kind: 'medication-reminder', medicationId: 1, pattern: 'deadline' },
    { kind: 'medication-reminder', medicationId: 1, pattern: 'charged' }]) assert.equal(isDoseReminder(data), false);
  assert.equal(isReminderVerification('/verify', '1'), true);
  assert.equal(isReminderVerification('/qr', '1'), true);
  assert.equal(isReminderVerification('/verification-result', '1'), true);
  assert.equal(isReminderVerification('/', '1'), false);
  assert.equal(isReminderVerification('/verify', undefined), false);
});

test('actual at-dose payload: acknowledge settlement, then retap the original notification without navigating to a reader', async (t) => {
  const { db, input, medication } = await setup(t);
  const notification = reminderRequest(medication, day, 'at-dose');
  const occurrence = doseReminderOccurrence(notification.content.data, notification.identifier, at(8));
  assert.deepEqual(occurrence, input);
  assert.equal(await doseReminderDestination(db, occurrence, at(8)), '/verify');
  await reconcilePenalties(db, at(8, 5));
  const payment = await db.getFirstAsync('SELECT id FROM penalty_payments');
  await acknowledgePenalties(db, [payment.id]);
  for (let tap = 0; tap < 5; tap++) {
    assert.equal(await doseReminderDestination(db, occurrence, at(9)), '/verification-result');
  }
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_attempts')).n, 1);
});

test('a notification whose deadline passes before navigation also targets the scanner-free result route', async (t) => {
  const { db, input } = await setup(t);
  assert.equal(await doseReminderDestination(db, input, new Date(+at(8, 5) - 1)), '/verify');
  assert.equal(await doseReminderDestination(db, input, at(8, 5)), '/verification-result');
  assert.equal((await resolveVerificationEntry(db, input, at(8, 5))).kind, 'payment');
});

test('an on-time taken notification uses the scanner-free result route', async (t) => {
  const { db, input } = await setup(t);
  await saveDoseRecord(db, input.medicationId, day, 'nfc', at(8, 1).toISOString());
  assert.equal(await doseReminderDestination(db, input, at(8, 2)), '/verification-result');
  assert.equal(await doseReminderDestination(db, input, at(9)), '/verification-result');
});

test('a legacy reservation without a payload date retains its identifier date, not the new delivery date', async (t) => {
  const { db, medication } = await setup(t);
  const notification = reminderRequest(medication, day, 'at-dose');
  delete notification.content.data.scheduledDay;
  const occurrence = doseReminderOccurrence(notification.content.data, notification.identifier, at(8, 0, 0, 19));
  assert.equal(occurrence.scheduledDay, day);
  assert.equal(await doseReminderDestination(db, occurrence, at(8, 0, 0, 19)), '/verification-result');
});

test('mismatched payload and stable reservation identity fail closed without charging another occurrence', async (t) => {
  const { db, medication } = await setup(t);
  const notification = reminderRequest(medication, day, 'at-dose');
  for (const data of [
    { ...notification.content.data, scheduledDay: '2026-10-19' },
    { ...notification.content.data, medicationId: medication.id + 1 },
  ]) {
    const occurrence = doseReminderOccurrence(data, notification.identifier, at(8));
    assert.equal(await doseReminderDestination(db, occurrence, at(9)), '/verification-result');
  }
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_payments')).n, 0);
});
