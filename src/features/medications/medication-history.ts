import type { DoseRecord } from './dose-record.ts';
import { isLocalDay, localDay, scheduledDate } from './local-date.ts';
import { compareMedicationSchedule, type Medication } from './medication.ts';
import type { HistoricalMedication } from './medication-lifecycle.ts';
import type { PenaltyPayment } from '../payments/penalty-repository.ts';

export type HistoryDayStatus = 'none' | 'future' | 'pending' | 'complete' | 'missed';

export type HistoryDay = {
  day: string;
  status: HistoryDayStatus;
  entries: { medication: Medication; record: DoseRecord | null }[];
};

export function medicationStartDay(medication: Medication): string {
  const createdAt = new Date(medication.createdAt);
  return Number.isFinite(createdAt.getTime()) ? localDay(createdAt) : '9999-12-31';
}

export function buildHistoryDay(
  day: string,
  medications: HistoricalMedication[],
  records: DoseRecord[],
  today: string,
  penalties: PenaltyPayment[] = [],
): HistoryDay {
  if (!isLocalDay(day) || !isLocalDay(today)) throw new Error('履歴の日付が正しくありません。');
  // Pick a schedule snapshot for this occurrence; current edits never rewrite older days.
  const byId = new Map<number, HistoricalMedication>();
  for (const medication of medications) {
    const at = scheduledDate(day, medication.doseTime).getTime();
    const started = new Date(medication.createdAt).getTime();
    const ended = medication.endedAt ? new Date(medication.endedAt).getTime() : Infinity;
    if (at >= started && at < ended) byId.set(medication.id, medication);
  }
  // Preserve a recorded dose even when an edit/deletion cancelled its original schedule.
  for (const record of records.filter((item) => item.scheduledDay === day)) {
    const original = medications.findLast((item) => item.id === record.medicationId
      && new Date(item.createdAt).getTime() <= Date.parse(record.takenAt));
    if (original) byId.set(original.id, original);
  }
  const missedPayments = penalties.filter((payment) => payment.scheduledDay === day);
  for (const payment of missedPayments) {
    const snapshot = medications.findLast((item) => item.id === payment.medicationId
      && item.name === payment.medicationName && item.doseTime === payment.doseTime
      && Date.parse(item.createdAt) <= scheduledDate(day, item.doseTime).getTime());
    if (snapshot) byId.set(snapshot.id, snapshot);
  }
  const active = [...byId.values()].sort(compareMedicationSchedule);
  const recordByMedication = new Map(
    records.filter((record) => record.scheduledDay === day).map((record) => [record.medicationId, record]),
  );
  const entries = active.map((medication) => ({
    medication,
    record: recordByMedication.get(medication.id) ?? null,
  }));

  let status: HistoryDayStatus;
  if (entries.length === 0) status = 'none';
  else if (missedPayments.length) status = 'missed';
  else if (entries.every((entry) => entry.record)) status = 'complete';
  else if (day < today) status = 'missed';
  else if (day === today) status = 'pending';
  else status = 'future';
  return { day, status, entries };
}

export function monthRange(year: number, month: number): { firstDay: string; lastDay: string } {
  if (!Number.isInteger(year) || year < 2000 || year > 9999 || !Number.isInteger(month) || month < 0 || month > 11) {
    throw new Error('表示する年月が正しくありません。');
  }
  return {
    firstDay: localDay(new Date(year, month, 1, 12)),
    lastDay: localDay(new Date(year, month + 1, 0, 12)),
  };
}

export function monthCalendarDays(year: number, month: number): (string | null)[] {
  const { firstDay, lastDay } = monthRange(year, month);
  const leading = new Date(year, month, 1, 12).getDay();
  const daysInMonth = Number(lastDay.slice(-2));
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${firstDay.slice(0, 8)}${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
