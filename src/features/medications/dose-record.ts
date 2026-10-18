import { medicationGraceBeforeMinutes, medicationGraceMinutes } from './grace-period.ts';
import { isMedicationActiveOnDay, type Medication } from './medication.ts';

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
  scheduledDay: string;
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
  const today = localDay(now);
  return medications.flatMap((medication) => nearbyScheduledDays(now).flatMap((day): DailyMedication[] => {
    if (!isMedicationActiveOnDay(medication, day)) return [];
    const scheduledAt = scheduledDate(day, medication.doseTime);
    const startsAt = scheduledAt.getTime() - medicationGraceBeforeMinutes(medication.graceBeforeMinutes) * 60_000;
    const deadline = scheduledAt.getTime() + medicationGraceMinutes(medication.graceMinutes) * 60_000;
    if (day !== today && !(now.getTime() >= startsAt && now.getTime() < deadline)) return [];
    const record = records.find((record) => record.medicationId === medication.id && record.scheduledDay === day) ?? null;
    return [{ medication, scheduledAt, scheduledDay: day, record,
      status: record ? 'taken' : now.getTime() >= startsAt ? 'due' : 'upcoming' }];
  })).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.medication.id - b.medication.id);
}

export function nearbyScheduledDays(now: Date): string[] {
  return [-1, 0, 1].map((offset) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12)));
}

export function nextScheduledDose(
  schedule: DailyMedication[],
  medications: Medication[],
  now: Date,
): { medication: Medication; scheduledAt: Date; day: string; due: boolean } | null {
  const due = schedule.find((item) => item.status === 'due');
  if (due) {
    return { medication: due.medication, scheduledAt: due.scheduledAt, day: due.scheduledDay, due: true };
  }

  const upcoming = schedule.find((item) => item.status === 'upcoming');
  if (upcoming) {
    return { medication: upcoming.medication, scheduledAt: upcoming.scheduledAt, day: upcoming.scheduledDay, due: false };
  }

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  const tomorrowDay = localDay(tomorrow);
  const candidates = medications.flatMap((medication) => {
    let candidateDay = medication.activeStartDay && medication.activeStartDay > tomorrowDay
      ? medication.activeStartDay
      : tomorrowDay;
    if (schedule.some((item) => item.medication.id === medication.id && item.scheduledDay === candidateDay && item.status === 'taken')) {
      const date = scheduledDate(candidateDay, '12:00'); date.setDate(date.getDate() + 1); candidateDay = localDay(date);
    }
    if (!isMedicationActiveOnDay(medication, candidateDay)) return [];
    return [{ medication, scheduledAt: scheduledDate(candidateDay, medication.doseTime), day: candidateDay }];
  }).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.medication.id - b.medication.id);
  const first = candidates[0];
  return first ? { ...first, due: false } : null;
}
