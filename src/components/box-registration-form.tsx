import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from './medication-screen';
import { MedicineBoxArt } from './nomupay-art';
import { BoxTagButton } from './box-tag-button';
import { getMedicationDatabase } from '@/features/medications/database';
import { createMedicineBox } from '@/features/boxes/medicine-box-repository';
import { inTransaction } from '@/features/medications/transaction';
import { useNfcBox } from '@/state/nfc-box-context';

export function BoxRegistrationForm({ onNext, initialBoxId }: { onNext?: () => Promise<void>; initialBoxId?: number }) {
  const [name, setName] = useState('');
  const [savedId, setSavedId] = useState<number | null>(initialBoxId ?? null);
  const [busy, setBusy] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const persistedId = useRef<number | null>(initialBoxId ?? null);
  const { boxes, loading: boxesLoading, error: boxesError, reload } = useNfcBox();
  const savedBox = boxes.find((box) => box.id === savedId);
  const needsTag = Platform.OS === 'android' && !savedBox?.tagId;
  const nextDisabled = busy || tagBusy || boxesLoading || !!boxesError || needsTag;
  async function save() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); Keyboard.dismiss();
    try {
      // Retrying navigation/reload after a successful write must not create another box.
      const id = persistedId.current ?? await inTransaction(await getMedicationDatabase(), (db) => createMedicineBox(db, name));
      persistedId.current = id;
      await reload();
      if (onNext) setSavedId(id);
      else router.replace({ pathname: '/boxes/[id]', params: { id, created: '1' } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '薬箱を保存できませんでした。'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function next() {
    if (locked.current || !onNext || nextDisabled) return;
    locked.current = true; setBusy(true);
    try { await onNext(); }
    catch { setError('登録内容を読み込めませんでした。もう一度お試しください。'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <MedicationScreen title="薬箱の登録" description={onNext ? '1 / 2 薬箱の登録 — 次にダミーカードを登録します。' : '毎日の服薬を、この薬箱から。'} backTo="/boxes" busy={busy} hideNavigation={!!onNext}>
    <Stack.Screen options={{ gestureEnabled: !busy && !onNext }} />
    <MedicineBoxArt />
    {savedId ? <View style={styles.form}>
      <Text style={styles.label}>{savedBox?.name ?? name}を登録しました</Text>
      {Platform.OS === 'android' && <>
        <Text style={styles.note}>薬箱のNFCタグを読み取って登録してください。登録が完了すると、カードの登録へ進めます。</Text>
        <BoxTagButton boxId={savedId} registered={!!savedBox?.tagId} onBusyChange={setTagBusy} />
        {!boxesError && <Text style={styles.note}>{savedBox?.tagId ? '✓ NFCタグ登録済み' : 'NFCタグの登録が必要です。'}</Text>}
      </>}
      {Platform.OS !== 'android' && <Text style={styles.note}>服用確認には端末共通QRを使います。初回登録後に「薬箱」から表示できます。</Text>}
      {!!boxesError && <><Text accessibilityRole="alert" style={styles.error}>{boxesError}</Text><Pressable accessibilityRole="button" disabled={busy || tagBusy} onPress={() => void reload()} style={styles.button}><Text style={styles.buttonText}>薬箱を再読み込み</Text></Pressable></>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: nextDisabled }} disabled={nextDisabled} onPress={() => void next()} style={[styles.button, nextDisabled && { opacity: 0.45 }]}><Text style={styles.buttonText}>カードの登録へ</Text></Pressable>
    </View> : <>
      <View style={styles.form}>
        <Text style={styles.label}>薬箱の名前</Text>
        <TextInput accessibilityLabel="薬箱の名前" editable={!busy} value={name} onChangeText={setName} maxLength={40} placeholder="例）いつもの薬箱" placeholderTextColor={C.muted} style={styles.input} returnKeyType="done" onSubmitEditing={() => void save()} />
        <Text style={styles.note}>ご自宅用や持ち歩き用など、複数の薬箱を作成できます。</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !name.trim(), busy }} disabled={busy || !name.trim()} onPress={() => void save()} style={[styles.button, (busy || !name.trim()) && { opacity: 0.45 }]}><Text style={styles.buttonText}>{busy ? '登録中…' : '登録する'}</Text></Pressable>
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </MedicationScreen>;
}
const styles = StyleSheet.create({
  form: { gap: 12 }, label: { color: C.ink, fontSize: 14, fontWeight: '600' }, input: { padding: 16, minHeight: 52, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, color: C.ink },
  note: { color: C.muted, lineHeight: 22, fontSize: 12 }, error: { color: C.error, lineHeight: 22 },
  button: { minHeight: 50, borderRadius: 25, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#fff', fontWeight: '700' },
});
