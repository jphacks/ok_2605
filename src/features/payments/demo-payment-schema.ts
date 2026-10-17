export const DEMO_PAYMENT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS demo_penalty_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurrence_key TEXT NOT NULL UNIQUE,
    medication_id INTEGER NOT NULL,
    medication_name TEXT NOT NULL,
    scheduled_day TEXT NOT NULL,
    dose_time TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount BETWEEN 0 AND 9007199254740991),
    mode TEXT NOT NULL DEFAULT 'demo' CHECK (mode = 'demo'),
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS demo_payment_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES demo_penalty_payments(id),
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
    error_message TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (payment_id, attempt_number)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS demo_payment_one_success
    ON demo_payment_attempts(payment_id) WHERE status = 'succeeded';
`;
