import { localDay, scheduledDate } from '../medications/dose-record.ts';
import type { MedicationDatabase } from '../medications/medication-repository.ts';
import { inTransaction, type TransactionDatabase } from '../medications/transaction.ts';

export const GRACE_MINUTES = 30;
export function doseDeadline(day: string, time: string): Date {
  return new Date(scheduledDate(day, time).getTime() + GRACE_MINUTES * 60_000);
}

export type PenaltyPayment = {
  id: number; medicationId: number; medicationName: string; scheduledDay: string;
  doseTime: string; deadlineAt: string; amount: number; mode: 'test';
  status: 'succeeded' | 'failed'; errorMessage: string | null;
  acknowledgedAt: string | null; createdAt: string;
};
type Schedule = {
  id: number; medicationId: number; name: string; doseTime: string; penaltyAmount: number;
  startsAt: string; endsAt: string | null; checkedDay: string | null;
};
const columns = `id, medication_id AS medicationId, medication_name AS medicationName,
  scheduled_day AS scheduledDay, dose_time AS doseTime, deadline_at AS deadlineAt,
  amount, mode, status, error_message AS errorMessage, acknowledged_at AS acknowledgedAt, created_at AS createdAt`;

export function listPenaltyPayments(db: MedicationDatabase): Promise<PenaltyPayment[]> {
  return db.getAllAsync<PenaltyPayment>(`SELECT ${columns} FROM penalty_payments ORDER BY scheduled_day DESC, dose_time DESC, id DESC`);
}

function followingDay(day: string): string {
  const date = scheduledDate(day, '12:00');
  date.setDate(date.getDate() + 1);
  return localDay(date);
}

// Local test settlement only. A production adapter must settle server-side with consent,
// payment-method registration, provider idempotency keys and verified webhooks.
async function settle(db: MedicationDatabase, id: number, outcome: 'success' | 'failure', now: Date) {
  const status = outcome === 'success' ? 'succeeded' : 'failed';
  const message = status === 'failed' ? 'テスト決済に失敗しました。再試行してください。' : null;
  await db.runAsync('INSERT INTO penalty_attempts (payment_id, status, error_message, created_at) VALUES (?, ?, ?, ?)', id, status, message, now.toISOString());
  await db.runAsync('UPDATE penalty_payments SET status = ?, error_message = ?, acknowledged_at = NULL WHERE id = ?', status, message, id);
}

export async function reconcilePenalties(db: TransactionDatabase, now = new Date(), outcome: 'success' | 'failure' = 'success') {
  if (!Number.isFinite(now.getTime())) throw new Error('現在時刻を確認できません。');
  return inTransaction(db, async (transaction) => {
    await reconcileInTransaction(transaction, now, outcome);
    return listPenaltyPayments(transaction);
  });
}

// Also used before schedule edits/deletion so earlier missed occurrences keep their original amount.
export async function reconcileInTransaction(db: MedicationDatabase, now: Date, outcome: 'success' | 'failure' = 'success') {
  const schedules = await db.getAllAsync<Schedule>(`SELECT id, medication_id AS medicationId, name,
    dose_time AS doseTime, penalty_amount AS penaltyAmount, starts_at AS startsAt,
    ends_at AS endsAt, checked_day AS checkedDay FROM medication_schedules`);
  const today = localDay(now);
  for (const schedule of schedules) {
    const start = new Date(schedule.startsAt);
    const end = schedule.endsAt ? new Date(schedule.endsAt) : null;
    if (!Number.isFinite(start.getTime())) continue;
    let day = schedule.checkedDay ? followingDay(schedule.checkedDay) : localDay(start);
    let checked = schedule.checkedDay;
    // A cursor makes repeated foreground checks independent of the length of saved history.
    while (day <= today) {
      const at = scheduledDate(day, schedule.doseTime);
      const deadline = doseDeadline(day, schedule.doseTime);
      if (end && at.getTime() >= end.getTime()) break;
      if (deadline.getTime() > now.getTime()) break;
      if (at.getTime() >= start.getTime() && (!end || deadline.getTime() <= end.getTime())) {
        const taken = await db.getFirstAsync<{ takenAt: string }>('SELECT taken_at AS takenAt FROM dose_records WHERE medication_id = ? AND scheduled_day = ?', schedule.medicationId, day);
        const onTime = taken && Date.parse(taken.takenAt) < deadline.getTime();
        if (!onTime) {
          const inserted = await db.runAsync(`INSERT OR IGNORE INTO penalty_payments
            (medication_id, medication_name, scheduled_day, dose_time, deadline_at, amount, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`, schedule.medicationId, schedule.name, day,
          schedule.doseTime, deadline.toISOString(), schedule.penaltyAmount, now.toISOString());
          if (inserted.changes) await settle(db, inserted.lastInsertRowId, outcome, now);
        }
      }
      checked = day;
      day = followingDay(day);
    }
    if (checked !== schedule.checkedDay) await db.runAsync('UPDATE medication_schedules SET checked_day = ? WHERE id = ?', checked, schedule.id);
  }
}

export async function acknowledgePenalties(db: TransactionDatabase, ids: number[]) {
  await inTransaction(db, async (transaction) => {
    const now = new Date().toISOString();
    for (const id of ids) await transaction.runAsync('UPDATE penalty_payments SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL', now, id);
  });
}

export async function retryPenaltyPayment(db: TransactionDatabase, id: number, outcome: 'success' | 'failure' = 'success') {
  return inTransaction(db, async (transaction) => {
    const payment = await transaction.getFirstAsync<PenaltyPayment>(`SELECT ${columns} FROM penalty_payments WHERE id = ?`, id);
    if (!payment) throw new Error('決済履歴が見つかりません。');
    if (payment.status !== 'succeeded') await settle(transaction, id, outcome, new Date());
    return listPenaltyPayments(transaction);
  });
}
