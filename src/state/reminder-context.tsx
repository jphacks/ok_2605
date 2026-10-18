import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { isLocalDay, localDay } from '@/features/medications/dose-record';
import { reconcileReminders, reminderMedicationId, notificationContent, NOTIFICATION_PATTERNS, REMINDER_DAYS, type NotificationPattern } from '@/features/reminders/reminder-plan';
import { getMedicationDatabase } from '@/features/medications/database';
import { listDoseRecordsBetween } from '@/features/medications/dose-record-repository';
import { deliverPaymentNotifications } from '@/features/reminders/payment-notifications';
import type { PenaltyPayment } from '@/features/payments/penalty-repository';
import { useNativeNotificationResponse } from '@/hooks/use-native-notification-response';
import { useMedicationRegistry } from './medication-registry-context';
import { useDoseRecords } from './dose-record-context';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

type ReminderState = {
  message: string;
  error: string | null;
  busy: boolean;
  enable: () => Promise<void>;
  refresh: () => Promise<void>;
  sendDemo: (pattern: NotificationPattern | 'all') => Promise<void>;
  notifyPayments: (payments: PenaltyPayment[]) => Promise<void>;
};
const Context = createContext<ReminderState | null>(null);

export function ReminderProvider({ children }: PropsWithChildren) {
  const { medications, isLoading, loadError } = useMedicationRegistry();
  const { records } = useDoseRecords();
  const [message, setMessage] = useState('通知の設定を確認しています…');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef({ medications, isLoading, loadError });
  useEffect(() => { latest.current = { medications, isLoading, loadError }; }, [medications, isLoading, loadError]);

  const synchronize = useCallback((requestPermission = false) => {
    const work = queue.current.then(async () => {
      setBusy(true); setError(null);
      try {
        if (Platform.OS === 'web') {
          setMessage('Web版では通知機能を利用できません。');
          return;
        }
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('medication-reminders', {
            name: '服薬リマインダー', importance: Notifications.AndroidImportance.HIGH,
          });
        }
        let permission = await Notifications.getPermissionsAsync();
        if (requestPermission && permission.canAskAgain && !permission.granted) {
          permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
        }
        const allowed = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        if (!allowed) {
          setMessage(permission.canAskAgain ? '通知は未許可です。「通知を許可する」で有効にできます。' : '通知が許可されていません。端末の設定で通知を許可してください。');
          return;
        }
        const current = latest.current;
        if (current.isLoading) { setMessage('薬を読み込み中です…'); return; }
        if (current.loadError) throw new Error('薬を読み込めないため通知を更新できません。お薬画面で再読み込みしてください。');
        const now = new Date();
        const from = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
        const through = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + REMINDER_DAYS, 12));
        const savedRecords = await listDoseRecordsBetween(await getMedicationDatabase(), from, through);
        const count = await reconcileReminders(current.medications, {
          list: Notifications.getAllScheduledNotificationsAsync,
          cancel: Notifications.cancelScheduledNotificationAsync,
          schedule: (request) => Notifications.scheduleNotificationAsync({
            ...request, trigger: {
              ...request.trigger, type: Notifications.SchedulableTriggerInputTypes.DATE,
              ...(Platform.OS === 'android' ? { channelId: 'medication-reminders' } : {}),
            },
          }),
        }, savedRecords, now);
        const quiet = permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        setMessage(count ? `服用10分前・課金10分前の通知を${count}件予約しました。${quiet ? '現在は通知センターのみへの静かな通知です。' : ''}` : '現在予約できる通知はありません。薬の登録と通知設定をご確認ください。');
      } catch (cause) {
        setMessage('通知の予約を確認できませんでした。');
        setError(cause instanceof Error ? cause.message : '通知を設定できませんでした。再試行してください。');
      } finally { setBusy(false); }
    });
    queue.current = work;
    return work;
  }, []);

  useEffect(() => {
    void synchronize();
  }, [medications, isLoading, loadError, records, synchronize]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void synchronize(); });
    return () => subscription.remove();
  }, [synchronize]);

  const notifyPayments = useCallback((payments: PenaltyPayment[]) => {
    const work = queue.current.then(async () => {
      try {
        if (!await prepareNotifications(false)) return;
        await deliverPaymentNotifications(await getMedicationDatabase(), payments, (identifier, content) =>
          Notifications.scheduleNotificationAsync({ identifier, content, trigger: Platform.OS === 'android' ? { channelId: 'medication-reminders' } : null }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '決済結果の通知を送れませんでした。');
      }
    });
    queue.current = work;
    return work;
  }, []);

  const sendDemo = useCallback((pattern: NotificationPattern | 'all') => {
    const work = queue.current.then(async () => {
      setBusy(true); setError(null);
      let sent = 0;
      try {
        if (!await prepareNotifications(true)) throw new Error('端末の設定で通知を許可してください。');
        const medication = latest.current.medications[0] ?? { id: 0, name: 'デモのお薬', doseTime: '09:00', penaltyAmount: 100 };
        const patterns = pattern === 'all' ? NOTIFICATION_PATTERNS.map((item) => item.value) : [pattern];
        for (const [index, value] of patterns.entries()) {
          await Notifications.scheduleNotificationAsync({
            content: notificationContent(value, medication, localDay(new Date()), true),
            trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 + index * 4,
              ...(Platform.OS === 'android' ? { channelId: 'medication-reminders' } : {}) },
          });
          sent++;
        }
        setMessage(`${sent}種類のデモ通知を予約しました。2秒後から順に表示します。服薬記録・決済は変更されません。`);
      } catch (cause) {
        setError(`${sent ? `${sent}件は予約済みです。` : ''}${cause instanceof Error ? cause.message : 'デモ通知を送れませんでした。'}`);
      } finally { setBusy(false); }
    });
    queue.current = work;
    return work;
  }, []);

  const response = useNativeNotificationResponse();
  const navigation = useRootNavigationState();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!navigation?.key || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const notification = response.notification;
    const key = `${notification.request.identifier}:${notification.date}`;
    if (handled.current === key) return;
    const data = notification.request.content.data;
    if (data?.kind === 'medication-reminder' && (data.demo === true || data.pattern === 'charged')) {
      handled.current = key;
      router.replace(data.demo === true ? '/reminders' : '/penalties');
      Notifications.clearLastNotificationResponse();
      return;
    }
    const id = reminderMedicationId(data);
    if (id === null) return;
    // SDK 57 native responses use seconds on iOS and milliseconds on Android.
    const receivedAt = new Date(Platform.OS === 'ios' ? notification.date * 1000 : notification.date);
    handled.current = key;
    router.replace({
      pathname: '/verify',
      params: {
        medicationId: String(id),
        scheduledDay: typeof data?.scheduledDay === 'string' && isLocalDay(data.scheduledDay) ? data.scheduledDay : localDay(receivedAt),
      },
    });
    Notifications.clearLastNotificationResponse();
  }, [response, navigation?.key]);

  return <Context.Provider value={{ message, error, busy, enable: () => synchronize(true), refresh: () => synchronize(), sendDemo, notifyPayments }}>{children}</Context.Provider>;
}

async function prepareNotifications(requestPermission: boolean) {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('medication-reminders', {
    name: '服薬・決済のお知らせ', importance: Notifications.AndroidImportance.HIGH,
  });
  let permission = await Notifications.getPermissionsAsync();
  if (requestPermission && permission.canAskAgain && !permission.granted) permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export function useReminders() {
  const value = useContext(Context);
  if (!value) throw new Error('ReminderProvider is required');
  return value;
}
