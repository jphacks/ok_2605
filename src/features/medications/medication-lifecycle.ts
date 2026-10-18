import { inTransaction, type TransactionDatabase } from './transaction.ts';
import type { MedicationDatabase } from './medication-repository.ts';
import { MedicationValidationError, validateMedicationInput, type Medication, type MedicationInput } from './medication.ts';
import { reconcileInTransaction } from '../payments/penalty-repository.ts';
import { assignMedicineBox } from '../boxes/medicine-box-repository.ts';

export type HistoricalMedication = Medication & { endedAt?: string | null };

export function listMedicationSchedules(db: MedicationDatabase): Promise<HistoricalMedication[]> {
  return db.getAllAsync<HistoricalMedication>(`SELECT medication_id AS id, name, dose_time AS doseTime,
    penalty_amount AS penaltyAmount, starts_at AS createdAt, ends_at AS endedAt
    FROM medication_schedules ORDER BY starts_at ASC, id ASC`);
}

export async function editMedication(db: TransactionDatabase, id: number, input: MedicationInput, now = new Date()): Promise<Medication> {
  const parsed = validateMedicationInput(input);
  if (!parsed.success) throw new MedicationValidationError(parsed.errors);
  return inTransaction(db, async (transaction) => {
    const medication = await transaction.getFirstAsync<Medication>(`SELECT m.id, m.name, m.dose_time AS doseTime,
      m.penalty_amount AS penaltyAmount, m.created_at AS createdAt FROM medications m
      JOIN medication_details d ON d.medication_id = m.id WHERE m.id = ? AND d.archived_at IS NULL`, id);
    if (!medication) throw new Error('登録された薬が見つかりません。');
    if (input.boxId !== undefined) await assignMedicineBox(transaction, id, Number(input.boxId));
    const { name, doseTime, penaltyAmount } = parsed.value;
    if (name === medication.name && doseTime === medication.doseTime && penaltyAmount === medication.penaltyAmount) return medication;
    await reconcileInTransaction(transaction, now);
    await transaction.runAsync('UPDATE medication_schedules SET ends_at = ? WHERE medication_id = ? AND ends_at IS NULL', now.toISOString(), id);
    await transaction.runAsync('UPDATE medications SET name = ?, dose_time = ?, penalty_amount = ? WHERE id = ?', name, doseTime, penaltyAmount, id);
    await transaction.runAsync(`INSERT INTO medication_schedules (medication_id, name, dose_time, penalty_amount, starts_at)
      VALUES (?, ?, ?, ?, ?)`, id, name, doseTime, penaltyAmount, now.toISOString());
    return { ...medication, name, doseTime, penaltyAmount };
  });
}

export async function archiveMedication(db: TransactionDatabase, id: number, now = new Date()) {
  await inTransaction(db, async (transaction) => {
    await reconcileInTransaction(transaction, now);
    await transaction.runAsync('UPDATE medication_details SET archived_at = ? WHERE medication_id = ? AND archived_at IS NULL', now.toISOString(), id);
    await transaction.runAsync('UPDATE medication_schedules SET ends_at = ? WHERE medication_id = ? AND ends_at IS NULL', now.toISOString(), id);
  });
}
