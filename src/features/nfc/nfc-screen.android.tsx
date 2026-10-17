import { Link, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationRegistryStatus } from '@/components/medication-registry-status';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { getMedicationDatabase } from '@/features/medications/database';
import { useMedicationRegistry } from '@/state/medication-registry-context';
import { useNfcBox } from '@/state/nfc-box-context';
import { saveNfcBox } from './nfc-box-repository';
import { NfcReadError, openNfcSettings, readNfcTag } from './nfc-reader.android';

export default function NfcScreen() {
  const { medications, isLoading, loadError } = useMedicationRegistry();
  const { box, loading, error: boxError, reload } = useNfcBox();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
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

  async function scan() {
    if (locked.current || isLoading || loadError || loading || boxError || !active.current) return;
    locked.current = true;
    const request = new AbortController();
    controller.current = request;
    setBusy(true); setError('');
    setMessage('登録する薬箱のタグに、スマホ背面を近づけてください。');
    try {
      const id = await readNfcTag(request.signal);
      if (request.signal.aborted || !active.current) return;
      const db = await getMedicationDatabase();
      const result = await saveNfcBox(db, id, request.signal);
      if (active.current) setMessage(result.linkedMedicationCount
        ? `薬箱のタグを登録し、${result.linkedMedicationCount}件の薬を自動で紐づけました。`
        : '薬箱のタグを登録しました。これから追加する薬は自動で紐づきます。');
      await reload();
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
      Alert.alert('薬箱タグを変更します', '次に読み取るタグへ置き換えます。すべての薬との紐づけと、過去の服用記録は残ります。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'タグを読み取る', onPress: () => void scan() },
      ]);
    } else void scan();
  }

  const unavailable = busy || isLoading || !!loadError || loading || !!boxError;
  return <MedicationScreen title="薬箱の設定" description="最初に1つ登録すると、追加した薬はすべてこの薬箱へ自動で紐づきます。" backTo="/explore" busy={busy}>
    <Stack.Screen options={{ gestureEnabled: !busy }} />
    <MedicationRegistryStatus />
    {(loading || !!boxError) && <View style={styles.card}>
      <Text style={styles.error}>{boxError ?? '薬箱の情報を読み込み中…'}</Text>
      {!!boxError && <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.secondary}><Text>再読み込み</Text></Pressable>}
    </View>}
    <View style={styles.card}>
      <Text style={styles.heading}>{box ? '登録している薬箱' : '薬箱のNFCタグを登録'}</Text>
      <Text style={styles.note}>{box
        ? `登録済みタグ：…${box.tagId.slice(-4)}\nタグを変更する場合だけ、下のボタンを使用してください。`
        : '薬箱に貼ったNFCタグへスマホを近づけて登録します。薬を先に登録する必要はありません。'}</Text>
      <Pressable accessibilityRole="button" disabled={unavailable} onPress={register} style={[styles.button, unavailable && styles.disabled]}>
        <Text style={styles.buttonText}>{box ? '薬箱のNFCタグを変更する' : '薬箱のNFCタグを登録する'}</Text>
      </Pressable>
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>自動で紐づく薬</Text>
      <Text style={styles.note}>登録済みの薬と、これから追加する薬はすべてこの薬箱へ自動で紐づきます。</Text>
      {!isLoading && !loadError && !medications.length && <><Text style={styles.note}>まだ薬は登録されていません。</Text><Link href="/medications/new" style={styles.link}>薬を登録する</Link></>}
      {medications.map((medication) => <View key={medication.id} style={styles.row}>
        <Text style={styles.text}>✓ {medication.name}</Text>
        <Text style={styles.note}>毎日 {medication.doseTime}</Text>
      </View>)}
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
  disabled: { opacity: 0.45 },
  row: { gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line },
  link: { color: '#267f7b', fontSize: 13, paddingVertical: 12 },
});
