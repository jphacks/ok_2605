const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reconcileReminders, reminderRequest, reminderMedicationId, REMINDER_PREFIX } = require('../src/features/reminders/reminder-plan.ts');
const medicine = { id: 1, name: '朝の薬', doseTime: '08:05', penaltyAmount: 100, createdAt: '' };
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
test('notification contains medicine name, dose time, numeric target and daily clock time', () => {
  const request = reminderRequest(medicine);
  assert.ok(request.content.body.includes('朝の薬'));
  assert.ok(request.content.body.includes('08:05'));
  assert.deepEqual(request.trigger, { type: 'daily', hour: 8, minute: 5 });
  assert.equal(reminderMedicationId(request.content.data), 1);
  assert.deepEqual(reminderRequest({ ...medicine, doseTime: '00:00' }).trigger, { type: 'daily', hour: 0, minute: 0 });
});
test('repeat sync does not duplicate; changes replace the same request', async () => {
  const scheduler = fake();
  await reconcileReminders([medicine], scheduler);
  await reconcileReminders([medicine], scheduler);
  assert.equal(scheduler.calls.length, 1);
  await reconcileReminders([{ ...medicine, name: '新しい薬', doseTime: '23:59' }], scheduler);
  assert.equal((await scheduler.list()).length, 1);
  assert.equal((await scheduler.list())[0].trigger.hour, 23);
  assert.ok((await scheduler.list())[0].content.body.includes('新しい薬'));
});
test('removing medication cancels only owned requests and leaves others', async () => {
  const other = { identifier: 'other', content: {} };
  const scheduler = fake([reminderRequest(medicine), other]);
  await reconcileReminders([], scheduler);
  assert.deepEqual(await scheduler.list(), [other]);
});
test('scheduling error is visible and retry repairs a partially completed sync', async () => {
  const scheduler = fake();
  const second = { ...medicine, id: 2 };
  const failing = { ...scheduler, schedule: async r => { if (r.identifier === `${REMINDER_PREFIX}2`) throw Error('native failure'); return scheduler.schedule(r); } };
  await assert.rejects(reconcileReminders([medicine, second], failing), /native failure/);
  await reconcileReminders([medicine, second], scheduler);
  assert.equal((await scheduler.list()).length, 2);
  assert.equal(scheduler.calls.length, 2);
});
test('capacity overflow and silently dropped native requests are reported', async () => {
  const scheduler = fake([reminderRequest(medicine)]);
  await assert.rejects(reconcileReminders(Array.from({ length: 61 }, (_, i) => ({ ...medicine, id: i + 1 })), scheduler), /60/);
  assert.equal(scheduler.calls.length, 0);
  await assert.rejects(reconcileReminders([medicine], { ...fake(), schedule: async () => {} }), /予約できません/);
});
test('unrelated and malformed notifications cannot navigate to a medication', () => {
  for (const data of [undefined, {}, { kind: 'other', medicationId: 1 }, { kind: 'medication-reminder', medicationId: '../qr' }, { kind: 'medication-reminder', medicationId: -1 }]) {
    assert.equal(reminderMedicationId(data), null);
  }
});
