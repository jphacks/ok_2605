import type { MedicationDatabase } from '../medications/medication-repository.ts';
import type { PenaltyPayment } from '../payments/penalty-repository.ts';
import { paymentNotificationContent } from './reminder-plan.ts';

// Serialized by the caller; a receipt prevents repeat notifications on restart.
export async function deliverPaymentNotifications(db: MedicationDatabase, payments: PenaltyPayment[], send: (id: string, content: ReturnType<typeof paymentNotificationContent>) => Promise<unknown>) {
  await db.execAsync('CREATE TABLE IF NOT EXISTS payment_notification_receipts (payment_id INTEGER PRIMARY KEY, sent_at TEXT NOT NULL);');
  for (const payment of payments) {
    if (payment.status !== 'succeeded' || payment.acknowledgedAt) continue;
    if (await db.getFirstAsync('SELECT payment_id FROM payment_notification_receipts WHERE payment_id = ?', payment.id)) continue;
    await send(`nomupay:charged:${payment.id}`, paymentNotificationContent(payment));
    await db.runAsync('INSERT OR IGNORE INTO payment_notification_receipts (payment_id, sent_at) VALUES (?, ?)', payment.id, new Date().toISOString());
  }
}
