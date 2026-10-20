const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDatabase } = require('./helpers/database.cjs');
const { groupPenaltyPayments } = require('../src/features/payments/penalty-groups.ts');
const { deliverPaymentNotifications } = require('../src/features/reminders/payment-notifications.ts');
const { initializeMedicationDatabase, saveMedication } = require('../src/features/medications/medication-repository.ts');
const { reconcilePenalties } = require('../src/features/payments/penalty-repository.ts');
const { saveDoseRecord } = require('../src/features/medications/dose-record-repository.ts');

const day = '2026-10-18';
const deadlineAt = new Date(2026, 9, 18, 8, 30).toISOString();
function payment(id, overrides = {}) {
  return {
    id, medicationId: id, medicationName: `薬${id}`, scheduledDay: day,
    doseTime: '08:00', deadlineAt, amount: 100, mode: 'test', status: 'succeeded',
    errorMessage: null, acknowledgedAt: null, createdAt: new Date(2026, 9, 18, 10).toISOString(),
    ...overrides,
  };
}

test('the same charge deadline lists every medicine and sums successful amounts', () => {
  const rows = Object.freeze([
    payment(2, { medicationName: '朝の薬B', amount: 300 }),
    payment(1, { medicationName: '朝の薬A' }),
    payment(3, { medicationName: '早朝の薬', doseTime: '07:30', amount: 500 }),
    payment(4, { status: 'failed', amount: 900 }),
  ]);
  const [group] = groupPenaltyPayments(rows);
  assert.equal(group.deadlineAt, deadlineAt);
  assert.deepEqual(group.payments.map((item) => item.medicationName), ['早朝の薬', '朝の薬A', '朝の薬B', '薬4']);
  assert.equal(group.totalAmount, 900);
  assert.deepEqual(rows.map((item) => item.id), [2, 1, 3, 4]);
  assert.equal(groupPenaltyPayments([payment(4, { status: 'failed' })])[0].totalAmount, 0);
  assert.deepEqual(groupPenaltyPayments([]), []);
});

test('catch-up payments stay separated by deadline and date, not insertion time or dose time', () => {
  const later = new Date(2026, 9, 18, 8, 45).toISOString();
  const nextDay = new Date(2026, 9, 19, 8, 30).toISOString();
  const rows = [
    payment(1),
    payment(2, { deadlineAt: later, amount: 300 }),
    payment(3, { scheduledDay: '2026-10-19', deadlineAt: nextDay, amount: 500 }),
  ];
  const groups = groupPenaltyPayments(rows);
  assert.deepEqual(groups.map((group) => group.deadlineAt), [nextDay, later, deadlineAt]);
  assert.deepEqual(groups.map((group) => group.totalAmount), [500, 300, 100]);
});

test('a deadline across midnight groups both scheduled days while retaining each medicine occurrence', () => {
  const midnight = new Date(2026, 9, 19, 0, 20).toISOString();
  const groups = groupPenaltyPayments([
    payment(1, { doseTime: '23:50', deadlineAt: midnight }),
    payment(2, { scheduledDay: '2026-10-19', doseTime: '00:00', deadlineAt: midnight, amount: 300 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].totalAmount, 400);
  assert.deepEqual(groups[0].payments.map((item) => item.scheduledDay), [day, '2026-10-19']);
});

test('one notification lists the entire successful group and writes a receipt for each medicine', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  const rows = [payment(1), payment(2, { amount: 300 }), payment(3, { status: 'failed', amount: 500 })];
  const sent = [];
  const send = async (id, content) => sent.push({ id, content });
  await deliverPaymentNotifications(db, rows, send);
  await deliverPaymentNotifications(db, [...rows].reverse(), send);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content.body, /薬1・薬2：合計400円/);
  assert.ok(!sent[0].content.body.includes('薬3'));
  assert.equal(sent[0].content.data.pattern, 'charged');
  assert.deepEqual(sent[0].content.data.paymentIds, [1, 2]);
  assert.deepEqual(await db.getAllAsync('SELECT payment_id FROM payment_notification_receipts ORDER BY payment_id'), [
    { payment_id: 1 }, { payment_id: 2 },
  ]);
});

