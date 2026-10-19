import { medicationGraceBeforeMinutes, medicationGraceMinutes } from './grace-period.ts';
import { isMedicationActiveOnDay, type Medication } from './medication.ts';
import { localDay, nearbyScheduledDays, scheduledDate } from './local-date.ts';

export { isLocalDay, localDay, nearbyScheduledDays, scheduledDate } from './local-date.ts';

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
