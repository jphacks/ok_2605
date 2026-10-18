import { DEMO_PAYMENT_SCHEMA } from '../payments/demo-payment-schema.ts';
import { initializeDoseRecordSchema } from './dose-record-schema.ts';
import { MEDICATION_LIFECYCLE_SCHEMA } from './medication-lifecycle-schema.ts';
import { PENALTY_SCHEMA } from '../payments/penalty-schema.ts';
import { assignMedicineBox, initializeMedicineBoxes } from '../boxes/medicine-box-repository.ts';
import {
  MIN_PENALTY_AMOUNT,
  MedicationValidationError,
  validateMedicationInput,
  type Medication,
  type MedicationInput,
  type MedicationPlanInput,
} from './medication.ts';
import { inTransaction, type TransactionDatabase } from './transaction.ts';
import { scheduledDate } from './dose-record.ts';
import { followingDay, validateMedicationPlan } from './medication-plan.ts';
import { DEFAULT_GRACE_MINUTES } from './grace-period.ts';

type MedicationDatabaseValue = string | number | null;

// Version 6 shipped the medication lifecycle and box tables. Version 7 adds
// a per-medication grace period; version 8 adds early confirmation without rewriting existing deadlines.
const MEDICATION_DATABASE_VERSION = 8;

// Both expo-sqlite and the real SQLite test adapter implement this contract.
export interface MedicationDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    ...params: MedicationDatabaseValue[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, ...params: MedicationDatabaseValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: MedicationDatabaseValue[]): Promise<T | null>;
}

