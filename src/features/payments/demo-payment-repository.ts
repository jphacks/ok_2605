import { MIN_PENALTY_AMOUNT, type Medication } from '../medications/medication.ts';
import type { MedicationDatabase } from '../medications/database-types.ts';
import { inTransaction } from '../medications/transaction.ts';
import { hasDoseRecord } from '../medications/dose-record-repository.ts';
import {
  DemoPaymentInputError, demoDeadline, isPenaltyDue, simulatePayment,
  type DemoOutcome, type DemoPayment, type DemoPaymentAttempt, type DemoPaymentRequest, type DemoPaymentResult,
} from './demo-payment.ts';

export interface DemoPaymentDatabase extends MedicationDatabase {
  withExclusiveTransactionAsync(task: (transaction: MedicationDatabase) => Promise<void>): Promise<void>;
}

const columns = `id, occurrence_key AS occurrenceKey, medication_id AS medicationId,
  medication_name AS medicationName, scheduled_day AS scheduledDay, dose_time AS doseTime,
  deadline_at AS deadlineAt, amount, mode, status, attempt_count AS attemptCount,
  error_message AS errorMessage, created_at AS createdAt, updated_at AS updatedAt`;

export function listDemoPayments(db: MedicationDatabase): Promise<DemoPayment[]> {
  return db.getAllAsync<DemoPayment>(`SELECT ${columns} FROM demo_penalty_payments ORDER BY updated_at DESC, id DESC`);
}

export function listDemoPaymentAttempts(db: MedicationDatabase): Promise<DemoPaymentAttempt[]> {
  return db.getAllAsync<DemoPaymentAttempt>(`SELECT id, payment_id AS paymentId, attempt_number AS attemptNumber,
    status, error_message AS errorMessage, created_at AS createdAt
    FROM demo_payment_attempts ORDER BY id ASC`);
}

// Share the foreground-write queue with QR, NFC, editing and automatic penalties.
const exclusive = inTransaction;

async function settle(transaction: MedicationDatabase, payment: DemoPayment, outcome: DemoOutcome): Promise<DemoPaymentResult> {
  if (payment.status === 'succeeded') return { kind: 'already-succeeded', payment };
  const result = simulatePayment(outcome);
  const updatedAt = new Date().toISOString();
  const attemptCount = payment.attemptCount + 1;
  await transaction.runAsync(`INSERT INTO demo_payment_attempts
    (payment_id, attempt_number, status, error_message, created_at) VALUES (?, ?, ?, ?, ?)`,
  payment.id, attemptCount, result.status, result.errorMessage, updatedAt);
  await transaction.runAsync(`UPDATE demo_penalty_payments
    SET status = ?, attempt_count = ?, error_message = ?, updated_at = ? WHERE id = ?`,
  result.status, attemptCount, result.errorMessage, updatedAt, payment.id);
  return { kind: 'processed', payment: { ...payment, ...result, attemptCount, updatedAt } };
}

export async function runDemoPayment(db: DemoPaymentDatabase, request: DemoPaymentRequest): Promise<DemoPaymentResult> {
  if (!Number.isSafeInteger(request.medicationId) || request.medicationId <= 0) {
    throw new DemoPaymentInputError('登録した薬を選択してください。');
  }
  if (!['overdue', 'within-grace', 'taken'].includes(request.scenario)) {
    throw new DemoPaymentInputError('再現する服薬状況を選択してください。');
  }
  simulatePayment(request.outcome); // Reject invalid simulator inputs before writing anything.
  return exclusive(db, async (transaction) => {
    const medication = await transaction.getFirstAsync<Medication>(`SELECT id, name, dose_time AS doseTime,
      penalty_amount AS penaltyAmount, created_at AS createdAt FROM medications WHERE id = ?`, request.medicationId);
    if (!medication) throw new DemoPaymentInputError('薬が見つかりません。登録した薬を選び直してください。');
    const deadline = demoDeadline(request.day, medication.doseTime);
    const taken = request.scenario === 'taken'
      || await hasDoseRecord(transaction, medication.id, request.day);
    const simulatedNow = new Date(deadline.getTime() + (request.scenario === 'within-grace' ? -1 : 1));
    if (!isPenaltyDue(taken, simulatedNow, deadline)) {
      return { kind: 'skipped', reason: taken ? 'taken' : 'within-grace' };
    }

    const occurrenceKey = `demo:${medication.id}:${request.day}:${medication.doseTime}`;
    const existing = await transaction.getFirstAsync<DemoPayment>(`SELECT ${columns} FROM demo_penalty_payments WHERE occurrence_key = ?`, occurrenceKey);
    if (existing) return settle(transaction, existing, request.outcome);
    if (!Number.isSafeInteger(medication.penaltyAmount) || medication.penaltyAmount < MIN_PENALTY_AMOUNT) {
      throw new DemoPaymentInputError(`デモ課金には${MIN_PENALTY_AMOUNT}円以上の薬を登録してください。`);
    }
    const createdAt = new Date().toISOString();
    const inserted = await transaction.runAsync(`INSERT INTO demo_penalty_payments
      (occurrence_key, medication_id, medication_name, scheduled_day, dose_time, deadline_at,
       amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?)`,
    occurrenceKey, medication.id, medication.name, request.day, medication.doseTime,
    deadline.toISOString(), medication.penaltyAmount, createdAt, createdAt);
    return settle(transaction, {
      id: inserted.lastInsertRowId, occurrenceKey, medicationId: medication.id, medicationName: medication.name,
      scheduledDay: request.day, doseTime: medication.doseTime, deadlineAt: deadline.toISOString(),
      amount: medication.penaltyAmount, mode: 'demo', status: 'failed', attemptCount: 0,
      errorMessage: null, createdAt, updatedAt: createdAt,
    }, request.outcome);
  });
}

export async function retryDemoPayment(db: DemoPaymentDatabase, paymentId: number, outcome: DemoOutcome): Promise<DemoPaymentResult> {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) throw new DemoPaymentInputError('再試行する履歴を選択してください。');
  simulatePayment(outcome);
  return exclusive(db, async (transaction) => {
    const payment = await transaction.getFirstAsync<DemoPayment>(`SELECT ${columns} FROM demo_penalty_payments WHERE id = ?`, paymentId);
    if (!payment) throw new DemoPaymentInputError('課金履歴が見つかりません。');
    if (await hasDoseRecord(transaction, payment.medicationId, payment.scheduledDay)) {
      return { kind: 'skipped', reason: 'taken' };
    }
    return settle(transaction, payment, outcome);
  });
}
