import { initializeMedicineBoxes } from '../boxes/medicine-box-repository.ts';
import { DEMO_PAYMENT_SCHEMA } from '../payments/demo-payment-schema.ts';
import { PAYMENT_SETUP_SCHEMA } from '../payments/payment-setup-repository.ts';
import { PENALTY_SCHEMA } from '../payments/penalty-schema.ts';
import type { MedicationDatabase } from './database-types.ts';
import { initializeDoseRecordSchema } from './dose-record-schema.ts';
import { DEFAULT_GRACE_MINUTES } from './grace-period.ts';
import { MEDICATION_LIFECYCLE_SCHEMA } from './medication-lifecycle-schema.ts';
import { MIN_PENALTY_AMOUNT } from './medication.ts';

// Version 6 shipped the medication lifecycle and box tables. Version 7 adds
// a per-medication grace period; version 8 adds early confirmation, and version 9 persists onboarding and a dummy card.
const MEDICATION_DATABASE_VERSION = 9;

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
    await db.execAsync(PAYMENT_SETUP_SCHEMA);
    await db.execAsync(`PRAGMA user_version = ${MEDICATION_DATABASE_VERSION};`);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}
