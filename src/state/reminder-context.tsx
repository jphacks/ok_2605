import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { reconcileReminders, reminderMedicationId } from '@/features/reminders/reminder-plan';
import { useMedicationRegistry } from './medication-registry-context';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

type ReminderState = {
  message: string;
  error: string | null;
  busy: boolean;
  enable: () => Promise<void>;
  refresh: () => Promise<void>;
};
const Context = createContext<ReminderState | null>(null);

export function ReminderProvider({ children }: PropsWithChildren) {
  const { medications, isLoading, loadError } = useMedicationRegistry();
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
        let permission = await Notifications.getPermissionsAsync();
        if (requestPermission && permission.canAskAgain && !permission.granted) {
          permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
        }
        const allowed = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        if (!allowed) {
          setMessage(permission.canAskAgain ? '通知は未許可です。「通知を許可する」で有効にできます。' : '通知が許可されていません。iPhoneの設定で通知を許可してください。');
          return;
        }
        const current = latest.current;
        if (current.isLoading) { setMessage('薬を読み込み中です…'); return; }
        if (current.loadError) throw new Error('薬を読み込めないため通知を更新できません。お薬画面で再読み込みしてください。');
        const count = await reconcileReminders(current.medications, {
          list: Notifications.getAllScheduledNotificationsAsync,
          cancel: Notifications.cancelScheduledNotificationAsync,
          schedule: (request) => Notifications.scheduleNotificationAsync({
            ...request, trigger: { ...request.trigger, type: Notifications.SchedulableTriggerInputTypes.DAILY },
          }),
        });
        const quiet = permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        setMessage(count ? `${count}件のお薬を毎日の服用時刻に通知します。${quiet ? '現在は通知センターのみへの静かな通知です。' : ''}` : '薬を登録すると、服用時刻の通知を自動で予約します。');
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
  }, [medications, isLoading, loadError, synchronize]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void synchronize(); });
    return () => subscription.remove();
  }, [synchronize]);

  const response = Notifications.useLastNotificationResponse();
  const navigation = useRootNavigationState();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!navigation?.key || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const notification = response.notification;
    const key = `${notification.request.identifier}:${notification.date}`;
    if (handled.current === key) return;
    const id = reminderMedicationId(notification.request.content.data);
    if (id === null) return;
    handled.current = key;
    router.push({ pathname: '/medications/[id]', params: { id: String(id) } });
    Notifications.clearLastNotificationResponse();
  }, [response, navigation?.key]);

  return <Context.Provider value={{ message, error, busy, enable: () => synchronize(true), refresh: () => synchronize() }}>{children}</Context.Provider>;
}

export function useReminders() {
  const value = useContext(Context);
  if (!value) throw new Error('ReminderProvider is required');
  return value;
}
