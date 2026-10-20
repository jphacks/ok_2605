import { isMedicationActiveOnDay, type Medication } from '../medications/medication.ts';
import type { DoseRecord } from '../medications/dose-record.ts';
import { localDay, scheduledDate } from '../medications/local-date.ts';
import { doseDeadline } from '../medications/dose-timing.ts';
import type { PenaltyPaymentGroup } from '../payments/penalty-groups.ts';

export const REMINDER_KIND = 'medication-reminder';
export const REMINDER_PREFIX = 'nomupay:reminder:';
export const MAX_REMINDERS = 60;
export const REMINDER_DAYS = 7;
export const REMINDER_VERSION = 4;

function deadlineBody(names: string) {
  return `${names}：服用期限を過ぎました。次回起動時にテスト決済を処理します。実際の請求はありません。`;
}
export const NOTIFICATION_PATTERNS = [
  { value: 'before-dose', label: '服用10分前' },
  { value: 'at-dose', label: '服用時刻ちょうど' },
  { value: 'before-penalty', label: '服用期限10分前' },
  { value: 'deadline', label: '服用期限超過' },
] as const;
export type NotificationPattern = typeof NOTIFICATION_PATTERNS[number]['value'];

export function reminderMedicationId(data: Record<string, unknown> | undefined): number | null {
  const id = data?.medicationId;
  return data?.kind === REMINDER_KIND && typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function notificationContent(pattern: NotificationPattern, medication: Pick<Medication, 'id' | 'name' | 'doseTime' | 'penaltyAmount'>, day: string, demo = false) {
  const title = pattern === 'before-dose' ? '服用時間の10分前です' : pattern === 'at-dose' ? '服用時間です' : pattern === 'before-penalty' ? '服用期限の10分前です' : '服用期限を過ぎました';
  const body = pattern === 'before-dose' ? `${medication.name}：${medication.doseTime}に服用予定です。`
    : pattern === 'at-dose' ? `${medication.name}：今が服用時間です。薬箱で服用を記録しましょう。`
      : pattern === 'before-penalty' ? `${medication.name}：服用期限まであと10分です。薬箱で服用を記録してください。`
      : deadlineBody(medication.name);
  return {
    title: `${demo ? '【デモ】' : ''}のむペイ｜${title}`, body, sound: 'default',
    data: { kind: REMINDER_KIND, pattern, medicationId: medication.id, scheduledDay: day, demo, version: REMINDER_VERSION },
  };
}

export function paymentNotificationContent(group: PenaltyPaymentGroup) {
  const charged = group.payments.filter((payment) => payment.status === 'succeeded');
  return {
    title: 'のむペイ｜テスト決済が完了しました',
    body: `${charged.map((payment) => payment.medicationName).join('・')}：合計${group.totalAmount.toLocaleString('ja-JP')}円のテスト決済が完了しました。実際の請求はありません。`,
    sound: 'default',
    data: {
      kind: REMINDER_KIND,
      pattern: 'charged',
      paymentIds: charged.map((payment) => payment.id),
      medicationIds: charged.map((payment) => payment.medicationId),
      deadlineAt: group.deadlineAt,
      demo: false,
      version: 2,
    },
  };
}

export type ScheduledReminder = {
  identifier: string;
  content: { title: string; body: string; sound: string; data: Record<string, unknown> };
  trigger: { type: 'date'; date: Date };
};

export function reminderRequest(medication: Medication, day: string, pattern: NotificationPattern): ScheduledReminder {
  const at = pattern === 'before-penalty' || pattern === 'deadline'
    ? doseDeadline(day, medication.doseTime, medication.graceMinutes) : scheduledDate(day, medication.doseTime);
  const date = new Date(at.getTime() - (pattern === 'before-dose' || pattern === 'before-penalty' ? 10 * 60_000 : 0));
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
  const deadlines = new Map<string, { request: ScheduledReminder; names: string[]; occurrences: { medicationId: number; scheduledDay: string }[] }>();
  const taken = new Set(records.map((record) => `${record.medicationId}:${record.scheduledDay}`));
  for (let offset = -1; offset <= REMINDER_DAYS; offset++) {
    const day = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12));
    for (const medication of medications) {
      if (medication.notificationsEnabled === false || !isMedicationActiveOnDay(medication, day) || taken.has(`${medication.id}:${day}`)) continue;
      if (scheduledDate(day, medication.doseTime).getTime() < Date.parse(medication.createdAt)) continue;
      for (const { value: pattern } of NOTIFICATION_PATTERNS) {
        const request = reminderRequest(medication, day, pattern);
        if (request.trigger.date.getTime() <= now.getTime()) continue;
        if (pattern !== 'deadline') { desired.push(request); continue; }
        const deadlineAt = request.trigger.date.toISOString();
        let group = deadlines.get(deadlineAt);
        if (!group) {
          group = { request, names: [], occurrences: [] };
          deadlines.set(deadlineAt, group);
        }
        group.names.push(medication.name);
        group.occurrences.push({ medicationId: medication.id, scheduledDay: day });
      }
    }
  }
  for (const [deadlineAt, group] of deadlines) {
    desired.push({
      ...group.request,
      identifier: `${REMINDER_PREFIX}deadline:${deadlineAt}`,
      content: {
        ...group.request.content,
        body: deadlineBody(group.names.join('・')),
        data: { ...group.request.content.data, deadlineAt, occurrences: group.occurrences },
      },
    });
  }
  desired.sort((a, b) => a.trigger.date.getTime() - b.trigger.date.getTime() || a.identifier.localeCompare(b.identifier));
  const pending = await scheduler.list();
  const otherCount = pending.filter((item) => !item.identifier.startsWith(REMINDER_PREFIX)).length;
  const capacity = Math.max(0, MAX_REMINDERS - otherCount);
  // Reserve a dose's remaining alerts together. A plain chronological slice can
  // fill the budget with at-dose alerts and silently omit their later deadlines.
  const bundles = new Map<string, ScheduledReminder[]>();
  for (const request of desired) {
    const data = request.content.data;
    const occurrences = data.pattern === 'deadline'
      ? data.occurrences as { medicationId: number; scheduledDay: string }[]
      : [{ medicationId: data.medicationId, scheduledDay: data.scheduledDay }];
    for (const occurrence of occurrences) {
      const key = `${occurrence.medicationId}:${occurrence.scheduledDay}`;
      bundles.set(key, [...(bundles.get(key) ?? []), request]);
    }
  }
  const selectedIds = new Set<string>();
  for (const request of desired) {
    const data = request.content.data;
    const bundle = data.pattern === 'deadline' ? [request] : bundles.get(`${data.medicationId}:${data.scheduledDay}`) ?? [request];
    const additional = bundle.filter((item) => !selectedIds.has(item.identifier));
    if (selectedIds.size + additional.length <= capacity) additional.forEach((item) => selectedIds.add(item.identifier));
  }
  const selected = desired.filter((request) => selectedIds.has(request.identifier));
  const wanted = new Set(selected.map((item) => item.identifier));
  for (const item of pending) {
    if (item.identifier.startsWith(REMINDER_PREFIX) && !wanted.has(item.identifier)) await scheduler.cancel(item.identifier);
  }
  if (!capacity && desired.length) throw new Error('通知の予約上限（60件）に達しています。');
  for (const request of selected) {
    const existing = pending.find((item) => item.identifier === request.identifier);
    if (existing?.content.title === request.content.title && existing.content.body === request.content.body
      && existing.content.data?.fireAt === request.content.data.fireAt && existing.content.data?.version === REMINDER_VERSION
      && JSON.stringify(existing.content.data?.occurrences) === JSON.stringify(request.content.data.occurrences)) continue;
    await scheduler.schedule(request);
  }
  const confirmed = await scheduler.list();
  if (selected.some((request) => !confirmed.some((item) => item.identifier === request.identifier && item.content.body === request.content.body && item.content.data?.fireAt === request.content.data.fireAt))) {
    throw new Error('一部の通知を予約できませんでした。再試行してください。');
  }
  return selected.length;
}

// Dismissing a delivered reminder is separate from cancelling a future alarm.
// Keep payment results, demos, other dates and groups with untaken members.
export async function dismissTakenReminders(records: DoseRecord[], presenter: {
  list: () => Promise<PendingReminder[]>;
  dismiss: (identifier: string) => Promise<void>;
}) {
  const taken = new Set(records.map((record) => `${record.medicationId}:${record.scheduledDay}`));
  for (const notification of await presenter.list()) {
    const data = notification.content.data;
    if (data?.kind !== REMINDER_KIND || data.demo === true
      || !NOTIFICATION_PATTERNS.some(({ value }) => value === data.pattern)) continue;
    const occurrences = data.pattern === 'deadline' && Array.isArray(data.occurrences)
      ? data.occurrences : [{ medicationId: data.medicationId, scheduledDay: data.scheduledDay }];
    if (occurrences.length && occurrences.every((item) => item && typeof item.medicationId === 'number'
      && typeof item.scheduledDay === 'string' && taken.has(`${item.medicationId}:${item.scheduledDay}`))) {
      await presenter.dismiss(notification.identifier);
    }
  }
}
