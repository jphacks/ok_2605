import { Link, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { getMedicationDatabase } from '@/features/medications/database';
import { DemoPaymentInputError, localDay, type DemoOutcome, type DemoPayment, type DemoPaymentAttempt, type DemoScenario } from '@/features/payments/demo-payment';
import { listDemoPayments, listDemoPaymentAttempts, runDemoPayment, retryDemoPayment } from '@/features/payments/demo-payment-repository';
import { useMedicationRegistry } from '@/state/medication-registry-context';

export default function PaymentsScreen() {
  const { medications, isLoading, loadError, reloadMedications } = useMedicationRegistry();
  const [selectedId, setSelectedId] = useState<number>();
  const [day, setDay] = useState(() => localDay(new Date()));
  const [scenario, setScenario] = useState<DemoScenario>('overdue');
  const [outcome, setOutcome] = useState<DemoOutcome>('success');
  const [payments, setPayments] = useState<DemoPayment[]>([]);
  const [attempts, setAttempts] = useState<DemoPaymentAttempt[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const selected = medications.find((item) => item.id === selectedId) ?? medications[0];

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const db = await getMedicationDatabase();
        const rows = await listDemoPayments(db);
        const logs = await listDemoPaymentAttempts(db);
        if (active) { setPayments(rows); setAttempts(logs); }
      } catch { if (active) setHistoryError('履歴を読み込めませんでした。再読み込みしてください。'); }
      finally { if (active) setHistoryLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  async function refreshHistory() {
    setHistoryLoading(true);
    try {
      const db = await getMedicationDatabase();
      const rows = await listDemoPayments(db);
      const logs = await listDemoPaymentAttempts(db);
      setPayments(rows); setAttempts(logs); setHistoryError('');
    } catch { setHistoryError('履歴を読み込めませんでした。再読み込みしてください。'); }
    finally { setHistoryLoading(false); }
  }

  async function execute(paymentId?: number) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(''); setError('');
    try {
      const db = await getMedicationDatabase();
      const result = paymentId === undefined
        ? await runDemoPayment(db, { medicationId: selected?.id ?? 0, day, scenario, outcome })
        : await retryDemoPayment(db, paymentId, 'success');
      if (result.kind === 'skipped') {
        setMessage(result.reason === 'taken' ? '服用済みのため、デモ課金は行いません。' : '猶予時間内のため、デモ課金は行いません。');
      } else if (result.kind === 'already-succeeded') {
        setMessage('この服薬予定はデモ課金済みです。重複する課金は行いません。');
      } else if (result.payment.status === 'failed') {
        setError('デモ決済に失敗しました。失敗履歴を保存しました。履歴から再試行できます。');
      } else {
        setMessage(`${result.payment.amount.toLocaleString()}円のデモ決済が完了しました。実際の請求はありません。`);
      }
      await refreshHistory();
    } catch (cause) {
      setError(cause instanceof DemoPaymentInputError ? cause.message : 'デモ決済を保存できませんでした。時間をおいて再試行してください。');
    } finally { locked.current = false; setBusy(false); }
  }

  return (
    <MedicationScreen title="ペナルティ課金（デモ）" description="今日の一歩を、明日につなげよう。" backTo="/explore" busy={busy}>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <View style={styles.notice}><Text style={styles.label}>DEMO — 実際のお金は動きません</Text><Text style={styles.note}>登録した金額で成功・失敗を再現します。カード登録や決済サービスへの通信はありません。自動課金ではなく、ボタンで服薬状況を再現するデモです。</Text></View>
      <View style={styles.card}>
        <Text style={styles.heading}>ペナルティのお知らせ</Text>
        <Text style={styles.note}>1回の飲み忘れにつき</Text>
        <Text style={styles.amount}>{selected ? `${selected.penaltyAmount.toLocaleString()}円` : '—'}</Text>
        {isLoading && <Text style={styles.note}>お薬を読み込み中…</Text>}
        {loadError && <><Text style={styles.error}>{loadError}</Text><Pressable disabled={busy} onPress={() => void reloadMedications()} style={styles.option}><Text>お薬を再読み込み</Text></Pressable></>}
        {!isLoading && !loadError && medications.length === 0 && <Link href="/medications/new" style={styles.label}>先にお薬を登録してください ›</Link>}
        {medications.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selected?.id === item.id }} disabled={busy} onPress={() => { setSelectedId(item.id); setMessage(''); setError(''); }} style={[styles.option, selected?.id === item.id && styles.chosen]}><Text style={styles.label}>{item.name}　{item.doseTime}</Text></Pressable>)}
        <Text style={styles.label}>再現する服薬予定の日付</Text>
        <TextInput accessibilityLabel="服薬予定の日付（YYYY-MM-DD）" value={day} onChangeText={(value) => { setDay(value); setMessage(''); setError(''); }} editable={!busy} autoCapitalize="none" placeholder="YYYY-MM-DD" maxLength={10} style={styles.input} />
        <Text style={styles.note}>猶予はデモ用に30分。選んだ薬・日付・時刻が同じ場合、成功した決済は繰り返しません。QR・NFCの服用記録がある薬・日付は、ここで未服用を選んでも課金デモをスキップします。</Text>
        {([['overdue', '未服用・猶予時間終了後'], ['within-grace', '未服用・猶予時間内'], ['taken', '服用済み']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: scenario === value }} disabled={busy} onPress={() => { setScenario(value); setMessage(''); setError(''); }} style={[styles.option, scenario === value && styles.chosen]}><Text style={styles.label}>{label}</Text></Pressable>)}
        <Text style={styles.label}>決済結果の再現</Text>
        <View style={styles.row}>{([['success', '成功'], ['failure', '失敗']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: outcome === value }} disabled={busy} onPress={() => setOutcome(value)} style={[styles.option, styles.flex, outcome === value && styles.chosen]}><Text style={styles.label}>{label}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="button" disabled={busy || isLoading || !!loadError || !selected} onPress={() => void execute()} style={[styles.button, (busy || isLoading || !!loadError || !selected) && styles.disabled]}><Text style={styles.buttonText}>{busy ? '保存中…' : 'この状況でデモ課金を試す'}</Text></Pressable>
        {!!message && <Text accessibilityLiveRegion="polite" style={styles.label}>{message}</Text>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
      <Text style={styles.heading}>デモ決済履歴</Text>
      {historyLoading && <Text style={styles.note}>履歴を読み込み中…</Text>}
      {!!historyError && <Text style={styles.error}>{historyError}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || historyLoading} onPress={() => void refreshHistory()} style={styles.option}><Text style={styles.label}>履歴を再読み込み</Text></Pressable>
      {!historyLoading && !historyError && !payments.length && <Text style={styles.note}>まだ履歴はありません。</Text>}
      {payments.map((payment) => <View key={payment.id} style={styles.card}>
        <Text style={styles.label}>{payment.medicationName}</Text>
        <Text style={styles.note}>服薬予定：{payment.scheduledDay} {payment.doseTime}</Text>
        <Text style={styles.amount}>{payment.amount.toLocaleString()}円</Text>
        <Text style={payment.status === 'failed' ? styles.error : styles.label}>{payment.status === 'succeeded' ? 'デモ決済済み（請求なし）' : 'デモ決済失敗'}</Text>
        {attempts.filter((attempt) => attempt.paymentId === payment.id).map((attempt) => <Text key={attempt.id} style={styles.note}>{attempt.attemptNumber}回目：{attempt.status === 'succeeded' ? '成功' : '失敗'} / {new Date(attempt.createdAt).toLocaleString('ja-JP')}{attempt.errorMessage ? `\n${attempt.errorMessage}` : ''}</Text>)}
        {payment.status === 'failed' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void execute(payment.id)} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>成功するデモで再試行</Text></Pressable>}
      </View>)}
      <Text style={styles.note}>履歴はこの端末に保存されます。アプリの削除・データ消去で失われます。実際の服薬記録は変更しません。</Text>
    </MedicationScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 14 },
  notice: { backgroundColor: C.pale, borderRadius: 16, padding: 16, gap: 8 },
  heading: { color: C.ink, fontSize: 16, fontWeight: '600' },
  label: { color: C.ink, fontSize: 13, lineHeight: 22 },
  note: { color: C.muted, fontSize: 11, lineHeight: 21 },
  amount: { color: '#e77760', fontSize: 32, fontWeight: '600', textAlign: 'center' },
  option: { minHeight: 44, justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: C.line, borderRadius: 12 },
  chosen: { backgroundColor: C.pale, borderColor: C.mint },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, color: C.ink },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  button: { minHeight: 48, backgroundColor: '#2d414c', borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  error: { color: C.error, fontSize: 12, lineHeight: 22 },
});
