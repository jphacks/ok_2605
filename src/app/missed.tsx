import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { medicationColors as C } from '@/components/medication-screen';
import { usePenalties } from '@/state/penalty-context';
import { BunnyArt } from '@/components/nomupay-art';
import { groupPenaltyPayments } from '@/features/payments/penalty-groups';

export default function MissedScreen() {
  const { demo, readingExpired } = useLocalSearchParams<{ demo?: string; readingExpired?: string }>();
  const demoMode = demo === '1';
  const { payments, pending, acknowledge, loading, error: loadError, refresh } = usePenalties();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const demoPayment = {
    id: -1, medicationId: 0, medicationName: 'デモのお薬', scheduledDay: 'デモ', doseTime: '08:00',
    deadlineAt: new Date().toISOString(), amount: 300, mode: 'test' as const, status: 'succeeded' as const,
    errorMessage: null, acknowledgedAt: null, createdAt: new Date().toISOString(),
  };
  const groups = groupPenaltyPayments(demoMode ? [demoPayment] : payments)
    .filter((group) => demoMode || group.payments.some((payment) => !payment.acknowledgedAt));
  const visiblePayments = groups.flatMap((group) => group.payments);
  const succeeded = visiblePayments.filter((payment) => payment.status === 'succeeded');
  const failed = visiblePayments.filter((payment) => payment.status === 'failed');
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []));

  async function confirm() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      if (demoMode) {
        router.dismissTo('/explore');
        return;
      }
      await acknowledge(pending.map((payment) => payment.id));
      router.dismissTo('/');
    } catch { setError('確認結果を保存できませんでした。もう一度お試しください。'); }
    finally { locked.current = false; setBusy(false); }
  }

  return <SafeAreaView style={styles.safe}>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>LET’S TRY AGAIN</Text>
      <BunnyArt />
      <Text accessibilityRole="header" style={styles.title}>{succeeded.length ? '課金されました' : failed.length ? '課金できませんでした' : '飲み忘れのお知らせ'}</Text>
      {!demoMode && readingExpired === '1' && <Text style={styles.copy}>服用期限を過ぎたため、読み取りできません。</Text>}
      <Text style={styles.copy}>{visiblePayments.length ? '設定した猶予を過ぎても\n服用の記録がなかった予定があります。' : loading ? '服薬状況を確認しています…' : '未確認のお知らせはありません。'}</Text>
      {demoMode && <Text style={styles.demoNote}>これは表示確認用のデモです。実際の決済・服薬記録は変更されません。</Text>}
      {groups.map((group) => <View key={group.deadlineAt} style={styles.card}>
        <Text style={styles.heading}>今回のペナルティ（テスト決済）</Text>
        <Text style={styles.copy}>課金予定日時：{new Date(group.deadlineAt).toLocaleString('ja-JP')}</Text>
        <Text style={styles.heading}>合計課金額</Text>
        <Text style={styles.amount}>¥{group.totalAmount.toLocaleString('ja-JP')}</Text>
        <Text style={styles.notice}>実際の請求はありません。端末内のテスト決済です。</Text>
        {group.payments.map((payment) => <View key={payment.id} style={styles.row}>
          <Text style={styles.heading}>{payment.medicationName}</Text>
          <Text style={styles.copy}>{payment.scheduledDay}　{payment.doseTime}</Text>
          <Text style={styles.copy}>確認期限：{new Date(payment.deadlineAt).toLocaleString('ja-JP')}</Text>
          <Text style={payment.status === 'failed' ? styles.error : styles.copy}>{payment.amount.toLocaleString('ja-JP')}円 · {payment.status === 'succeeded' ? '課金されました（テスト）' : '決済失敗（未課金）'}</Text>
        </View>)}
      </View>)}
      {!demoMode && failed.length > 0 && <Text style={styles.error}>失敗した{failed.length}件は課金されていません。合計課金額には含まれません。設定の「ペナルティ履歴」から再試行できます。</Text>}
      {!!(error || loadError) && <Text accessibilityRole="alert" style={styles.error}>{error || loadError}</Text>}
      {!!loadError && <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.button}><Text style={styles.buttonText}>再読み込み</Text></Pressable>}
      <Text style={styles.copy}>次の約束につなげよう。{ '\n' }のむペイも一緒に応援しているよ。</Text>
      <Pressable accessibilityRole="button" disabled={busy || (!demoMode && loading)} onPress={() => void confirm()} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? '保存中…' : demoMode ? 'デモを閉じる' : '確認してホームへ'}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingVertical: 40, gap: 20, alignItems: 'center' },
  kicker: { fontSize: 10, letterSpacing: 1.5, color: '#d98a9b' },
  title: { fontSize: 27, fontWeight: '800', color: C.ink, textAlign: 'center' },
  bear: { fontSize: 90 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 16 },
  heading: { color: C.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  amount: { color: '#e77760', fontSize: 42, fontWeight: '700', textAlign: 'center' },
  copy: { color: C.ink, fontSize: 13, lineHeight: 24, textAlign: 'center' },
  notice: { color: C.muted, fontSize: 12, lineHeight: 21, textAlign: 'center' },
  demoNote: { color: '#8a5a12', backgroundColor: '#fff8e8', borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 20, textAlign: 'center' },
  row: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 4 },
  error: { color: C.error, fontSize: 13, lineHeight: 23, textAlign: 'center' },
  button: { minHeight: 52, width: '100%', padding: 14, borderRadius: 14, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
