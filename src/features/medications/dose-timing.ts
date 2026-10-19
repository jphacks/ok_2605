import { nearbyScheduledDays, scheduledDate } from './local-date.ts';
import {
  DEFAULT_GRACE_MINUTES,
  isGraceBeforeMinutes,
  isGraceMinutes,
  medicationGraceBeforeMinutes,
  medicationGraceMinutes,
} from './grace-period.ts';
import { isMedicationActiveOnDay, type Medication } from './medication.ts';

export type ConfirmableDose = { medication: Medication; day: string; deadline: Date };

export const GRACE_MINUTES = DEFAULT_GRACE_MINUTES;
export function doseDeadline(day: string, time: string, graceMinutes = DEFAULT_GRACE_MINUTES): Date {
  if (!isGraceMinutes(graceMinutes)) throw new Error('執行猶予時間が正しくありません。');
  return new Date(scheduledDate(day, time).getTime() + graceMinutes * 60_000);
}

export function wasScheduledBeforeDose(medication: Pick<Medication, 'createdAt' | 'scheduleStartsAt' | 'doseTime'>, day: string): boolean {
  return Date.parse(medication.scheduleStartsAt ?? medication.createdAt) <= scheduledDate(day, medication.doseTime).getTime();
}

export function doseStartsAt(day: string, time: string, beforeMinutes = 0): Date {
  if (!isGraceBeforeMinutes(beforeMinutes)) throw new Error('前の猶予時間が正しくありません。');
  return new Date(scheduledDate(day, time).getTime() - beforeMinutes * 60_000);
}

// QR and NFC accept the same active occurrences, including windows across midnight.
export function confirmableDoses(medications: Medication[], now: Date, days = nearbyScheduledDays(now)): ConfirmableDose[] {
  return medications.flatMap((medication) => days.flatMap((day) => {
    if (!isMedicationActiveOnDay(medication, day)) return [];
    const deadline = doseDeadline(day, medication.doseTime, medicationGraceMinutes(medication.graceMinutes));
    const start = doseStartsAt(day, medication.doseTime, medicationGraceBeforeMinutes(medication.graceBeforeMinutes));
    return now.getTime() >= start.getTime() && now.getTime() < deadline.getTime()
      ? [{ medication, day, deadline }]
      : [];
  }));
}

export function doseCountdown(medication: Medication, day: string, now: Date): {
  phase: 'until-dose' | 'until-penalty' | 'expired'; remainingSeconds: number;
} {
  const scheduledAt = scheduledDate(day, medication.doseTime);
  const deadline = doseDeadline(day, medication.doseTime, medicationGraceMinutes(medication.graceMinutes));
  const target = now.getTime() < scheduledAt.getTime() ? scheduledAt : deadline;
  if (now.getTime() >= deadline.getTime()) return { phase: 'expired', remainingSeconds: 0 };
  return {
    phase: now.getTime() < scheduledAt.getTime() ? 'until-dose' : 'until-penalty',
    remainingSeconds: Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1_000)),
  };
}

export function formatDoseCountdown(remainingSeconds: number, showSeconds: boolean): string {
  const safeSeconds = Number.isFinite(remainingSeconds) ? Math.max(0, Math.ceil(remainingSeconds)) : 0;
  if (showSeconds) {
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
  }
  const totalMinutes = Math.max(1, Math.ceil(safeSeconds / 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}日${hours > 0 ? `${hours}時間` : ''}${minutes > 0 ? `${minutes}分` : ''}`;
  if (hours > 0) return `${hours}時間${minutes > 0 ? `${minutes}分` : ''}`;
  return `${minutes}分`;
}
