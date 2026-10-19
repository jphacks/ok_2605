import { assignMedicineBox } from '../boxes/medicine-box-repository.ts';
import type { MedicationDatabase, TransactionDatabase } from './database-types.ts';
import { followingDay, scheduledDate } from './local-date.ts';
import {
  MedicationValidationError,
  validateMedicationInput,
  type Medication,
  type MedicationInput,
  type MedicationPlanInput,
} from './medication.ts';
import { validateMedicationPlan } from './medication-plan.ts';
import { inTransaction } from './transaction.ts';

// Preserve the repository's public entry points for existing callers.
export { initializeMedicationDatabase } from './medication-schema.ts';
export type { MedicationDatabase } from './database-types.ts';

export async function listMedications(db: MedicationDatabase): Promise<Medication[]> {
  const rows = await db.getAllAsync<Medication & {
    isPlan: number; rawNotificationsEnabled: number;
  }>(`
    SELECT m.id, m.name, m.dose_time AS doseTime, m.penalty_amount AS penaltyAmount,
      m.created_at AS createdAt,
      (SELECT s.starts_at FROM medication_schedules s WHERE s.medication_id = m.id ORDER BY s.id DESC LIMIT 1) AS scheduleStartsAt,
      g.id AS groupId, gd.dose_amount AS doseAmount,
      g.unit, g.starts_on AS activeStartDay, g.ends_on AS activeEndDay, g.grace_minutes AS graceMinutes, g.grace_before_minutes AS graceBeforeMinutes,
      g.notifications_enabled AS rawNotificationsEnabled, g.is_plan AS isPlan
    FROM medications m
    LEFT JOIN medication_group_doses gd ON gd.medication_id = m.id
    LEFT JOIN medication_groups g ON g.id = gd.group_id
    WHERE m.id IN (SELECT medication_id FROM medication_details WHERE archived_at IS NULL)
    ORDER BY m.dose_time ASC, m.id ASC
  `);
  return rows.map((row) => {
    const { isPlan, rawNotificationsEnabled, ...medication } = row;
    if (!isPlan) {
      const { groupId: _groupId, doseAmount: _doseAmount, unit: _unit,
        activeStartDay: _activeStartDay, activeEndDay: _activeEndDay,
        graceMinutes: _graceMinutes, graceBeforeMinutes: _graceBeforeMinutes, ...legacy } = medication;
      return legacy;
    }
    return { ...medication, notificationsEnabled: rawNotificationsEnabled === 1 };
  });
}

export async function saveMedication(db: MedicationDatabase, input: MedicationInput): Promise<Medication> {
  const result = validateMedicationInput(input);
  if (!result.success) {
    throw new MedicationValidationError(result.errors);
  }

  const { name, doseTime, penaltyAmount } = result.value;
  const createdAt = new Date().toISOString();
  const { lastInsertRowId } = await db.runAsync(
    'INSERT INTO medications (name, dose_time, penalty_amount, created_at) VALUES (?, ?, ?, ?)',
    name,
    doseTime,
    penaltyAmount,
    createdAt,
  );

  // The INSERT has committed. A separate list query must not turn success into a retryable failure.
  return { id: lastInsertRowId, name, doseTime, penaltyAmount, createdAt, scheduleStartsAt: createdAt };
}

export async function saveMedicationPlan(db: TransactionDatabase, input: MedicationPlanInput): Promise<Medication[]> {
  const { doses: parsedDoses, inventory, unit, memo, graceBeforeMinutes } = validateMedicationPlan(input);

  return inTransaction(db, async (transaction) => {
    const createdAt = new Date().toISOString();
    // A backdated period must not make already-passed dose times billable.
    // Keep the actual registration time separate from a future period's start.
    const startsAt = new Date(Math.max(Date.parse(createdAt), scheduledDate(input.startDay, '00:00').getTime())).toISOString();
    const saved: Medication[] = [];
    let groupId = 0;
    for (const dose of parsedDoses.sort((a, b) => a.doseTime.localeCompare(b.doseTime))) {
      const inserted = await transaction.runAsync(
        'INSERT INTO medications (name, dose_time, penalty_amount, created_at) VALUES (?, ?, ?, ?)',
        dose.name, dose.doseTime, dose.penaltyAmount, createdAt,
      );
      const medicationId = inserted.lastInsertRowId;
      if (!groupId) {
        groupId = medicationId;
        await transaction.runAsync(`UPDATE medication_groups SET name = ?, unit = ?, inventory = ?, memo = ?,
          starts_on = ?, ends_on = ?, notifications_enabled = ?, grace_minutes = ?, grace_before_minutes = ?, is_plan = 1, created_at = ? WHERE id = ?`,
        dose.name, unit, inventory, memo, input.startDay, input.endDay,
        input.notificationsEnabled ? 1 : 0, input.graceMinutes, graceBeforeMinutes, createdAt, groupId);
      } else {
        await transaction.runAsync('DELETE FROM medication_group_doses WHERE medication_id = ?', medicationId);
        await transaction.runAsync('DELETE FROM medication_groups WHERE id = ?', medicationId);
        await transaction.runAsync('INSERT INTO medication_group_doses (medication_id, group_id, dose_amount) VALUES (?, ?, ?)', medicationId, groupId, dose.doseAmount);
      }
      if (medicationId === groupId) {
        await transaction.runAsync('UPDATE medication_group_doses SET dose_amount = ? WHERE medication_id = ?', dose.doseAmount, medicationId);
      }
      const doseEndsAt = input.endDay
        ? scheduledDate(followingDay(input.endDay), dose.doseTime).toISOString()
        : null;
      await transaction.runAsync('UPDATE medication_schedules SET starts_at = ?, ends_at = ?, grace_minutes = ?, grace_before_minutes = ? WHERE medication_id = ?', startsAt, doseEndsAt, input.graceMinutes, graceBeforeMinutes, medicationId);
      if (input.boxId !== undefined) await assignMedicineBox(transaction, medicationId, Number(input.boxId));
      saved.push({
        id: medicationId, name: dose.name, doseTime: dose.doseTime, penaltyAmount: dose.penaltyAmount,
        createdAt, scheduleStartsAt: startsAt, groupId, doseAmount: dose.doseAmount, unit,
        activeStartDay: input.startDay, activeEndDay: input.endDay,
        notificationsEnabled: input.notificationsEnabled, graceMinutes: input.graceMinutes, graceBeforeMinutes,
      });
    }
    return saved;
  });
}
