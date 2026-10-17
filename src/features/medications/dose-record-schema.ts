import type { MedicationDatabase } from './medication-repository.ts';

// Runs inside initializeMedicationDatabase's transaction. Preserve v3 QR/demo records and IDs.
export async function initializeDoseRecordSchema(db: MedicationDatabase, previousVersion: number): Promise<void> {
  const existing = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dose_records'");
  const upgrade = !!existing && previousVersion < 4;
  if (upgrade) await db.execAsync('ALTER TABLE dose_records RENAME TO dose_records_before_nfc;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dose_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medication_id INTEGER NOT NULL REFERENCES medications(id),
      scheduled_day TEXT NOT NULL CHECK (
        length(scheduled_day) = 10
        AND scheduled_day GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
      ),
      taken_at TEXT NOT NULL CHECK (length(taken_at) > 0),
      source TEXT NOT NULL CHECK (source IN ('qr', 'demo', 'nfc')),
      UNIQUE (medication_id, scheduled_day)
    );
  `);
  if (upgrade) {
    await db.execAsync(`
      INSERT INTO dose_records (id, medication_id, scheduled_day, taken_at, source)
        SELECT id, medication_id, scheduled_day, taken_at, source FROM dose_records_before_nfc;
      DROP TABLE dose_records_before_nfc;
    `);
  }
  await db.execAsync('CREATE INDEX IF NOT EXISTS dose_records_day ON dose_records(scheduled_day, medication_id);');

  // Carry already-saved NFC records into the calendar, including scans from before this integration.
  const nfc = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nfc_dose_confirmations'");
  if (nfc) {
    await db.execAsync(`
      INSERT OR IGNORE INTO dose_records (medication_id, scheduled_day, taken_at, source)
        SELECT n.medication_id, n.scheduled_day, n.confirmed_at, 'nfc'
        FROM nfc_dose_confirmations n JOIN medications m ON m.id = n.medication_id
        ORDER BY n.confirmed_at;
    `);
  }
}
