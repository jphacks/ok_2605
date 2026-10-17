import type { Medication } from '../medications/medication.ts';

export const REMINDER_KIND = 'medication-reminder';
export const REMINDER_PREFIX = 'nomupay:reminder:';
// Leave room for other notifications in iOS's pending notification queue.
export const MAX_REMINDERS = 60;

export function reminderMedicationId(data: Record<string, unknown> | undefined): number | null {
  const id = data?.medicationId;
  return data?.kind === REMINDER_KIND && typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function reminderRequest(medication: Medication) {
  const [hour, minute] = medication.doseTime.split(':').map(Number);
  return {
    identifier: `${REMINDER_PREFIX}${medication.id}`,
    content: {
      title: 'おくすりの時間です',
      body: `${medication.name}：${medication.doseTime}の服用時間です。`,
      sound: 'default',
      data: { kind: REMINDER_KIND, medicationId: medication.id, doseTime: medication.doseTime, version: 1 },
    },
    trigger: { type: 'daily' as const, hour, minute },
  };
}

export type PendingReminder = {
  identifier: string;
  content: { title?: string | null; body?: string | null; data?: Record<string, unknown> };
};
export type ReminderScheduler = {
  list: () => Promise<PendingReminder[]>;
  cancel: (id: string) => Promise<void>;
  schedule: (request: ReturnType<typeof reminderRequest>) => Promise<unknown>;
};

export async function reconcileReminders(medications: Medication[], scheduler: ReminderScheduler) {
  const pending = await scheduler.list();
  const otherCount = pending.filter((item) => !item.identifier.startsWith(REMINDER_PREFIX)).length;
  if (medications.length + otherCount > MAX_REMINDERS) {
    throw new Error('通知の予約上限を超えています。服薬通知を含む予約は60件までです。');
  }
  const desired = medications.map(reminderRequest);
  const wanted = new Set(desired.map((item) => item.identifier));
  for (const item of pending) {
    if (item.identifier.startsWith(REMINDER_PREFIX) && !wanted.has(item.identifier)) await scheduler.cancel(item.identifier);
  }
  for (const request of desired) {
    const existing = pending.find((item) => item.identifier === request.identifier);
    if (existing?.content.title === request.content.title && existing.content.body === request.content.body
      && existing.content.data?.version === 1 && existing.content.data?.doseTime === request.content.data.doseTime
      && reminderMedicationId(existing.content.data) === request.content.data.medicationId) continue;
    // The stable identifier replaces an existing request instead of duplicating it.
    await scheduler.schedule(request);
  }
  const confirmed = await scheduler.list();
  if (desired.some((request) => !confirmed.some((item) => item.identifier === request.identifier && item.content.body === request.content.body))) {
    throw new Error('一部の通知を予約できませんでした。再試行してください。');
  }
  return desired.length;
}
