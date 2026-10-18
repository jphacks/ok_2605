import { localDay, scheduledDate } from '../medications/dose-record.ts';
import { saveDoseRecord } from '../medications/dose-record-repository.ts';
import { medicationQrPayload } from '../medications/medication-lifecycle.ts';
import type { Medication } from '../medications/medication.ts';
import { inTransaction, type TransactionDatabase } from '../medications/transaction.ts';
import { doseDeadline } from '../payments/penalty-repository.ts';

export async function confirmQrDose(db: TransactionDatabase, medicationId: number, day: string, payload: string, now = new Date(), demo = false) {
  if (!Number.isSafeInteger(medicationId) || medicationId <= 0 || day !== localDay(now)) throw new Error('ホームから今日の服薬予定を選び直してください。');
  return inTransaction(db, async (transaction) => {
    const medication = await transaction.getFirstAsync<Medication>(`SELECT m.id, m.name, m.dose_time AS doseTime,
      m.penalty_amount AS penaltyAmount, m.created_at AS createdAt FROM medications m
      JOIN medication_details d ON d.medication_id = m.id WHERE m.id = ? AND d.archived_at IS NULL`, medicationId);
    if (!medication) throw new Error('登録された薬が見つかりません。');
    if (!demo && payload !== await medicationQrPayload(transaction, medicationId)) throw new Error('対象のお薬のQRコードではありません。お薬ごとのQRコードを確認してください。');
    const scheduledAt = scheduledDate(day, medication.doseTime);
    if (now.getTime() < scheduledAt.getTime()) throw new Error(`${medication.doseTime}から記録できます。`);
    if (now.getTime() >= doseDeadline(day, medication.doseTime).getTime()) throw new Error('服薬確認の期限を過ぎました。ホームで飲み忘れの結果を確認してください。');
    const record = await saveDoseRecord(transaction, medicationId, day, demo ? 'demo' : 'qr', now.toISOString());
    return { record, medication };
  });
}
