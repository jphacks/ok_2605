const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reconcileReminders, dismissTakenReminders, reminderRequest, reminderMedicationId, notificationContent, REMINDER_PREFIX, REMINDER_VERSION } = require('../src/features/reminders/reminder-plan.ts');
const { deliverPaymentNotifications } = require('../src/features/reminders/payment-notifications.ts');
const { createDatabase } = require('./helpers/database.cjs');
const medicine = { id: 1, name: '朝の薬', doseTime: '08:05', penaltyAmount: 100, createdAt: '2026-10-17T00:00:00Z', activeStartDay: '2026-10-18', activeEndDay: '2026-10-18' };
const day = '2026-10-18';
const now = new Date(2026, 9, 18, 7);
function fake(initial = []) {
  let pending = [...initial];
  const calls = [];
  return {
    calls,
    async list() { return pending; },
    async cancel(id) { calls.push(['cancel', id]); pending = pending.filter(r => r.identifier !== id); },
    async schedule(request) { calls.push(['schedule', request]); pending = pending.filter(r => r.identifier !== request.identifier).concat(request); },
  };
}
test('four scheduled alerts include the exact custom deadline without claiming a completed payment', () => {
  const before = reminderRequest(medicine, day, 'before-dose');
  assert.equal(+before.trigger.date, +new Date(2026, 9, 18, 7, 55));
  assert.equal(reminderMedicationId(before.content.data), 1);
  assert.equal(before.content.data.scheduledDay, day);
  const warning = reminderRequest({ ...medicine, graceMinutes: 45 }, day, 'before-penalty');
  assert.equal(+warning.trigger.date, +new Date(2026, 9, 18, 8, 40));
  assert.equal(+reminderRequest(medicine, day, 'at-dose').trigger.date, +new Date(2026, 9, 18, 8, 5));
  assert.equal(reminderRequest(medicine, day, 'at-dose').content.data.pattern, 'at-dose');
  const deadline = reminderRequest({ ...medicine, graceMinutes: 45 }, day, 'deadline');
  assert.equal(+deadline.trigger.date, +new Date(2026, 9, 18, 8, 50));
  assert.match(deadline.content.title, /服用期限を過ぎました/);
  assert.match(deadline.content.body, /次回起動時にテスト決済を処理します/);
  assert.match(deadline.content.body, /実際の請求はありません/);
  assert.doesNotMatch(deadline.content.body, /決済が完了|課金されました/);
});
test('midnight offsets retain the occurrence day and five-minute grace warns before dose', () => {
  const before = reminderRequest({ ...medicine, doseTime: '00:05' }, day, 'before-dose');
  assert.equal(+before.trigger.date, +new Date(2026, 9, 17, 23, 55));
  assert.equal(before.content.data.scheduledDay, day);
  assert.equal(+reminderRequest({ ...medicine, graceMinutes: 5 }, day, 'before-penalty').trigger.date, +new Date(2026, 9, 18, 8));
});
test('repeat sync is idempotent; time and grace changes replace requests', async () => {
  const scheduler = fake();
  await reconcileReminders([medicine], scheduler, [], now);
  await reconcileReminders([medicine], scheduler, [], now);
  assert.equal(scheduler.calls.length, 4);
  await reconcileReminders([{ ...medicine, graceMinutes: 45 }], scheduler, [], now);
  assert.equal(scheduler.calls.filter(([action]) => action === 'schedule').length, 6);
  assert.equal((await scheduler.list()).length, 4);
});
test('taking a dose cancels all four owned alerts but keeps unrelated notifications', async () => {
  const other = { identifier: 'other', content: {} };
  const scheduler = fake([other]);
  await reconcileReminders([medicine], scheduler, [], now);
  await reconcileReminders([medicine], scheduler, [{ medicationId: 1, scheduledDay: day }], now);
  assert.deepEqual(await scheduler.list(), [other]);
});
test('deadline alerts group matching deadlines and remove only recorded members', async () => {
  const scheduler = fake();
  const medications = [medicine, { ...medicine, id: 2, name: '朝の薬B' },
    { ...medicine, id: 3, name: '別の期限の薬', graceMinutes: 45 }];
  await reconcileReminders(medications, scheduler, [], now);
  let deadlines = (await scheduler.list()).filter((request) => request.content.data.pattern === 'deadline');
  assert.equal(deadlines.length, 2);
  assert.match(deadlines[0].content.body, /朝の薬・朝の薬B/);
  const identifier = deadlines[0].identifier;
  await reconcileReminders(medications, scheduler, [{ medicationId: 1, scheduledDay: day }], now);
  deadlines = (await scheduler.list()).filter((request) => request.content.data.pattern === 'deadline');
  const remaining = deadlines.find((request) => request.identifier === identifier);
  assert.equal(remaining.content.body, '朝の薬B：服用期限を過ぎました。次回起動時にテスト決済を処理します。実際の請求はありません。');
  assert.deepEqual(remaining.content.data.occurrences, [{ medicationId: 2, scheduledDay: day }]);
  await reconcileReminders(medications, scheduler, [{ medicationId: 1, scheduledDay: day }, { medicationId: 2, scheduledDay: day }], now);
  deadlines = (await scheduler.list()).filter((request) => request.content.data.pattern === 'deadline');
  assert.equal(deadlines.length, 1);
  assert.match(deadlines[0].content.body, /別の期限の薬/);
});
test('a deadline across midnight retains both occurrence dates in one scheduled alert', async () => {
  const scheduler = fake();
  const medications = [
    { ...medicine, doseTime: '23:50', graceMinutes: 30 },
    { ...medicine, id: 2, name: '翌朝の薬', doseTime: '00:00', graceMinutes: 20,
      activeStartDay: '2026-10-19', activeEndDay: '2026-10-19' },
  ];
  await reconcileReminders(medications, scheduler, [], new Date(2026, 9, 18, 23, 30));
  const deadlines = (await scheduler.list()).filter((request) => request.content.data.pattern === 'deadline');
  assert.equal(deadlines.length, 1);
  assert.equal(+deadlines[0].trigger.date, +new Date(2026, 9, 19, 0, 20));
  assert.deepEqual(deadlines[0].content.data.occurrences, [
    { medicationId: 1, scheduledDay: day }, { medicationId: 2, scheduledDay: '2026-10-19' },
  ]);
});
test('reopening after a deadline does not recreate an already expired alert', async () => {
  const scheduler = fake();
  await reconcileReminders([medicine], scheduler, [], now);
  await reconcileReminders([medicine], scheduler, [], new Date(2026, 9, 18, 8, 35));
  assert.deepEqual(await scheduler.list(), []);
});
test('updating legacy reservations adds the deadline and refreshes notification metadata', async () => {
  const oldRequest = reminderRequest(medicine, day, 'at-dose');
  oldRequest.content.data.version = 2;
  const scheduler = fake([oldRequest]);
  await reconcileReminders([medicine], scheduler, [], now);
  assert.equal((await scheduler.list()).length, 4);
  assert.ok((await scheduler.list()).every((request) => request.content.data.version === REMINDER_VERSION));
});
test('deleted, disabled and ended medications cancel alerts and legacy daily reservations', async () => {
  for (const medications of [[], [{ ...medicine, notificationsEnabled: false }], [{ ...medicine, activeEndDay: '2026-10-17' }]]) {
    const scheduler = fake([{ identifier: REMINDER_PREFIX + '1', content: {} }, reminderRequest(medicine, day, 'before-dose')]);
    await reconcileReminders(medications, scheduler, [], now);
    assert.deepEqual(await scheduler.list(), []);
  }
});
test('future start days are reserved in advance and past trigger dates are not scheduled', async () => {
  const scheduler = fake();
  await reconcileReminders([{ ...medicine, doseTime: '00:05' }], scheduler, [], new Date(2026, 9, 17, 23, 50));
  assert.equal((await scheduler.list()).length, 4);
  const late = fake();
  await reconcileReminders([medicine], late, [], new Date(2026, 9, 18, 8));
  assert.deepEqual((await late.list()).map(r => r.content.data.pattern), ['at-dose', 'before-penalty', 'deadline']);
});
test('capacity reserves complete upcoming doses, never at-dose without its deadline', async () => {
  const scheduler = fake([{ identifier: 'other', content: {} }]);
  await reconcileReminders(Array.from({ length: 40 }, (_, i) => ({ ...medicine, id: i + 1 })), scheduler, [], now);
  const pending = await scheduler.list();
  assert.ok(pending.length <= 60);
  const reminders = pending.filter(r => r.content.data?.pattern);
  const deadlines = reminders.filter(r => r.content.data.pattern === 'deadline');
  for (const request of reminders.filter(r => r.content.data.pattern === 'at-dose')) {
    const data = request.content.data;
    assert.ok(deadlines.some(deadline => deadline.content.data.occurrences.some(occurrence => occurrence.medicationId === data.medicationId && occurrence.scheduledDay === data.scheduledDay)));
    assert.ok(reminders.some(other => other.content.data.pattern === 'before-penalty' && other.content.data.medicationId === data.medicationId));
  }
  assert.equal(pending.filter(r => r.content.data?.pattern === 'before-dose').length, 19);
});
test('native failures remain retryable and dropped requests are reported', async () => {
  const scheduler = fake();
  const failing = { ...scheduler, schedule: async r => {
    if (r.content.data.pattern === 'before-penalty') throw Error('native failure');
    return scheduler.schedule(r);
  } };
  await assert.rejects(reconcileReminders([medicine], failing, [], now), /native failure/);
  await reconcileReminders([medicine], scheduler, [], now);
  assert.equal((await scheduler.list()).length, 4);
  await assert.rejects(reconcileReminders([medicine], { ...fake(), schedule: async () => {} }, [], now), /予約できません/);
});
test('all demo patterns are explicitly marked and work with no registered medication', () => {
  for (const pattern of ['before-dose', 'at-dose', 'before-penalty', 'deadline']) {
    const content = notificationContent(pattern, { ...medicine, id: 0 }, day, true);
    assert.equal(content.data.demo, true);
    assert.equal(content.data.pattern, pattern);
    assert.ok(content.title.startsWith('【デモ】'));
  }
});
test('successful payment notifications persist receipts, skip failures and retry failed sends', async t => {
  const { db, close } = createDatabase(); t.after(close);
  const payment = { id: 1, medicationId: 1, medicationName: '朝の薬', doseTime: '08:05', amount: 100, scheduledDay: day, deadlineAt: new Date(2026, 9, 18, 8, 35).toISOString(), status: 'succeeded', acknowledgedAt: null };
  const sent = [];
  const send = async (id, content) => sent.push({ id, content });
  await deliverPaymentNotifications(db, [{ ...payment, status: 'failed' }], send);
  assert.equal(sent.length, 0);
  await assert.rejects(deliverPaymentNotifications(db, [payment], async () => { throw Error('offline'); }), /offline/);
  await deliverPaymentNotifications(db, [payment], send);
  await deliverPaymentNotifications(db, [payment], send);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].content.data.pattern, 'charged');
  assert.ok(sent[0].content.body.includes('100円'));
});
test('unrelated and malformed notifications cannot navigate to a medication', () => {
  for (const data of [undefined, {}, { kind: 'other', medicationId: 1 }, { kind: 'medication-reminder', medicationId: '../qr' }]) {
    assert.equal(reminderMedicationId(data), null);
  }
});

