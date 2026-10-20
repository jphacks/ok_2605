import type { MedicationDatabase } from '../medications/database-types.ts';
import type { PenaltyPayment } from '../payments/penalty-repository.ts';
import { groupPenaltyPayments } from '../payments/penalty-groups.ts';
import { paymentNotificationContent } from './reminder-plan.ts';

// Called only after foreground test settlement, on both Android and iOS.
// Deadline alarms are ordinary pre-scheduled reminders and never settle payments.
// Serialized by the caller; a receipt prevents repeat result notifications on restart.
export async function deliverPaymentNotifications(db: MedicationDatabase, payments: PenaltyPayment[], send: (id: string, content: ReturnType<typeof paymentNotificationContent>) => Promise<unknown>) {
  await db.execAsync('CREATE TABLE IF NOT EXISTS payment_notification_receipts (payment_id INTEGER PRIMARY KEY, sent_at TEXT NOT NULL);');
  const groups = groupPenaltyPayments(payments.filter((payment) => payment.status === 'succeeded'));
  for (const group of groups) {
    const unsent: PenaltyPayment[] = [];
    for (const payment of group.payments) {
      if (payment.acknowledgedAt) continue;
      if (await db.getFirstAsync('SELECT payment_id FROM payment_notification_receipts WHERE payment_id = ?', payment.id)) continue;
      unsent.push(payment);
    }
    if (!unsent.length) continue;

    // On a successful retry, update the same notification with the full group's total.
    await send(`nomupay:charged:${group.deadlineAt}`, paymentNotificationContent(group));
    const sentAt = new Date().toISOString();
    // One statement records the entire delivery so a failed write cannot leave partial receipts.
    await db.runAsync(
      `INSERT OR IGNORE INTO payment_notification_receipts (payment_id, sent_at) VALUES ${unsent.map(() => '(?, ?)').join(', ')}`,
      ...unsent.flatMap((payment) => [payment.id, sentAt]),
    );
  }
}