export async function initializeMedicationDatabase(db: MedicationDatabase): Promise<void> {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((version?.user_version ?? 0) > MEDICATION_DATABASE_VERSION) {
    throw new Error('このアプリより新しいデータベース形式です。');
  }

  await db.execAsync('BEGIN IMMEDIATE;');
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS medications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (
          length(name) BETWEEN 1 AND 100
          AND length(trim(name)) > 0
          AND instr(name, char(0)) = 0
        ),
        dose_time TEXT NOT NULL CHECK (
          length(dose_time) = 5
          AND dose_time GLOB '[0-2][0-9]:[0-5][0-9]'
          AND dose_time <= '23:59'
        ),
        penalty_amount INTEGER NOT NULL CHECK (
          typeof(penalty_amount) = 'integer'
          AND penalty_amount BETWEEN 0 AND 9007199254740991
        ),
        created_at TEXT NOT NULL CHECK (length(created_at) > 0)
      );
    `);
    // Refresh write policy without rewriting previously registered amounts or rebuilding the table.
    // Only the application-owned numeric constant is interpolated; user input remains bound.
    await db.execAsync(`
      DROP TRIGGER IF EXISTS medications_minimum_insert;
      DROP TRIGGER IF EXISTS medications_minimum_update;
      CREATE TRIGGER medications_minimum_insert BEFORE INSERT ON medications
      WHEN NEW.penalty_amount < ${MIN_PENALTY_AMOUNT}
      BEGIN SELECT RAISE(ABORT, 'penalty amount below minimum'); END;
      CREATE TRIGGER medications_minimum_update BEFORE UPDATE OF penalty_amount ON medications
      WHEN NEW.penalty_amount < ${MIN_PENALTY_AMOUNT}
      BEGIN SELECT RAISE(ABORT, 'penalty amount below minimum'); END;
    `);
    await db.execAsync(DEMO_PAYMENT_SCHEMA);
    await initializeDoseRecordSchema(db, version?.user_version ?? 0);
    await db.execAsync(MEDICATION_LIFECYCLE_SCHEMA);
    const scheduleColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(medication_schedules)');
    if (!scheduleColumns.some((column) => column.name === 'grace_minutes')) {
      await db.execAsync(`ALTER TABLE medication_schedules ADD COLUMN grace_minutes INTEGER NOT NULL DEFAULT ${DEFAULT_GRACE_MINUTES}
        CHECK (grace_minutes BETWEEN 5 AND 60 AND grace_minutes % 5 = 0);`);
    }
    if (!scheduleColumns.some((column) => column.name === 'grace_before_minutes')) {
      await db.execAsync('ALTER TABLE medication_schedules ADD COLUMN grace_before_minutes INTEGER NOT NULL DEFAULT 0 CHECK (grace_before_minutes BETWEEN 0 AND 60 AND grace_before_minutes % 5 = 0);');
    }
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS medication_groups (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT '錠',
        inventory INTEGER,
        memo TEXT NOT NULL DEFAULT '',
        starts_on TEXT NOT NULL,
        ends_on TEXT,
        notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0, 1)),
        grace_minutes INTEGER NOT NULL DEFAULT 30 CHECK (grace_minutes BETWEEN 5 AND 60 AND grace_minutes % 5 = 0),
        grace_before_minutes INTEGER NOT NULL DEFAULT 0 CHECK (grace_before_minutes BETWEEN 0 AND 60 AND grace_before_minutes % 5 = 0),
        is_plan INTEGER NOT NULL DEFAULT 0 CHECK (is_plan IN (0, 1)),
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS medication_group_doses (
        medication_id INTEGER PRIMARY KEY REFERENCES medications(id),
        group_id INTEGER NOT NULL REFERENCES medication_groups(id),
        dose_amount REAL NOT NULL DEFAULT 1 CHECK (dose_amount > 0)
      );
      CREATE TRIGGER IF NOT EXISTS medication_group_on_insert AFTER INSERT ON medications
      BEGIN
        INSERT OR IGNORE INTO medication_groups (id, name, starts_on, created_at)
          VALUES (NEW.id, NEW.name, substr(NEW.created_at, 1, 10), NEW.created_at);
        INSERT OR IGNORE INTO medication_group_doses (medication_id, group_id, dose_amount)
          VALUES (NEW.id, NEW.id, 1);
      END;
      INSERT OR IGNORE INTO medication_groups (id, name, starts_on, created_at)
        SELECT id, name, substr(created_at, 1, 10), created_at FROM medications;
      INSERT OR IGNORE INTO medication_group_doses (medication_id, group_id, dose_amount)
        SELECT id, id, 1 FROM medications;
      CREATE INDEX IF NOT EXISTS medication_group_doses_group ON medication_group_doses(group_id, medication_id);
    `);
    const groupColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(medication_groups)');
    if (!groupColumns.some((column) => column.name === 'grace_minutes')) {
      await db.execAsync(`ALTER TABLE medication_groups ADD COLUMN grace_minutes INTEGER NOT NULL DEFAULT ${DEFAULT_GRACE_MINUTES}
        CHECK (grace_minutes BETWEEN 5 AND 60 AND grace_minutes % 5 = 0);`);
    }
    if (!groupColumns.some((column) => column.name === 'grace_before_minutes')) {
      await db.execAsync('ALTER TABLE medication_groups ADD COLUMN grace_before_minutes INTEGER NOT NULL DEFAULT 0 CHECK (grace_before_minutes BETWEEN 0 AND 60 AND grace_before_minutes % 5 = 0);');
    }
    await db.execAsync(PENALTY_SCHEMA);
    await initializeMedicineBoxes(db);
    await db.execAsync(`PRAGMA user_version = ${MEDICATION_DATABASE_VERSION};`);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function listMedications(db: MedicationDatabase): Promise<Medication[]> {
  const rows = await db.getAllAsync<Medication & {
    isPlan: number; rawNotificationsEnabled: number;
  }>(`
    SELECT m.id, m.name, m.dose_time AS doseTime, m.penalty_amount AS penaltyAmount,
      m.created_at AS createdAt, g.id AS groupId, gd.dose_amount AS doseAmount,
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
  return { id: lastInsertRowId, name, doseTime, penaltyAmount, createdAt };
}

export async function saveMedicationPlan(db: TransactionDatabase, input: MedicationPlanInput): Promise<Medication[]> {
  const { doses: parsedDoses, inventory, unit, memo, graceBeforeMinutes } = validateMedicationPlan(input);

  return inTransaction(db, async (transaction) => {
    const startsAt = scheduledDate(input.startDay, '00:00').toISOString();
    const saved: Medication[] = [];
    let groupId = 0;
    for (const dose of parsedDoses.sort((a, b) => a.doseTime.localeCompare(b.doseTime))) {
      const inserted = await transaction.runAsync(
        'INSERT INTO medications (name, dose_time, penalty_amount, created_at) VALUES (?, ?, ?, ?)',
        dose.name, dose.doseTime, dose.penaltyAmount, startsAt,
      );
      const medicationId = inserted.lastInsertRowId;
      if (!groupId) {
        groupId = medicationId;
        await transaction.runAsync(`UPDATE medication_groups SET name = ?, unit = ?, inventory = ?, memo = ?,
          starts_on = ?, ends_on = ?, notifications_enabled = ?, grace_minutes = ?, grace_before_minutes = ?, is_plan = 1, created_at = ? WHERE id = ?`,
        dose.name, unit, inventory, memo, input.startDay, input.endDay,
        input.notificationsEnabled ? 1 : 0, input.graceMinutes, graceBeforeMinutes, new Date().toISOString(), groupId);
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
        createdAt: startsAt, groupId, doseAmount: dose.doseAmount, unit,
        activeStartDay: input.startDay, activeEndDay: input.endDay,
        notificationsEnabled: input.notificationsEnabled, graceMinutes: input.graceMinutes, graceBeforeMinutes,
      });
    }
    return saved;
  });
}