test('consuming the at-dose notification leaves the deadline reserved across a subsequent sync', async () => {
  const scheduler = fake();
  await reconcileReminders([medicine], scheduler, [], now);
  const due = (await scheduler.list()).filter((request) => request.trigger.date <= new Date(2026, 9, 18, 8, 5));
  for (const request of due) await scheduler.cancel(request.identifier);
  const deadline = (await scheduler.list()).find((request) => request.content.data.pattern === 'deadline');
  scheduler.calls.length = 0;
  await reconcileReminders([medicine], scheduler, [], new Date(2026, 9, 18, 8, 5, 1));
  assert.ok((await scheduler.list()).some((request) => request.identifier === deadline.identifier));
  assert.ok(!scheduler.calls.some(([action, id]) => action === 'cancel' && id === deadline.identifier));
});

test('version 3 deadline reservations are replaced with the deferred-settlement wording', async () => {
  const scheduler = fake();
  await reconcileReminders([medicine], scheduler, [], now);
  const old = (await scheduler.list()).find((request) => request.content.data.pattern === 'deadline');
  old.content.data.version = 3;
  old.content.body = 'テスト決済完了';
  scheduler.calls.length = 0;
  await reconcileReminders([medicine], scheduler, [], now);
  const updated = (await scheduler.list()).find((request) => request.identifier === old.identifier);
  assert.equal(scheduler.calls.length, 1);
  assert.match(updated.content.body, /次回起動時にテスト決済を処理します/);
  assert.equal(updated.content.data.version, REMINDER_VERSION);
});

