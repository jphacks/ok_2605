import { DEMO_PAYMENT_SCHEMA } from '../payments/demo-payment-schema.ts';
import {
  MIN_PENALTY_AMOUNT,
  MedicationValidationError,
  validateMedicationInput,
  type Medication,
  type MedicationInput,
} from './medication.ts';

type MedicationDatabaseValue = string | number | null;

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
  if ((version?.user_version ?? 0) > 2) {
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
    await db.execAsync('PRAGMA user_version = 2;');
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

export async function listMedications(db: MedicationDatabase): Promise<Medication[]> {
  return db.getAllAsync<Medication>(`
    SELECT id, name, dose_time AS doseTime, penalty_amount AS penaltyAmount, created_at AS createdAt
    FROM medications
    ORDER BY dose_time ASC, id ASC
  `);
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
