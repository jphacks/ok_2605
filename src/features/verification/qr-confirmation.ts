import { nearbyScheduledDays } from '../medications/dose-record.ts';
import { saveDoseRecord } from '../medications/dose-record-repository.ts';
import { deviceQrPayload, listMedicineBoxes } from '../boxes/medicine-box-repository.ts';
import { isMedicationActiveOnDay, type Medication } from '../medications/medication.ts';
import { inTransaction, type TransactionDatabase } from '../medications/transaction.ts';
import { doseDeadline, doseStartsAt } from '../payments/penalty-repository.ts';
import { medicationGraceMinutes, medicationGraceBeforeMinutes } from '../medications/grace-period.ts';

export async function confirmQrDose(db: TransactionDatabase, medicationId: number, day: string, payload: string, now = new Date(), demo = false) {
  if (!Number.isSafeInteger(medicationId) || medicationId <= 0 || !nearbyScheduledDays(now).includes(day)) throw new Error('ホームから今日の服薬予定を選び直してください。');
  return inTransaction(db, async (transaction) => {
    const medication = await transaction.getFirstAsync<Medication>(`SELECT m.id, m.name, m.dose_time AS doseTime,
      m.penalty_amount AS penaltyAmount, m.created_at AS createdAt,
      COALESCE(g.grace_minutes, 30) AS graceMinutes, COALESCE(g.grace_before_minutes, 0) AS graceBeforeMinutes FROM medications m
      JOIN medication_details d ON d.medication_id = m.id
      LEFT JOIN medication_group_doses gd ON gd.medication_id = m.id
      LEFT JOIN medication_groups g ON g.id = gd.group_id
      WHERE m.id = ? AND d.archived_at IS NULL
        AND (g.is_plan IS NOT 1 OR (? >= g.starts_on AND (g.ends_on IS NULL OR ? <= g.ends_on)))`, medicationId, day, day);
    if (!medication) throw new Error('登録された薬が見つかりません。');
    if (!demo && payload !== await deviceQrPayload(transaction)) throw new Error('この端末のQRコードではありません。薬箱画面の端末共通QRコードを確認してください。');
    const scheduledAt = doseStartsAt(day, medication.doseTime, medicationGraceBeforeMinutes(medication.graceBeforeMinutes));
    if (now.getTime() < scheduledAt.getTime()) throw new Error('設定した前の猶予の開始時刻から記録できます。');
    if (now.getTime() >= doseDeadline(day, medication.doseTime, medicationGraceMinutes(medication.graceMinutes)).getTime()) throw new Error('服薬確認の期限を過ぎました。ホームで飲み忘れの結果を確認してください。');
    const record = await saveDoseRecord(transaction, medicationId, day, demo ? 'demo' : 'qr', now.toISOString());
    const boxes = await listMedicineBoxes(transaction);
    const box = boxes.find((box) => box.medications.some((member) => member.id === medicationId));
    const members = box ? box.medications.filter((member) => member.doseTime === medication.doseTime
      && isMedicationActiveOnDay(member, day)
      && now.getTime() >= doseStartsAt(day, member.doseTime, medicationGraceBeforeMinutes(member.graceBeforeMinutes)).getTime()
      && now.getTime() < doseDeadline(day, member.doseTime, medicationGraceMinutes(member.graceMinutes)).getTime()) : [medication];
    for (const member of members) {
      if (member.id !== medicationId) await saveDoseRecord(transaction, member.id, day, demo ? 'demo' : 'qr', now.toISOString());
    }
    return { record, medication, medications: members };
  });
}
