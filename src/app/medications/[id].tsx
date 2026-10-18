import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { MedicationRegistryStatus } from '@/components/medication-registry-status';
import { TimeDropdown } from '@/components/time-dropdown';
import { validateMedicationInput, type MedicationFieldErrors, type MedicationInput } from '@/features/medications/medication';
import { useMedicationRegistry } from '@/state/medication-registry-context';
import { MedicineBoxPicker } from '@/components/medicine-box-picker';
import { useNfcBox } from '@/state/nfc-box-context';

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { medications, isLoading, loadError, updateMedication, deleteMedication } = useMedicationRegistry();
  const medication = medications.find((item) => String(item.id) === id);
  const { boxes, loading: boxesLoading, error: boxesError } = useNfcBox();
  const assignedBox = boxes.find((box) => box.medications.some((item) => String(item.id) === id));
  const [input, setInput] = useState<MedicationInput | null>(null);
  const [errors, setErrors] = useState<MedicationFieldErrors>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = useRef(false);
  const value = input ?? { name: medication?.name ?? '', doseTime: medication?.doseTime ?? '09:00', penaltyAmount: String(medication?.penaltyAmount ?? ''), boxId: assignedBox ? String(assignedBox.id) : '' };

  function change(field: keyof MedicationInput, next: string) {
    setInput({ ...value, [field]: next }); setErrors({ ...errors, [field]: undefined }); setMessage(''); setError('');
  }
  async function save() {
    if (!medication || locked.current) return;
    if (!boxes.some((box) => String(box.id) === value.boxId)) { setErrors({ boxId: 'お薬を入れる薬箱を選択してください。' }); return; }
    const parsed = validateMedicationInput(value);
    if (!parsed.success) { setErrors(parsed.errors); return; }
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try { await updateMedication(medication.id, value); setInput(null); setMessage('変更を保存しました。'); }
    catch { setError('変更を保存できませんでした。もう一度お試しください。'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function remove() {
    if (!medication || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await deleteMedication(medication.id); router.dismissTo('/medications'); }
    catch { setError('削除できませんでした。もう一度お試しください。'); }
    finally { locked.current = false; setBusy(false); }
  }

  return <MedicationScreen title="おくすりの情報・編集" description="服用時間や、お薬を入れる薬箱を変更できます。" backTo="/medications" busy={busy}>
    <Stack.Screen options={{ gestureEnabled: !busy }} />
    <MedicationRegistryStatus />
    {!isLoading && !loadError && (medication ? <>
      <View style={styles.card}>
        <Text style={styles.name}>{medication.name}</Text>
        <Text style={styles.time}>毎日 {medication.doseTime}</Text>
        <Text style={styles.note}>▣ {assignedBox?.name ?? '薬箱が未選択です'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>薬の名前</Text>
        <TextInput accessibilityLabel="薬の名前" value={value.name} editable={!busy} onChangeText={(next) => change('name', next)} style={styles.input} />
        {!!errors.name && <Text style={styles.error}>{errors.name}</Text>}
        <Text style={styles.label}>毎日の服用時間</Text>
        <TimeDropdown value={value.doseTime} disabled={busy} onChange={(next) => change('doseTime', next)} />
        {!!errors.doseTime && <Text style={styles.error}>{errors.doseTime}</Text>}
        <Text style={styles.label}>ペナルティ金額（円）</Text>
        <TextInput accessibilityLabel="ペナルティ金額、円" keyboardType="number-pad" value={value.penaltyAmount} editable={!busy} onChangeText={(next) => change('penaltyAmount', next)} style={styles.input} />
        {!!errors.penaltyAmount && <Text style={styles.error}>{errors.penaltyAmount}</Text>}
        <MedicineBoxPicker value={value.boxId ?? ''} onChange={(next) => change('boxId', next)} disabled={busy} />
        {!!errors.boxId && <Text accessibilityRole="alert" style={styles.error}>{errors.boxId}</Text>}
        <Text style={styles.note}>変更は保存後の予定に適用します。同じ日の服用・ペナルティは1回です。過去の履歴と金額は保存されます。</Text>
        <Pressable accessibilityRole="button" disabled={busy || boxesLoading || !!boxesError} style={[styles.button, (busy || boxesLoading || !!boxesError) && styles.disabled]} onPress={() => void save()}><Text style={styles.buttonText}>{busy ? '保存中…' : '変更を保存'}</Text></Pressable>
      </View>
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.label}>{message}</Text>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {confirmDelete ? <View style={styles.card}>
        <Text style={styles.label}>「{medication.name}」を削除しますか？</Text>
        <Text style={styles.note}>今後の予定と通知を停止します。これまでの服薬記録・ペナルティ履歴は残ります。</Text>
        <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => setConfirmDelete(false)}><Text style={styles.label}>キャンセル</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => void remove()}><Text style={styles.error}>削除する</Text></Pressable>
      </View> : <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => setConfirmDelete(true)}><Text style={styles.error}>この薬を削除する</Text></Pressable>}
    </> : <Text style={styles.note}>このお薬は見つかりません。お薬一覧で登録内容をご確認ください。</Text>)}
  </MedicationScreen>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', padding: 22, borderRadius: 20, gap: 14 },
  time: { color: C.mint, fontSize: 22, fontWeight: '700' },
  name: { color: C.ink, fontSize: 20, fontWeight: '700' },
  label: { color: C.ink, fontSize: 13, fontWeight: '600' },
  note: { color: C.muted, fontSize: 12, lineHeight: 22 },
  qr: { width: '100%', aspectRatio: 1, maxWidth: 320, alignSelf: 'center' },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14, color: C.ink, fontSize: 14 },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', padding: 14 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondary: { minHeight: 48, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 14, borderWidth: 1, borderColor: C.line },
  error: { color: C.error, fontSize: 13, lineHeight: 22 },
  disabled: { opacity: 0.5 },
});
