import type { TransactionDatabase } from '../medications/database-types.ts';
import { isLocalDay, localDay } from '../medications/local-date.ts';
import { REMINDER_PREFIX, reminderMedicationId } from '../reminders/reminder-plan.ts';
import { resolveVerificationEntry } from './verification-entry.ts';

// Keep the delivered occurrence, never substitute today's next dose. Older
// reservations can recover the day from their stable notification identifier.
export function doseReminderOccurrence(data: Record<string, unknown> | undefined, identifier: string, deliveredAt: Date) {
  const medicationId = reminderMedicationId(data);
  const identity = identifier.startsWith(REMINDER_PREFIX)
    ? identifier.slice(REMINDER_PREFIX.length).match(/^(\d+):(\d{4}-\d{2}-\d{2}):[^:]+$/) : null;
  const payloadDay = typeof data?.scheduledDay === 'string' && isLocalDay(data.scheduledDay) ? data.scheduledDay : undefined;
  const identifierDay = identity && isLocalDay(identity[2]) ? identity[2] : undefined;
  const invalid = medicationId === null || (identity && Number(identity[1]) !== medicationId)
    || (payloadDay && identifierDay && payloadDay !== identifierDay);
  return {
    medicationId: invalid ? 0 : medicationId,
    scheduledDay: payloadDay ?? identifierDay ?? (Number.isFinite(deliveredAt.getTime()) ? localDay(deliveredAt) : ''),
    ...(data?.pattern === 'at-dose' && typeof data.fireAt === 'string' ? { expectedDoseAt: data.fireAt } : {}),
  };
}

export async function doseReminderDestination(db: TransactionDatabase, input: ReturnType<typeof doseReminderOccurrence>, now = new Date()) {
  const decision = await resolveVerificationEntry(db, input, now);
  // A closed occurrence must NEVER navigate to a route that can mount NFC/QR.
  // The result screen rereads the DB before showing/acknowledging a payment.
  return decision.kind === 'ready' ? '/verify' as const : '/verification-result' as const;
}
