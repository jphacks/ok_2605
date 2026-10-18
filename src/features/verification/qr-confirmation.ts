import { localDay, scheduledDate } from '../medications/dose-record.ts';
import { saveDoseRecord } from '../medications/dose-record-repository.ts';
import { deviceQrPayload } from '../boxes/medicine-box-repository.ts';
import type { Medication } from '../medications/medication.ts';
import { inTransaction, type TransactionDatabase } from '../medications/transaction.ts';
import { doseDeadline } from '../payments/penalty-repository.ts';
import { medicationGraceMinutes } from '../medications/grace-period.ts';

export async function confirmQrDose(db: TransactionDatabase, medicationId: number, day: string, payload: string, now = new Date(), demo = false) {
  if (!Number.isSafeInteger(medicationId) || medicationId <= 0 || day !== localDay(now)) throw new Error('ホームから今日の服薬予定を選び直してください。');
  return inTransaction(db, async (transaction) => {
    const medication = await transaction.getFirstAsync<Medication>(`SELECT m.id, m.name, m.dose_time AS doseTime,
      m.penalty_amount AS penaltyAmount, m.created_at AS createdAt,
      COALESCE(g.grace_minutes, 30) AS graceMinutes FROM medications m
      JOIN medication_details d ON d.medication_id = m.id
      LEFT JOIN medication_group_doses gd ON gd.medication_id = m.id
      LEFT JOIN medication_groups g ON g.id = gd.group_id
      WHERE m.id = ? AND d.archived_at IS NULL
        AND (g.is_plan IS NOT 1 OR (? >= g.starts_on AND (g.ends_on IS NULL OR ? <= g.ends_on)))`, medicationId, day, day);
    if (!medication) throw new Error('登録された薬が見つかりません。');
    if (!demo && payload !== await deviceQrPayload(transaction)) throw new Error('この端末のQRコードではありません。薬箱画面の端末共通QRコードを確認してください。');
    const scheduledAt = scheduledDate(day, medication.doseTime);
    if (now.getTime() < scheduledAt.getTime()) throw new Error(`${medication.doseTime}から記録できます。`);
    if (now.getTime() >= doseDeadline(day, medication.doseTime, medicationGraceMinutes(medication.graceMinutes)).getTime()) throw new Error('服薬確認の期限を過ぎました。ホームで飲み忘れの結果を確認してください。');
    const record = await saveDoseRecord(transaction, medicationId, day, demo ? 'demo' : 'qr', now.toISOString());
    return { record, medication };
  });
}
