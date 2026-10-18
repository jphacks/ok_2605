export const PENALTY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS penalty_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medication_id INTEGER NOT NULL REFERENCES medications(id),
    medication_name TEXT NOT NULL,
    scheduled_day TEXT NOT NULL,
    dose_time TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount >= 0),
    mode TEXT NOT NULL DEFAULT 'test' CHECK(mode = 'test'),
    status TEXT NOT NULL CHECK(status IN ('succeeded', 'failed')),
    error_message TEXT,
    acknowledged_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(medication_id, scheduled_day)
  );
  CREATE TABLE IF NOT EXISTS penalty_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES penalty_payments(id),
    status TEXT NOT NULL CHECK(status IN ('succeeded', 'failed')),
    error_message TEXT,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS penalty_one_success ON penalty_attempts(payment_id) WHERE status = 'succeeded';
`;
