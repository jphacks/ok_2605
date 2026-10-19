import type { PenaltyPayment } from './penalty-repository.ts';

export type PenaltyPaymentGroup = {
  deadlineAt: string;
  payments: PenaltyPayment[];
  totalAmount: number;
};

// Group by the original charge deadline, not the time the app caught up on missed doses.
// Different dose times can share a deadline when their grace periods differ.
export function groupPenaltyPayments(payments: PenaltyPayment[]): PenaltyPaymentGroup[] {
  const groups = new Map<string, PenaltyPaymentGroup>();
  for (const payment of payments) {
    let group = groups.get(payment.deadlineAt);
    if (!group) {
      group = { deadlineAt: payment.deadlineAt, payments: [], totalAmount: 0 };
      groups.set(payment.deadlineAt, group);
    }
    group.payments.push(payment);
    if (payment.status === 'succeeded') group.totalAmount += payment.amount;
  }

  for (const group of groups.values()) {
    group.payments.sort((a, b) => a.scheduledDay.localeCompare(b.scheduledDay)
      || a.doseTime.localeCompare(b.doseTime) || a.id - b.id);
  }
  return [...groups.values()].sort((a, b) => b.deadlineAt.localeCompare(a.deadlineAt));
}
