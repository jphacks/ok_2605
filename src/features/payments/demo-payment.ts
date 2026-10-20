import { localDay } from '../medications/local-date.ts';

export { localDay } from '../medications/local-date.ts';

// A fixed demo condition, not the production grace-period policy.
export const DEMO_GRACE_MINUTES = 30;
export type DemoScenario = 'overdue' | 'within-grace' | 'taken';
export type DemoOutcome = 'success' | 'failure';

export type DemoPayment = {
  id: number;
  occurrenceKey: string;
  medicationId: number;
  medicationName: string;
  scheduledDay: string;
  doseTime: string;
  deadlineAt: string;
  amount: number;
  mode: 'demo';
  status: 'succeeded' | 'failed';
  attemptCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DemoPaymentAttempt = {
  id: number;
  paymentId: number;
  attemptNumber: number;
  status: 'succeeded' | 'failed';
  errorMessage: string | null;
  createdAt: string;
};

export type DemoPaymentRequest = {
  medicationId: number;
  day: string;
  scenario: DemoScenario;
  outcome: DemoOutcome;
};

export type DemoPaymentResult =
  | { kind: 'skipped'; reason: 'taken' | 'within-grace' }
  | { kind: 'processed' | 'already-succeeded'; payment: DemoPayment };

export class DemoPaymentInputError extends Error {}

export function demoDeadline(day: string, doseTime: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(doseTime)) {
    throw new DemoPaymentInputError('日付をYYYY-MM-DD形式で入力してください。');
  }
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = doseTime.split(':').map(Number);
  const scheduled = new Date(year, month - 1, date, hour, minute);
  if (year < 2000 || year > 9999 || localDay(scheduled) !== day) {
    throw new DemoPaymentInputError('存在する日付を2000〜9999年の範囲で入力してください。');
  }
  return new Date(scheduled.getTime() + DEMO_GRACE_MINUTES * 60_000);
}

export function isPenaltyDue(taken: boolean, now: Date, deadline: Date): boolean {
  return !taken && Number.isFinite(now.getTime()) && Number.isFinite(deadline.getTime()) && now.getTime() >= deadline.getTime();
}

// Entirely local simulator: no SDK, credentials, payment method, or network request.
export function simulatePayment(outcome: DemoOutcome) {
  if (outcome === 'success') return { status: 'succeeded' as const, errorMessage: null };
  if (outcome === 'failure') return { status: 'failed' as const, errorMessage: 'デモ用の決済エラーです。再試行してください。' };
  throw new DemoPaymentInputError('デモの成功・失敗を選択してください。');
}
