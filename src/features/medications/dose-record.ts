import type { Medication } from './medication.ts';

export type DoseRecordSource = 'qr' | 'demo' | 'nfc';

export type DoseRecord = {
  id: number;
  medicationId: number;
  scheduledDay: string;
  takenAt: string;
  source: DoseRecordSource;
};

export type DailyMedication = {
  medication: Medication;
  scheduledAt: Date;
  record: DoseRecord | null;
  status: 'taken' | 'due' | 'upcoming';
};

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isLocalDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return year >= 2000 && year <= 9999 && localDay(parsed) === value;
}

export function scheduledDate(day: string, doseTime: string): Date {
  if (!isLocalDay(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(doseTime)) {
    throw new Error('服薬予定の日付または時刻が正しくありません。');
  }
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = doseTime.split(':').map(Number);
  return new Date(year, month - 1, date, hour, minute);
}

export function buildDailySchedule(
  medications: Medication[],
  records: DoseRecord[],
  now: Date,
): DailyMedication[] {
  const day = localDay(now);
  const recordByMedication = new Map(
    records.filter((record) => record.scheduledDay === day).map((record) => [record.medicationId, record]),
  );

  return medications.map((medication) => {
    const scheduledAt = scheduledDate(day, medication.doseTime);
    const record = recordByMedication.get(medication.id) ?? null;
    return {
      medication,
      scheduledAt,
      record,
      status: record ? 'taken' : scheduledAt.getTime() <= now.getTime() ? 'due' : 'upcoming',
    };
  });
}

export function nextScheduledDose(
  schedule: DailyMedication[],
  medications: Medication[],
  now: Date,
): { medication: Medication; scheduledAt: Date; day: string; due: boolean } | null {
  const due = schedule.find((item) => item.status === 'due');
  if (due) {
    return { medication: due.medication, scheduledAt: due.scheduledAt, day: localDay(now), due: true };
  }

  const upcoming = schedule.find((item) => item.status === 'upcoming');
  if (upcoming) {
    return { medication: upcoming.medication, scheduledAt: upcoming.scheduledAt, day: localDay(now), due: false };
  }

  const first = medications[0];
  if (!first) return null;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  const day = localDay(tomorrow);
  return { medication: first, scheduledAt: scheduledDate(day, first.doseTime), day, due: false };
}
