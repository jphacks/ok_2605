import type { TransactionDatabase } from '../medications/database-types.ts';
import { isLocalDay, nearbyScheduledDays, scheduledDate } from '../medications/local-date.ts';
import { listMedications } from '../medications/medication-repository.ts';
import { isMedicationActiveOnDay } from '../medications/medication.ts';
import { doseDeadline, doseStartsAt } from '../medications/dose-timing.ts';
import { inTransaction } from '../medications/transaction.ts';
import { reconcileInTransaction } from '../payments/penalty-repository.ts';
import { reminderMedicationId } from '../reminders/reminder-plan.ts';

export type VerificationEntry =
  | { kind: 'ready'; medicationName: string; deadlineAt: string }
  | { kind: 'payment'; medicationName: string; paymentId: number }
  | { kind: 'taken' | 'expired' | 'not-started' | 'unavailable'; medicationName: string };

export function isDoseReminder(data: Record<string, unknown> | undefined): boolean {
  return reminderMedicationId(data) !== null && data?.demo !== true
    && data?.pattern !== 'deadline' && data?.pattern !== 'charged';
}

// The foreground coordinator must not redirect before the tapped occurrence has
// been checked. Other pending payments are still shown after returning home.
export function isReminderVerification(pathname: string, fromReminder: unknown): boolean {
  return (pathname === '/verify' || pathname === '/qr' || pathname === '/verification-result') && fromReminder === '1';
}

// Read the saved occurrence at tap time, never the notification's delivery time
// or a stale React snapshot. Reconciliation uses the existing unique payment key
// and transaction queue, shared with startup checks and acknowledgements.
export async function resolveVerificationEntry(db: TransactionDatabase, input: {
  medicationId: number; scheduledDay: string; expectedDoseAt?: string;
}, now = new Date()): Promise<VerificationEntry> {
  const { medicationId, scheduledDay: day, expectedDoseAt } = input;
  const unavailable = { kind: 'unavailable', medicationName: '' } as const;
  if (!Number.isSafeInteger(medicationId) || medicationId <= 0 || !isLocalDay(day)
    || !Number.isFinite(now.getTime()) || (expectedDoseAt !== undefined && !Number.isFinite(Date.parse(expectedDoseAt)))) return unavailable;
  return inTransaction(db, async (transaction) => {
    const stored = await transaction.getFirstAsync<{ name: string }>('SELECT name FROM medications WHERE id = ?', medicationId);
    if (!stored) return unavailable;
    await reconcileInTransaction(transaction, now);
    const payment = await transaction.getFirstAsync<{ id: number; acknowledgedAt: string | null }>(
      'SELECT id, acknowledged_at AS acknowledgedAt FROM penalty_payments WHERE medication_id = ? AND scheduled_day = ?', medicationId, day,
    );
    if (payment) return payment.acknowledgedAt
      ? { kind: 'expired', medicationName: stored.name }
      : { kind: 'payment', medicationName: stored.name, paymentId: payment.id };
    const recorded = await transaction.getFirstAsync('SELECT id FROM dose_records WHERE medication_id = ? AND scheduled_day = ?', medicationId, day);
    if (recorded) return { kind: 'taken', medicationName: stored.name };
    const medication = (await listMedications(transaction)).find((item) => item.id === medicationId);
    if (!medication || !isMedicationActiveOnDay(medication, day) || !nearbyScheduledDays(now).includes(day)) return { ...unavailable, medicationName: stored.name };
    const at = scheduledDate(day, medication.doseTime);
    // An old at-dose notification must not open a newly edited time slot.
    if (expectedDoseAt !== undefined && Date.parse(expectedDoseAt) !== at.getTime()) return { ...unavailable, medicationName: stored.name };
    const deadline = doseDeadline(day, medication.doseTime, medication.graceMinutes);
    if (now.getTime() >= deadline.getTime()) return { kind: 'expired', medicationName: stored.name };
    if (now.getTime() < doseStartsAt(day, medication.doseTime, medication.graceBeforeMinutes).getTime()) return { kind: 'not-started', medicationName: stored.name };
    return { kind: 'ready', medicationName: stored.name, deadlineAt: deadline.toISOString() };
  });
}
