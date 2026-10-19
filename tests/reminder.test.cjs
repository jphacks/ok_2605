const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reconcileReminders, reminderRequest, reminderMedicationId, notificationContent, REMINDER_PREFIX } = require('../src/features/reminders/reminder-plan.ts');
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
test('three scheduled alerts use dose minus ten, dose time and custom deadline minus ten', () => {
  const before = reminderRequest(medicine, day, 'before-dose');
  assert.equal(+before.trigger.date, +new Date(2026, 9, 18, 7, 55));
  assert.equal(reminderMedicationId(before.content.data), 1);
  assert.equal(before.content.data.scheduledDay, day);
  const warning = reminderRequest({ ...medicine, graceMinutes: 45 }, day, 'before-penalty');
  assert.equal(+warning.trigger.date, +new Date(2026, 9, 18, 8, 40));
  assert.equal(+reminderRequest(medicine, day, 'at-dose').trigger.date, +new Date(2026, 9, 18, 8, 5));
  assert.equal(reminderRequest(medicine, day, 'at-dose').content.data.pattern, 'at-dose');
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
  assert.equal(scheduler.calls.length, 3);
  await reconcileReminders([{ ...medicine, graceMinutes: 45 }], scheduler, [], now);
  assert.equal(scheduler.calls.length, 4);
  assert.equal((await scheduler.list()).length, 3);
});
test('taking a dose cancels all three owned alerts but keeps unrelated notifications', async () => {
  const other = { identifier: 'other', content: {} };
  const scheduler = fake([other]);
  await reconcileReminders([medicine], scheduler, [], now);
  await reconcileReminders([medicine], scheduler, [{ medicationId: 1, scheduledDay: day }], now);
  assert.deepEqual(await scheduler.list(), [other]);
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
  assert.equal((await scheduler.list()).length, 3);
  const late = fake();
  await reconcileReminders([medicine], late, [], new Date(2026, 9, 18, 8));
  assert.deepEqual((await late.list()).map(r => r.content.data.pattern), ['at-dose', 'before-penalty']);
});
test('capacity reserves nearest events first, leaving room for other notifications', async () => {
  const scheduler = fake([{ identifier: 'other', content: {} }]);
  await reconcileReminders(Array.from({ length: 40 }, (_, i) => ({ ...medicine, id: i + 1 })), scheduler, [], now);
  const pending = await scheduler.list();
  assert.equal(pending.length, 60);
  assert.equal(pending.filter(r => r.content.data?.pattern === 'before-dose').length, 40);
});
test('native failures remain retryable and dropped requests are reported', async () => {
  const scheduler = fake();
  const failing = { ...scheduler, schedule: async r => {
    if (r.content.data.pattern === 'before-penalty') throw Error('native failure');
    return scheduler.schedule(r);
  } };
  await assert.rejects(reconcileReminders([medicine], failing, [], now), /native failure/);
  await reconcileReminders([medicine], scheduler, [], now);
  assert.equal((await scheduler.list()).length, 3);
  await assert.rejects(reconcileReminders([medicine], { ...fake(), schedule: async () => {} }, [], now), /予約できません/);
});
test('all demo patterns are explicitly marked and work with no registered medication', () => {
  for (const pattern of ['before-dose', 'at-dose', 'before-penalty', 'charged']) {
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
