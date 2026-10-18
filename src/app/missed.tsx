import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { medicationColors as C } from '@/components/medication-screen';
import { usePenalties } from '@/state/penalty-context';

export default function MissedScreen() {
  const { pending, acknowledge, loading, error: loadError, refresh } = usePenalties();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const succeeded = pending.filter((payment) => payment.status === 'succeeded');
  const failed = pending.filter((payment) => payment.status === 'failed');
  const total = succeeded.reduce((sum, payment) => sum + payment.amount, 0);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []));

  async function confirm() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      await acknowledge(pending.map((payment) => payment.id));
      router.dismissTo('/');
    } catch { setError('確認結果を保存できませんでした。もう一度お試しください。'); }
    finally { locked.current = false; setBusy(false); }
  }

  return <SafeAreaView style={styles.safe}>
    <Stack.Screen options={{ gestureEnabled: false }} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>LET’S TRY AGAIN</Text>
      <Text style={styles.bear} accessibilityLabel="応援するくま">🐻</Text>
      <Text accessibilityRole="header" style={styles.title}>{succeeded.length ? '課金されました' : failed.length ? '課金できませんでした' : '飲み忘れのお知らせ'}</Text>
      <Text style={styles.copy}>{pending.length ? '服薬時刻から30分以内に\n服用の記録がなかった予定があります。' : loading ? '服薬状況を確認しています…' : '未確認のお知らせはありません。'}</Text>
      {pending.length > 0 && <View style={styles.card}>
        <Text style={styles.heading}>今回のペナルティ（テスト決済）</Text>
        <Text style={styles.amount}>¥{total.toLocaleString('ja-JP')}</Text>
        <Text style={styles.notice}>実際の請求はありません。端末内のテスト決済です。</Text>
        {pending.map((payment) => <View key={payment.id} style={styles.row}>
          <Text style={styles.heading}>{payment.medicationName}</Text>
          <Text style={styles.copy}>{payment.scheduledDay}　{payment.doseTime}</Text>
          <Text style={payment.status === 'failed' ? styles.error : styles.copy}>{payment.amount.toLocaleString()}円 · {payment.status === 'succeeded' ? 'テスト決済済み' : '決済失敗（未課金）'}</Text>
        </View>)}
        {failed.length > 0 && <Text style={styles.error}>失敗した{failed.length}件は課金されていません。設定の「ペナルティ履歴」から再試行できます。</Text>}
      </View>}
      {!!(error || loadError) && <Text accessibilityRole="alert" style={styles.error}>{error || loadError}</Text>}
      {!!loadError && <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.button}><Text style={styles.buttonText}>再読み込み</Text></Pressable>}
      <Text style={styles.copy}>次の約束につなげよう。{ '\n' }くまも一緒に応援しているよ。</Text>
      <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void confirm()} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? '保存中…' : '確認してホームへ'}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: 24, paddingVertical: 40, gap: 20, alignItems: 'center' },
  kicker: { fontSize: 10, letterSpacing: 1.5, color: '#5e9696' },
  title: { fontSize: 27, fontWeight: '800', color: C.ink, textAlign: 'center' },
  bear: { fontSize: 90 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 16 },
  heading: { color: C.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  amount: { color: '#e77760', fontSize: 42, fontWeight: '700', textAlign: 'center' },
  copy: { color: C.ink, fontSize: 13, lineHeight: 24, textAlign: 'center' },
  notice: { color: C.muted, fontSize: 12, lineHeight: 21, textAlign: 'center' },
  row: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 4 },
  error: { color: C.error, fontSize: 13, lineHeight: 23, textAlign: 'center' },
  button: { minHeight: 52, width: '100%', padding: 14, borderRadius: 14, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
