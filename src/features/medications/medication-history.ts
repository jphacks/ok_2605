import { isLocalDay, localDay, type DoseRecord } from './dose-record.ts';
import type { Medication } from './medication.ts';

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
  medications: Medication[],
  records: DoseRecord[],
  today: string,
): HistoryDay {
  if (!isLocalDay(day) || !isLocalDay(today)) throw new Error('履歴の日付が正しくありません。');
  const active = medications.filter((medication) => medicationStartDay(medication) <= day);
  const recordByMedication = new Map(
    records.filter((record) => record.scheduledDay === day).map((record) => [record.medicationId, record]),
  );
  const entries = active.map((medication) => ({
    medication,
    record: recordByMedication.get(medication.id) ?? null,
  }));

  let status: HistoryDayStatus;
  if (entries.length === 0) status = 'none';
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