test('retrying a failed medicine updates the same notification with the full total, including acknowledged peers', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  const first = payment(1);
  const failed = payment(2, { status: 'failed', amount: 300 });
  const sent = [];
  const send = async (id, content) => sent.push({ id, content });
  await deliverPaymentNotifications(db, [first, failed], send);
  const updated = [
    { ...first, acknowledgedAt: new Date().toISOString() },
    { ...failed, status: 'succeeded' },
  ];
  await deliverPaymentNotifications(db, updated, send);
  await deliverPaymentNotifications(db, updated, send);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].id, sent[1].id);
  assert.match(sent[1].content.body, /薬1・薬2：合計400円/);
  assert.equal(groupPenaltyPayments(updated)[0].totalAmount, 400);
  await deliverPaymentNotifications(db, [payment(3, { acknowledgedAt: new Date().toISOString() })], send);
  assert.equal(sent.length, 2);
});

test('legacy per-medicine receipts do not suppress a newly successful member of the same group', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  await db.execAsync('CREATE TABLE payment_notification_receipts (payment_id INTEGER PRIMARY KEY, sent_at TEXT NOT NULL);');
  await db.runAsync('INSERT INTO payment_notification_receipts VALUES (?, ?)', 1, new Date().toISOString());
  const sent = [];
  await deliverPaymentNotifications(db, [payment(1), payment(2, { amount: 300 })], async (id, content) => sent.push({ id, content }));
  assert.equal(sent.length, 1);
  assert.match(sent[0].content.body, /薬1・薬2：合計400円/);
});

test('failed group delivery and failed receipt writes can be retried without partial receipts', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  const rows = [payment(1), payment(2, { amount: 300 })];
  await assert.rejects(deliverPaymentNotifications(db, rows, async () => { throw Error('offline'); }), /offline/);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM payment_notification_receipts'), []);
  await db.execAsync("CREATE TRIGGER fail_receipt BEFORE INSERT ON payment_notification_receipts WHEN NEW.payment_id = 2 BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
  const sent = [];
  const send = async (id, content) => sent.push({ id, content });
  await assert.rejects(deliverPaymentNotifications(db, rows, send), /disk full/);
  assert.deepEqual(await db.getAllAsync('SELECT * FROM payment_notification_receipts'), []);
  await db.execAsync('DROP TRIGGER fail_receipt');
  await deliverPaymentNotifications(db, rows, send);
  await deliverPaymentNotifications(db, rows, send);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].id, sent[1].id);
  assert.match(sent[1].content.body, /薬1・薬2：合計400円/);
});

test('real penalty reconciliation produces grouped notifications without changing charges or taken-dose exemptions', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  await initializeMedicationDatabase(db);
  const definitions = [
    ['朝の薬A', '08:00', '100', 30],
    ['朝の薬B', '08:00', '300', 30],
    ['猶予の長い薬', '08:00', '500', 45],
    ['早朝の薬', '07:30', '700', 60],
    ['服用済みの薬', '08:00', '900', 30],
  ];
  for (const [name, doseTime, penaltyAmount, grace] of definitions) {
    const medication = await saveMedication(db, { name, doseTime, penaltyAmount });
    await db.runAsync('UPDATE medication_schedules SET starts_at = ?, grace_minutes = ? WHERE medication_id = ?',
      new Date(2026, 9, 18).toISOString(), grace, medication.id);
    if (name === '服用済みの薬') await saveDoseRecord(db, medication.id, day, 'qr', new Date(2026, 9, 18, 8, 5).toISOString());
  }
  const now = new Date(2026, 9, 18, 8, 45);
  const payments = await reconcilePenalties(db, now);
  const groups = groupPenaltyPayments(payments);
  assert.equal(payments.length, 4);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.totalAmount), [500, 1100]);
  assert.deepEqual(groups[1].payments.map((item) => item.medicationName), ['早朝の薬', '朝の薬A', '朝の薬B']);
  const sent = [];
  const send = async (id, content) => sent.push({ id, content });
  await deliverPaymentNotifications(db, payments, send);
  await deliverPaymentNotifications(db, await reconcilePenalties(db, now), send);
  assert.equal(sent.length, 2);
  assert.match(sent[1].content.body, /早朝の薬・朝の薬A・朝の薬B：合計1,100円/);
  assert.ok(sent.every((item) => !item.content.body.includes('服用済みの薬')));
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM penalty_attempts')).count, 4);
});
