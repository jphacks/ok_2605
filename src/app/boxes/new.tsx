import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { MedicineBoxArt } from '@/components/nomupay-art';
import { getMedicationDatabase } from '@/features/medications/database';
import { createMedicineBox } from '@/features/boxes/medicine-box-repository';
import { inTransaction } from '@/features/medications/transaction';
import { useNfcBox } from '@/state/nfc-box-context';

export default function NewBoxScreen() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const { reload } = useNfcBox();
  async function save() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); Keyboard.dismiss();
    try {
      const id = await inTransaction(await getMedicationDatabase(), (db) => createMedicineBox(db, name));
      await reload();
      router.replace({ pathname: '/boxes/[id]', params: { id, created: '1' } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '薬箱を保存できませんでした。'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <MedicationScreen title="薬箱の登録" description="毎日の服薬を、この薬箱から。" backTo="/boxes" busy={busy}>
    <Stack.Screen options={{ gestureEnabled: !busy }} />
    <MedicineBoxArt />
    <View style={styles.form}>
      <Text style={styles.label}>薬箱の名前</Text>
      <TextInput accessibilityLabel="薬箱の名前" editable={!busy} value={name} onChangeText={setName} maxLength={40} placeholder="例）いつもの薬箱" placeholderTextColor={C.muted} style={styles.input} returnKeyType="done" onSubmitEditing={() => void save()} />
      <Text style={styles.note}>ご自宅用や持ち歩き用など、複数の薬箱を作成できます。</Text>
    </View>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !name.trim(), busy }} disabled={busy || !name.trim()} onPress={() => void save()} style={[styles.button, (busy || !name.trim()) && { opacity: 0.45 }]}><Text style={styles.buttonText}>{busy ? '登録中…' : '登録する'}</Text></Pressable>
  </MedicationScreen>;
}
const styles = StyleSheet.create({
  form: { gap: 12 }, label: { color: C.ink, fontSize: 14, fontWeight: '600' }, input: { padding: 16, minHeight: 52, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, color: C.ink },
  note: { color: C.muted, lineHeight: 22, fontSize: 12 }, error: { color: C.error, lineHeight: 22 },
  button: { minHeight: 50, borderRadius: 25, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#fff', fontWeight: '700' },
});
