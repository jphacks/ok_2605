import { inTransaction, type TransactionDatabase } from './transaction.ts';
import { listMedications } from './medication-repository.ts';
import type { MedicationDatabase } from './database-types.ts';
import { validateMedicationPlan } from './medication-plan.ts';
import { followingDay, localDay, scheduledDate } from './local-date.ts';
import type { Medication, MedicationPlanInput } from './medication.ts';
import { assignMedicineBox } from '../boxes/medicine-box-repository.ts';
import { reconcileInTransaction } from '../payments/penalty-repository.ts';

type Group = {
  id: number; name: string; unit: string; inventory: number | null; memo: string;
  startsOn: string; endsOn: string | null; notificationsEnabled: number;
  graceMinutes: number; graceBeforeMinutes: number; isPlan: number; createdAt: string;
};
type Dose = { id: number; name: string; doseTime: string; doseAmount: number; penaltyAmount: number };

async function readGroup(db: MedicationDatabase, medicationId: number) {
  const group = await db.getFirstAsync<Group>(`SELECT g.id, m.name, g.unit, g.inventory, g.memo,
    g.starts_on AS startsOn, g.ends_on AS endsOn, g.notifications_enabled AS notificationsEnabled,
    g.grace_minutes AS graceMinutes, g.grace_before_minutes AS graceBeforeMinutes,
    g.is_plan AS isPlan, m.created_at AS createdAt
    FROM medications m JOIN medication_details d ON d.medication_id = m.id
    JOIN medication_group_doses gd ON gd.medication_id = m.id
    JOIN medication_groups g ON g.id = gd.group_id
    WHERE m.id = ? AND d.archived_at IS NULL`, medicationId);
  if (!group) throw new Error('登録された薬が見つかりません。');
  const doses = await db.getAllAsync<Dose>(`SELECT m.id, m.name, m.dose_time AS doseTime,
    m.penalty_amount AS penaltyAmount, gd.dose_amount AS doseAmount
    FROM medications m JOIN medication_group_doses gd ON gd.medication_id = m.id
    JOIN medication_details d ON d.medication_id = m.id
    WHERE gd.group_id = ? AND d.archived_at IS NULL ORDER BY m.dose_time, m.id`, group.id);
  return { group, doses };
}

export async function loadMedicationPlan(db: TransactionDatabase, medicationId: number): Promise<MedicationPlanInput> {
  return inTransaction(db, async (transaction) => {
    const { group, doses } = await readGroup(transaction, medicationId);
    const box = await transaction.getFirstAsync<{ boxId: number }>('SELECT box_id AS boxId FROM medicine_box_assignments WHERE medication_id = ?', medicationId);
    const selected = doses.find((dose) => dose.id === medicationId)!;
    return {
      boxId: box ? String(box.boxId) : '', name: group.name,
      doses: doses.map((dose) => ({ medicationId: dose.id, doseTime: dose.doseTime, doseAmount: String(dose.doseAmount) })),
      penaltyAmount: String(selected.penaltyAmount), unit: group.unit,
      inventory: group.inventory === null ? '' : String(group.inventory), memo: group.memo,
      startDay: group.isPlan ? group.startsOn : localDay(new Date(group.createdAt)), endDay: group.endsOn,
      notificationsEnabled: group.notificationsEnabled === 1,
      graceMinutes: group.graceMinutes, graceBeforeMinutes: group.graceBeforeMinutes,
    };
  });
}

async function closeSchedules(db: MedicationDatabase, medicationId: number, now: string) {
  // Keep completed snapshots and their original amounts/deadlines intact.
  await db.runAsync(`UPDATE medication_schedules SET ends_at = ?
    WHERE medication_id = ? AND (ends_at IS NULL OR ends_at > ?)`, now, medicationId, now);
}