test('dismissing taken reminders keeps other medicines, dates, demos and payment results', async () => {
  const medicationB = { ...medicine, id: 2 };
  const taken = reminderRequest(medicine, day, 'at-dose');
  const otherMedicine = reminderRequest(medicationB, day, 'at-dose');
  const otherDay = reminderRequest(medicine, '2026-10-19', 'at-dose');
  const demo = { identifier: 'demo', content: notificationContent('at-dose', medicine, day, true) };
  const charged = { identifier: 'charged', content: { data: { kind: 'medication-reminder', pattern: 'charged', medicationId: 1, scheduledDay: day } } };
  const unrelated = { identifier: 'other', content: { data: { kind: 'other', medicationId: 1, scheduledDay: day } } };
  const dismissed = [];
  await dismissTakenReminders([{ medicationId: 1, scheduledDay: day }], {
    list: async () => [taken, otherMedicine, otherDay, demo, charged, unrelated],
    dismiss: async (id) => dismissed.push(id),
  });
  assert.deepEqual(dismissed, [taken.identifier]);
});

test('a presented grouped deadline is dismissed only when every member is recorded', async () => {
  const scheduler = fake();
  await reconcileReminders([medicine, { ...medicine, id: 2 }], scheduler, [], now);
  const group = (await scheduler.list()).find((request) => request.content.data.pattern === 'deadline');
  const dismissed = [];
  const presenter = { list: async () => [group], dismiss: async (id) => dismissed.push(id) };
  const records = [{ medicationId: 1, scheduledDay: day }];
  await dismissTakenReminders(records, presenter);
  assert.deepEqual(dismissed, []);
  await dismissTakenReminders([...records, { medicationId: 2, scheduledDay: day }], presenter);
  assert.deepEqual(dismissed, [group.identifier]);
});
