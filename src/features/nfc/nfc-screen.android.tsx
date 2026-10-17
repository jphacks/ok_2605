import { Link, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationRegistryStatus } from '@/components/medication-registry-status';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { getMedicationDatabase } from '@/features/medications/database';
import { useMedicationRegistry } from '@/state/medication-registry-context';
import { useNfcBox } from '@/state/nfc-box-context';
import { useDoseRecords } from '@/state/dose-record-context';
import { confirmNfcDoses, pendingNfcDoses, saveNfcBox } from './nfc-box-repository';
import { NfcReadError, openNfcSettings, readNfcTag } from './nfc-reader.android';

export default function NfcScreen() {
  const { medications, isLoading, loadError } = useMedicationRegistry();
  const { box, records, now, loading, error: boxError, reload } = useNfcBox();
  const { refresh: refreshDoseRecords } = useDoseRecords();
  const [selection, setSelection] = useState<{ key: string; ids: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const savedIds = box?.medications.map((medication) => medication.id).join(',') ?? '';
  const tagId = box?.tagId;
  const selectionKey = `${tagId ?? ''}:${savedIds}`;
  const selectedIds = selection?.key === selectionKey ? selection.ids : savedIds ? savedIds.split(',').map(Number) : [];
  useFocusEffect(useCallback(() => {
    active.current = true;
    if (!locked.current) setBusy(false);
    void reload();
    return () => { active.current = false; controller.current?.abort(); };
  }, [reload]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') controller.current?.abort();
    });
    return () => subscription.remove();
  }, []);

  async function scan(mode: 'register' | 'verify') {
    if (locked.current || isLoading || loadError || loading || boxError || !active.current) return;
    if (mode === 'register' && !selectedIds.length) { setError('薬箱に入っている薬を選んでください。'); return; }
    locked.current = true;
    const request = new AbortController();
    controller.current = request;
    const ids = [...selectedIds];
    setBusy(true); setError('');
    setMessage(mode === 'register' ? '登録する薬箱のタグに、スマホ背面を近づけてください。' : '飲んだ後、登録した薬箱のタグにスマホ背面を近づけてください。');
    try {
      const id = await readNfcTag(request.signal);
      if (request.signal.aborted || !active.current) return;
      const db = await getMedicationDatabase();
      if (mode === 'register') {
        await saveNfcBox(db, id, ids, request.signal);
        if (active.current) setMessage(`薬箱のタグと${ids.length}件の薬を登録しました。登録だけでは服用済みになりません。`);
      } else {
        const result = await confirmNfcDoses(db, id, request.signal);
        if (active.current) setMessage(result.recorded
          ? `${result.names.join('・')}の服用を記録しました。新しい記録は${result.recorded}件です。`
          : '対象のお薬は記録済みです。重複して記録しませんでした。');
      }
      await Promise.all([reload(), refreshDoseRecords()]);
    } catch (cause) {
      if (active.current) {
        if (request.signal.aborted || (cause instanceof NfcReadError && cause.code === 'cancelled')) setMessage('読み取りを中止しました。');
        else { setMessage(''); setError(cause instanceof Error ? cause.message : '読み取りを完了できませんでした。もう一度お試しください。'); }
      }
    } finally {
      if (controller.current === request) controller.current = null;
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }

  function register() {
    if (box) {
      Alert.alert('薬箱の登録を更新します', '選んだ薬と、次に読み取るタグで登録を置き換えます。過去の服用記録は残ります。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'タグを読み取る', onPress: () => void scan('register') },
      ]);
    } else void scan('register');
  }

  const due = pendingNfcDoses(box, now);
  const hasRecord = (medicationId: number, day: string, doseTime: string) => records.some(
    (record) => record.medicationId === medicationId && record.scheduledDay === day && record.doseTime === doseTime,
  );
  const unavailable = busy || isLoading || !!loadError || loading || !!boxError;
  return <MedicationScreen title="薬箱のNFC" description="薬箱のタグ1つで、その時間のお薬の服用を確認します。" backTo="/explore" busy={busy}>
    <Stack.Screen options={{ gestureEnabled: !busy }} />
    <MedicationRegistryStatus />
    {(loading || !!boxError) && <View style={styles.card}>
      <Text style={styles.error}>{boxError ?? '薬箱の情報を読み込み中…'}</Text>
      {!!boxError && <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.secondary}><Text>再読み込み</Text></Pressable>}
    </View>}
    <View style={styles.card}>
      <Text style={styles.heading}>今の服用確認</Text>
      {!box && <Text style={styles.note}>下の「薬箱のタグを登録」で、タグと薬を紐づけてください。</Text>}
      {box && !due.length && <Text style={styles.note}>現在、服用時刻から30分以内の薬はありません。</Text>}
      {due.map(({ medication, day, deadline }) => <View key={`${medication.id}:${day}`} style={styles.row}>
        <Text style={styles.text}>{medication.name}　{day} {medication.doseTime}</Text>
        <Text style={styles.note}>{hasRecord(medication.id, day, medication.doseTime) ? '✓ 服用記録済み' : `確認期限：${deadline.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`}</Text>
      </View>)}
      <Pressable accessibilityRole="button" disabled={unavailable || !box || !due.length} onPress={() => void scan('verify')} style={[styles.button, (unavailable || !box || !due.length) && styles.disabled]}><Text style={styles.buttonText}>薬箱タグを読み取って服用確認</Text></Pressable>
      <Text style={styles.note}>同じ箱の薬でも、服用時刻前や期限後の予定は記録しません。同じ時刻の薬はまとめて記録します。</Text>
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>{box ? '薬箱の登録を変更' : '薬箱のタグを登録'}</Text>
      <Text style={styles.note}>{box ? `登録済みタグ：…${box.tagId.slice(-4)}` : '薬箱に貼ったNFCタグと、箱に入れている薬を登録します。タグへの書き込みは不要です。'}</Text>
      {!isLoading && !loadError && !medications.length && <Link href="/medications/new" style={styles.link}>先に薬を登録する</Link>}
      {medications.map((medication) => <Pressable key={medication.id} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIds.includes(medication.id) }} disabled={unavailable} style={[styles.secondary, selectedIds.includes(medication.id) && styles.selected]} onPress={() => setSelection({ key: selectionKey, ids: selectedIds.includes(medication.id) ? selectedIds.filter((id) => id !== medication.id) : [...selectedIds, medication.id] })}>
        <Text style={styles.text}>{selectedIds.includes(medication.id) ? '☑' : '☐'} {medication.name}　{medication.doseTime}</Text>
      </Pressable>)}
      <Pressable accessibilityRole="button" disabled={unavailable || !selectedIds.length} onPress={register} style={[styles.button, (unavailable || !selectedIds.length) && styles.disabled]}><Text style={styles.buttonText}>{box ? '選んだ薬とタグを登録し直す' : '選んだ薬とタグを登録する'}</Text></Pressable>
    </View>
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {busy && <Pressable accessibilityRole="button" onPress={() => controller.current?.abort()} style={styles.secondary}><Text style={styles.text}>読み取りを中止</Text></Pressable>}
    <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => { void openNfcSettings().catch(() => setError('NFC設定を開けませんでした。Androidの設定からNFCを確認してください。')); }}><Text style={styles.text}>AndroidのNFC設定を開く</Text></Pressable>
    <Link href="/payments" style={styles.link}>ペナルティ課金デモへ</Link>
    <Text style={styles.note}>服用記録は端末に保存します。猶予はデモ用30分です。期限内のNFC記録は課金デモの判定にも使います。実際の請求や、アプリを閉じたままの自動課金は行いません。</Text>
  </MedicationScreen>;
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 14, backgroundColor: '#fff', borderRadius: 20 },
  heading: { color: C.ink, fontSize: 16, fontWeight: '700' },
  text: { color: C.ink, fontSize: 13, lineHeight: 23 },
  note: { color: C.muted, fontSize: 12, lineHeight: 22 },
  error: { color: C.error, fontSize: 13, lineHeight: 23 },
  button: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  secondary: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: C.pale, justifyContent: 'center' },
  selected: { borderWidth: 1, borderColor: C.mint },
  disabled: { opacity: 0.45 },
  row: { gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line },
  link: { color: '#267f7b', fontSize: 13, paddingVertical: 12 },
});
