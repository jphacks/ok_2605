import * as Notifications from 'expo-notifications';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { medicationColors as C } from '@/components/medication-screen';
import { getMedicationDatabase } from '@/features/medications/database';
import { usePenalties } from '@/state/penalty-context';
import VerificationScreen from './verification-screen';
import { resolveVerificationEntry, type VerificationEntry } from './verification-entry';

export default function VerificationEntryScreen({ allowReader = true }: { allowReader?: boolean }) {
  const params = useLocalSearchParams<{
    medicationId?: string; scheduledDay?: string; expectedDoseAt?: string;
    fromReminder?: string; notificationKey?: string; entryAttempt?: string;
  }>();
  const { medicationId, scheduledDay, expectedDoseAt, fromReminder, notificationKey, entryAttempt } = params;
  const router = useRouter();
  const { refresh: refreshPenalties } = usePenalties();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [retry, setRetry] = useState(0);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState<{ key: string; decision: VerificationEntry } | null>(null);
  const key = JSON.stringify([medicationId, scheduledDay, expectedDoseAt, notificationKey, entryAttempt, allowReader, retry]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Never remount a reader using the decision made before backgrounding.
      setChecking(true);
      setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useFocusEffect(useCallback(() => {
    if (!foreground) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Clear only this tap after the guarded route has mounted. Clearing it in
    // the observer races the global pending-payment redirect on cold start.
    if (fromReminder === '1') {
      const last = Notifications.getLastNotificationResponse();
      if (last && `${last.notification.request.identifier}:${last.notification.date}` === notificationKey) {
        Notifications.clearLastNotificationResponse();
      }
    }
    async function check() {
      setChecking(true); setError('');
      try {
        const decision = await resolveVerificationEntry(await getMedicationDatabase(), {
          medicationId: Number(medicationId), scheduledDay: scheduledDay ?? '', expectedDoseAt,
        });
        if (!active) return;
        if (decision.kind === 'payment') {
          // Publish the reconciled results before rendering the payment screen.
          await refreshPenalties();
          if (active) router.replace({ pathname: '/missed', params: { readingExpired: '1' } });
          return;
        }
        setEntry({ key, decision: !allowReader && decision.kind === 'ready'
          ? { kind: 'unavailable', medicationName: decision.medicationName } : decision }); setChecking(false);
        if (allowReader && decision.kind === 'ready') {
          // Unmount the native NFC session / camera as soon as its window ends.
          timer = setTimeout(() => { void check(); }, Math.max(0, Date.parse(decision.deadlineAt) - Date.now()));
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : '服薬状況を確認できませんでした。再試行してください。');
          setChecking(false);
        }
      }
    }
    void check();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      setChecking(true);
      setEntry(null);
    };
  }, [foreground, medicationId, scheduledDay, expectedDoseAt, fromReminder, notificationKey, key, allowReader, refreshPenalties, router]));

  const decision = entry?.key === key ? entry.decision : null;
  if (allowReader && foreground && !checking && !error && decision?.kind === 'ready') return <VerificationScreen />;
  const loading = !foreground || (!error && (checking || !decision));
  const title = error ? '服薬状況を確認できませんでした'
    : loading ? '服薬状況を確認しています…'
      : decision?.kind === 'taken' ? '服用を記録済みです'
        : decision?.kind === 'unavailable' ? '服薬予定が見つかりません' : '読み取り時間外です';
  const body = error || (decision?.kind === 'taken' ? `${decision.medicationName}は、この予定日の服用を記録済みです。`
    : decision?.kind === 'expired' ? '服用期限を過ぎたため、読み取りできません。ホームで次の服薬予定を確認してください。'
      : decision?.kind === 'not-started' ? 'まだ服用の受付時間になっていません。ホームで予定を確認してください。'
        : decision?.kind === 'unavailable' ? '予定が変更・削除されたか、対象の受付期間外です。ホームから選び直してください。' : '');
  return <SafeAreaView style={styles.safe}>
    <Stack.Screen options={{ gestureEnabled: !loading }} />
    {loading && <ActivityIndicator size="large" color={C.mint} />}
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {!loading && !!body && <Text accessibilityRole={error ? 'alert' : undefined} style={styles.body}>{body}</Text>}
    {!!error && <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRetry((value) => value + 1)}><Text style={styles.buttonText}>再試行</Text></Pressable>}
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.dismissTo('/')}><Text style={styles.buttonText}>ホームへ戻る</Text></Pressable>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 20 },
  title: { color: C.ink, fontSize: 23, fontWeight: '800', textAlign: 'center' },
  body: { color: C.muted, fontSize: 14, lineHeight: 24, textAlign: 'center' },
  button: { width: '100%', minHeight: 48, backgroundColor: C.mint, padding: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
