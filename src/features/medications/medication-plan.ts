import { isLocalDay, scheduledDate, localDay } from './dose-record.ts';
import { isGraceBeforeMinutes, isGraceMinutes, medicationGraceBeforeMinutes } from './grace-period.ts';
import { MedicationValidationError, validateMedicationInput, type MedicationPlanInput } from './medication.ts';

export function followingDay(day: string): string {
  const date = scheduledDate(day, '12:00');
  date.setDate(date.getDate() + 1);
  return localDay(date);
}

// Registration and editing use the same normalization and validation contract.
export function validateMedicationPlan(input: MedicationPlanInput) {
  const inventory = input.inventory.normalize('NFKC').trim();
  const unit = input.unit.trim();
  if (!input.doses.length) throw new Error('服用時間を1件以上追加してください。');
  if (!isLocalDay(input.startDay) || (input.endDay !== null && (!isLocalDay(input.endDay) || input.endDay < input.startDay))) throw new Error('服用期間を確認してください。');
  if (!unit || Array.from(unit).length > 20) throw new Error('服用量の単位を入力してください。');
  if (inventory && (!/^\d+$/.test(inventory) || !Number.isSafeInteger(Number(inventory)))) throw new Error('在庫は0以上の整数で入力してください。');
  if (Array.from(input.memo).length > 500) throw new Error('メモは500文字以内で入力してください。');
  if (!isGraceMinutes(input.graceMinutes)) throw new Error('後の執行猶予時間は5分から60分の間で、5分刻みで選択してください。');
  const graceBeforeMinutes = medicationGraceBeforeMinutes(input.graceBeforeMinutes);
  if (!isGraceBeforeMinutes(graceBeforeMinutes)) throw new Error('前の猶予は0〜60分の間で、5分刻みで選択してください。');
  const doses = input.doses.map((dose) => {
    const parsed = validateMedicationInput({ name: input.name, doseTime: dose.doseTime, penaltyAmount: input.penaltyAmount });
    if (!parsed.success) throw new MedicationValidationError(parsed.errors);
    const amount = dose.doseAmount.normalize('NFKC').trim();
    if (!/^\d+(?:\.\d+)?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('服用量は0より大きい数で入力してください。');
    if (dose.medicationId !== undefined && (!Number.isSafeInteger(dose.medicationId) || dose.medicationId <= 0)) throw new Error('服用時間の情報を読み込み直してください。');
    return { ...parsed.value, medicationId: dose.medicationId, doseAmount: Number(amount) };
  }).sort((a, b) => a.doseTime.localeCompare(b.doseTime));
  if (new Set(doses.map((dose) => dose.doseTime)).size !== doses.length) throw new Error('同じ服用時間が重複しています。');
  const ids = doses.flatMap((dose) => dose.medicationId === undefined ? [] : [dose.medicationId]);
  if (new Set(ids).size !== ids.length) throw new Error('服用時間の情報が重複しています。');
  return { doses, unit, inventory: inventory ? Number(inventory) : null, memo: input.memo.trim(), graceBeforeMinutes };
}
