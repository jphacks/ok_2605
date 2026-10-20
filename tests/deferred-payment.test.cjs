const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createDatabase } = require('./helpers/database.cjs');
const { initializeMedicationDatabase, saveMedication } = require('../src/features/medications/medication-repository.ts');
const { saveDoseRecord } = require('../src/features/medications/dose-record-repository.ts');
const { reconcilePenalties, listPenaltyPayments } = require('../src/features/payments/penalty-repository.ts');
const { reconcileReminders } = require('../src/features/reminders/reminder-plan.ts');
const { deliverPaymentNotifications } = require('../src/features/reminders/payment-notifications.ts');

const day = '2026-10-18';
const at = (hour, minute = 0, second = 0) => new Date(2026, 9, 18, hour, minute, second);

async function setup(t, file) {
  const { db, close, reopen } = createDatabase(file); t.after(close);
  await initializeMedicationDatabase(db);
  const saved = await saveMedication(db, { name: '朝の薬', doseTime: '08:00', penaltyAmount: '300' });
  await db.runAsync('UPDATE medication_schedules SET starts_at = ?, grace_minutes = 5 WHERE medication_id = ?', at(7).toISOString(), saved.id);
  const medication = { ...saved, createdAt: at(7).toISOString(), graceMinutes: 5, activeStartDay: day, activeEndDay: day };
  let reservations = [];
  const scheduler = {
    list: async () => reservations,
    cancel: async (id) => { reservations = reservations.filter((request) => request.identifier !== id); },
    schedule: async (request) => { reservations = reservations.filter((item) => item.identifier !== request.identifier).concat(request); },
  };
  return { db, medication, scheduler, reopen };
}

test('reserved deadline delivery has no settlement side effects; reopening settles and notifies only once', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'nomupay-deferred-'));
  const { db, medication, scheduler, reopen } = await setup(t, join(directory, 'medication.sqlite'));
  t.after(() => rmSync(directory, { recursive: true }));
  await reconcileReminders([medication], scheduler, [], at(7));
  assert.equal((await scheduler.list()).length, 4);
  assert.deepEqual(await listPenaltyPayments(db), []);
  // Model the OS consuming date-triggered notifications without running app JS.
  const due = (await scheduler.list()).filter((request) => request.trigger.date <= at(8, 5));
  const deadline = due.find((request) => request.content.data.pattern === 'deadline');
  assert.equal(+deadline.trigger.date, +at(8, 5));
  assert.match(deadline.content.body, /次回起動時にテスト決済を処理します/);
  assert.doesNotMatch(deadline.content.body, /決済が完了|決済完了/);
  for (const request of due) await scheduler.cancel(request.identifier);
  assert.deepEqual(await listPenaltyPayments(db), []);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_attempts')).n, 0);

  reopen();
  const saved = await reconcilePenalties(db, at(9));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, 'succeeded');
  assert.equal(saved[0].amount, 300);
  assert.equal(saved[0].createdAt, at(9).toISOString());
  const notified = [];
  const send = async (id, content) => notified.push({ id, content });
  await deliverPaymentNotifications(db, saved, send);
  reopen();
  await deliverPaymentNotifications(db, await reconcilePenalties(db, at(10)), send);
  assert.equal(notified.length, 1);
  assert.equal(notified[0].content.data.pattern, 'charged');
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_attempts')).n, 1);
});

for (const source of ['nfc', 'qr']) {
  test(`${source}: on-time recording cancels remaining alarms and stays exempt after reopening`, async (t) => {
    const { db, medication, scheduler } = await setup(t);
    await reconcileReminders([medication], scheduler, [], at(7));
    const record = await saveDoseRecord(db, medication.id, day, source, at(8, 4, 59).toISOString());
    await reconcileReminders([medication], scheduler, [record], at(8, 4, 59));
    assert.deepEqual(await scheduler.list(), []);
    assert.deepEqual(await reconcilePenalties(db, at(9)), []);
    assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM penalty_attempts')).n, 0);
  });
}
