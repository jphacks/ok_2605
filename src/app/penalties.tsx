import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { usePenalties } from '@/state/penalty-context';

export default function PenaltiesScreen() {
  const { payments, loading, error, refresh, retry } = usePenalties();
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState('');
  const locked = useRef(false);
  async function retryPayment(id: number) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setRetryError('');
    try { await retry(id); }
    catch { setRetryError('再試行の結果を保存できませんでした。もう一度お試しください。'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <MedicationScreen title="ペナルティ履歴" description="飲み忘れの判定とテスト決済の結果です。" backTo="/explore" busy={busy}>
    <View style={styles.card}><Text style={styles.title}>テスト決済・実際の請求なし</Text><Text style={styles.note}>予定時刻から30分の猶予を過ぎた未服用分を、起動時・復帰時に判定します。登録時刻より前の予定は対象になりません。実際のカード決済は接続されていません。</Text></View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void refresh()} style={styles.button}><Text style={styles.buttonText}>履歴を再読み込み</Text></Pressable>
    {!!(error || retryError) && <Text accessibilityRole="alert" style={styles.error}>{retryError || error}</Text>}
    {loading && <Text style={styles.note}>読み込み中…</Text>}
    {!loading && !error && !payments.length && <Text style={styles.note}>飲み忘れによるペナルティはありません。</Text>}
    {payments.map((payment) => <View key={payment.id} style={styles.card}>
      <Text style={styles.title}>{payment.medicationName}</Text>
      <Text style={styles.note}>{payment.scheduledDay}　{payment.doseTime}の予定</Text>
      <Text style={styles.amount}>¥{payment.amount.toLocaleString('ja-JP')}</Text>
      <Text style={payment.status === 'failed' ? styles.error : styles.title}>{payment.status === 'succeeded' ? 'テスト決済済み（請求なし）' : 'テスト決済失敗（未課金）'}</Text>
      <Text style={styles.note}>記録日時：{new Date(payment.createdAt).toLocaleString('ja-JP')}</Text>
      {!!payment.errorMessage && <Text style={styles.error}>{payment.errorMessage}</Text>}
      {payment.status === 'failed' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void retryPayment(payment.id)} style={styles.button}><Text style={styles.buttonText}>{busy ? '保存中…' : 'テスト決済を再試行'}</Text></Pressable>}
    </View>)}
  </MedicationScreen>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 12 },
  title: { color: C.ink, fontSize: 14, fontWeight: '700' },
  note: { color: C.muted, fontSize: 12, lineHeight: 22 },
  amount: { color: '#e77760', fontSize: 30, fontWeight: '700' },
  error: { color: C.error, fontSize: 13, lineHeight: 22 },
  button: { minHeight: 48, backgroundColor: C.mint, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
