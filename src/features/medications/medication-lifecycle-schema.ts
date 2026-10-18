// Additive tables retain the original medication IDs, dose records and payment demos.
export const MEDICATION_LIFECYCLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS medication_details (
    medication_id INTEGER PRIMARY KEY REFERENCES medications(id),
    qr_token TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    archived_at TEXT
  );
  CREATE TABLE IF NOT EXISTS medication_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medication_id INTEGER NOT NULL REFERENCES medications(id),
    name TEXT NOT NULL,
    dose_time TEXT NOT NULL,
    penalty_amount INTEGER NOT NULL,
    grace_minutes INTEGER NOT NULL DEFAULT 30 CHECK (grace_minutes BETWEEN 5 AND 60 AND grace_minutes % 5 = 0),
    grace_before_minutes INTEGER NOT NULL DEFAULT 0 CHECK (grace_before_minutes BETWEEN 0 AND 60 AND grace_before_minutes % 5 = 0),
    starts_at TEXT NOT NULL,
    ends_at TEXT,
    checked_day TEXT
  );
  INSERT OR IGNORE INTO medication_details (medication_id) SELECT id FROM medications;
  INSERT INTO medication_schedules (medication_id, name, dose_time, penalty_amount, starts_at)
    SELECT id, name, dose_time, penalty_amount, created_at FROM medications m
    WHERE NOT EXISTS (SELECT 1 FROM medication_schedules s WHERE s.medication_id = m.id);
  CREATE TRIGGER IF NOT EXISTS medication_details_on_insert AFTER INSERT ON medications
  BEGIN
    INSERT INTO medication_details (medication_id) VALUES (NEW.id);
    INSERT INTO medication_schedules (medication_id, name, dose_time, penalty_amount, starts_at)
      VALUES (NEW.id, NEW.name, NEW.dose_time, NEW.penalty_amount, NEW.created_at);
  END;
  CREATE INDEX IF NOT EXISTS medication_schedules_medication ON medication_schedules(medication_id);
`;
