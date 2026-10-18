import { isMedicationActiveOnDay, type Medication } from '../medications/medication.ts';
import { localDay, scheduledDate, type DoseRecord } from '../medications/dose-record.ts';
import { doseDeadline, type PenaltyPayment } from '../payments/penalty-repository.ts';

export const REMINDER_KIND = 'medication-reminder';
export const REMINDER_PREFIX = 'nomupay:reminder:';
export const MAX_REMINDERS = 60;
export const REMINDER_DAYS = 7;
export const NOTIFICATION_PATTERNS = [
  { value: 'before-dose', label: '服用10分前' },
  { value: 'at-dose', label: '服用時刻ちょうど' },
  { value: 'before-penalty', label: '課金10分前' },
  { value: 'charged', label: '課金完了' },
] as const;
export type NotificationPattern = typeof NOTIFICATION_PATTERNS[number]['value'];

export function reminderMedicationId(data: Record<string, unknown> | undefined): number | null {
  const id = data?.medicationId;
  return data?.kind === REMINDER_KIND && typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function notificationContent(pattern: NotificationPattern, medication: Pick<Medication, 'id' | 'name' | 'doseTime' | 'penaltyAmount'>, day: string, demo = false) {
  const title = pattern === 'before-dose' ? '服用時間の10分前です' : pattern === 'at-dose' ? '服用時間です' : pattern === 'before-penalty' ? '課金予定の10分前です' : 'テスト決済が完了しました';
  const body = pattern === 'before-dose' ? `${medication.name}：${medication.doseTime}に服用予定です。`
    : pattern === 'at-dose' ? `${medication.name}：今が服用時間です。薬箱で服用を記録しましょう。`
      : pattern === 'before-penalty' ? `${medication.name}：未服用のままだと10分後に${medication.penaltyAmount}円のテスト決済が行われます。`
      : `${medication.name}：${medication.penaltyAmount}円のテスト決済が完了しました。実際の請求はありません。`;
  return {
    title: `${demo ? '【デモ】' : ''}のむペイ｜${title}`, body, sound: 'default',
    data: { kind: REMINDER_KIND, pattern, medicationId: medication.id, scheduledDay: day, demo, version: 2 },
  };
}

export function paymentNotificationContent(payment: PenaltyPayment) {
  return notificationContent('charged', { id: payment.medicationId, name: payment.medicationName, doseTime: payment.doseTime, penaltyAmount: payment.amount }, payment.scheduledDay);
}

export function reminderRequest(medication: Medication, day: string, pattern: 'before-dose' | 'at-dose' | 'before-penalty') {
  const at = pattern === 'before-penalty' ? doseDeadline(day, medication.doseTime, medication.graceMinutes) : scheduledDate(day, medication.doseTime);
  const date = new Date(at.getTime() - (pattern === 'at-dose' ? 0 : 10 * 60_000));
  const content = notificationContent(pattern, medication, day);
  return {
    identifier: `${REMINDER_PREFIX}${medication.id}:${day}:${pattern}`,
    content: { ...content, data: { ...content.data, fireAt: date.toISOString() } },
    trigger: { type: 'date' as const, date },
  };
}

export type PendingReminder = { identifier: string; content: { title?: string | null; body?: string | null; data?: Record<string, unknown> } };
export type ReminderScheduler = {
  list: () => Promise<PendingReminder[]>;
  cancel: (id: string) => Promise<void>;
  schedule: (request: ReturnType<typeof reminderRequest>) => Promise<unknown>;
};

export async function reconcileReminders(medications: Medication[], scheduler: ReminderScheduler, records: DoseRecord[] = [], now = new Date()) {
  const desired: ReturnType<typeof reminderRequest>[] = [];
  const taken = new Set(records.map((record) => `${record.medicationId}:${record.scheduledDay}`));
  for (let offset = -1; offset <= REMINDER_DAYS; offset++) {
    const day = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12));
    for (const medication of medications) {
      if (medication.notificationsEnabled === false || !isMedicationActiveOnDay(medication, day) || taken.has(`${medication.id}:${day}`)) continue;
      if (scheduledDate(day, medication.doseTime).getTime() < Date.parse(medication.createdAt)) continue;
      for (const pattern of ['before-dose', 'at-dose', 'before-penalty'] as const) {
        const request = reminderRequest(medication, day, pattern);
        if (request.trigger.date.getTime() > now.getTime()) desired.push(request);
      }
    }
  }
  desired.sort((a, b) => a.trigger.date.getTime() - b.trigger.date.getTime() || a.identifier.localeCompare(b.identifier));
  const pending = await scheduler.list();
  const otherCount = pending.filter((item) => !item.identifier.startsWith(REMINDER_PREFIX)).length;
  const capacity = Math.max(0, MAX_REMINDERS - otherCount);
  // Replenish nearest dated occurrences on foreground and after a dose.
  const selected = desired.slice(0, capacity);
  const wanted = new Set(selected.map((item) => item.identifier));
  for (const item of pending) {
    if (item.identifier.startsWith(REMINDER_PREFIX) && !wanted.has(item.identifier)) await scheduler.cancel(item.identifier);
  }
  if (!capacity && desired.length) throw new Error('通知の予約上限（60件）に達しています。');
  for (const request of selected) {
    const existing = pending.find((item) => item.identifier === request.identifier);
    if (existing?.content.title === request.content.title && existing.content.body === request.content.body
      && existing.content.data?.fireAt === request.content.data.fireAt && existing.content.data?.version === 2) continue;
    await scheduler.schedule(request);
  }
  const confirmed = await scheduler.list();
  if (selected.some((request) => !confirmed.some((item) => item.identifier === request.identifier && item.content.body === request.content.body && item.content.data?.fireAt === request.content.data.fireAt))) {
    throw new Error('一部の通知を予約できませんでした。再試行してください。');
  }
  return selected.length;
}