export async function updateMedicationPlan(db: TransactionDatabase, medicationId: number, input: MedicationPlanInput, now = new Date()): Promise<Medication[]> {
  const parsed = validateMedicationPlan(input);
  if (!Number.isFinite(now.getTime())) throw new Error('現在時刻を確認できません。');
  return inTransaction(db, async (transaction) => {
    const { group, doses: current } = await readGroup(transaction, medicationId);
    const oldIds = new Set(current.map((dose) => dose.id));
    for (const dose of parsed.doses) {
      if (dose.medicationId !== undefined && !oldIds.has(dose.medicationId)) throw new Error('別のお薬の服用時間は編集できません。画面を読み込み直してください。');
    }
    const claimed = new Set(parsed.doses.flatMap((dose) => dose.medicationId === undefined ? [] : [dose.medicationId]));
    const wanted = parsed.doses.map((dose) => {
      if (dose.medicationId !== undefined) return dose;
      const existing = current.find((item) => item.doseTime === dose.doseTime && !claimed.has(item.id));
      if (existing) claimed.add(existing.id);
      return { ...dose, medicationId: existing?.id };
    });
    const assignment = input.boxId === undefined
      ? await transaction.getFirstAsync<{ boxId: number }>('SELECT box_id AS boxId FROM medicine_box_assignments WHERE medication_id = ?', medicationId)
      : { boxId: Number(input.boxId) };
    if (!assignment) throw new Error('薬箱を選択してください。');
    // Validation and all following writes belong to the same transaction.
    await assignMedicineBox(transaction, medicationId, assignment.boxId);
    await reconcileInTransaction(transaction, now);
    const nowIso = now.toISOString();
    const startsAt = new Date(Math.max(now.getTime(), scheduledDate(input.startDay, '00:00').getTime())).toISOString();
    const commonScheduleChanged = input.startDay !== group.startsOn || input.endDay !== group.endsOn
      || input.graceMinutes !== group.graceMinutes || parsed.graceBeforeMinutes !== group.graceBeforeMinutes;

    for (const previous of current) {
      if (claimed.has(previous.id)) continue;
      await transaction.runAsync('UPDATE medication_details SET archived_at = ? WHERE medication_id = ?', nowIso, previous.id);
      await closeSchedules(transaction, previous.id, nowIso);
    }
    await transaction.runAsync(`UPDATE medication_groups SET name = ?, unit = ?, inventory = ?, memo = ?, starts_on = ?, ends_on = ?,
      notifications_enabled = ?, grace_minutes = ?, grace_before_minutes = ?, is_plan = 1 WHERE id = ?`,
    wanted[0].name, parsed.unit, parsed.inventory, parsed.memo, input.startDay, input.endDay,
    input.notificationsEnabled ? 1 : 0, input.graceMinutes, parsed.graceBeforeMinutes, group.id);

    for (const dose of wanted) {
      const previous = current.find((item) => item.id === dose.medicationId);
      let id = dose.medicationId;
      const endsAt = input.endDay ? scheduledDate(followingDay(input.endDay), dose.doseTime).toISOString() : null;
      if (id === undefined) {
        const inserted = await transaction.runAsync('INSERT INTO medications (name, dose_time, penalty_amount, created_at) VALUES (?, ?, ?, ?)', dose.name, dose.doseTime, dose.penaltyAmount, startsAt);
        id = inserted.lastInsertRowId;
        // The registration trigger creates a temporary single-dose group; attach this dose to the edited group.
        await transaction.runAsync('DELETE FROM medication_group_doses WHERE medication_id = ?', id);
        await transaction.runAsync('DELETE FROM medication_groups WHERE id = ?', id);
        await transaction.runAsync('INSERT INTO medication_group_doses (medication_id, group_id, dose_amount) VALUES (?, ?, ?)', id, group.id, dose.doseAmount);
        await transaction.runAsync(`UPDATE medication_schedules SET starts_at = ?, ends_at = ?, grace_minutes = ?, grace_before_minutes = ? WHERE medication_id = ?`, startsAt, endsAt, input.graceMinutes, parsed.graceBeforeMinutes, id);
      } else {
        const scheduleChanged = commonScheduleChanged || !previous || previous.name !== dose.name
          || previous.doseTime !== dose.doseTime || previous.penaltyAmount !== dose.penaltyAmount;
        if (scheduleChanged) {
          await closeSchedules(transaction, id, nowIso);
          await transaction.runAsync(`INSERT INTO medication_schedules (medication_id, name, dose_time, penalty_amount, starts_at, ends_at, grace_minutes, grace_before_minutes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, dose.name, dose.doseTime, dose.penaltyAmount, startsAt, endsAt, input.graceMinutes, parsed.graceBeforeMinutes);
        }
        await transaction.runAsync('UPDATE medications SET name = ?, dose_time = ?, penalty_amount = ? WHERE id = ?', dose.name, dose.doseTime, dose.penaltyAmount, id);
        await transaction.runAsync('UPDATE medication_group_doses SET dose_amount = ? WHERE medication_id = ?', dose.doseAmount, id);
      }
      await assignMedicineBox(transaction, id, assignment.boxId);
    }
    return (await listMedications(transaction)).filter((dose) => dose.groupId === group.id);
  });
}

export async function archiveMedicationPlan(db: TransactionDatabase, medicationId: number, now = new Date()): Promise<number> {
  return inTransaction(db, async (transaction) => {
    const { group, doses } = await readGroup(transaction, medicationId);
    await reconcileInTransaction(transaction, now);
    for (const dose of doses) {
      await transaction.runAsync('UPDATE medication_details SET archived_at = ? WHERE medication_id = ?', now.toISOString(), dose.id);
      await closeSchedules(transaction, dose.id, now.toISOString());
    }
    return group.id;
  });
}
