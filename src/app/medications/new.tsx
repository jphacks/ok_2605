import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { TimeDropdown } from '@/components/time-dropdown';
import { MedicationRegistryStatus } from '@/components/medication-registry-status';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { MIN_PENALTY_AMOUNT, validateMedicationInput, type MedicationFieldErrors, type MedicationInput } from '@/features/medications/medication';
import { useMedicationRegistry } from '@/state/medication-registry-context';

export default function NewMedicationScreen() {
  const { registerMedication, isLoading, loadError } = useMedicationRegistry();
  const [input, setInput] = useState<MedicationInput>({ name: '', doseTime: '09:00', penaltyAmount: '' });
  const [errors, setErrors] = useState<MedicationFieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const submitting = useRef(false);
  const amountInput = useRef<TextInput>(null);

  const updateInput = (field: keyof MedicationInput, value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaveError(null);
  };

  const submit = async () => {
    if (submitting.current || isLoading || loadError) return;
    const result = validateMedicationInput(input);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }

    submitting.current = true;
    setIsSaving(true);
    setSaveError(null);
    Keyboard.dismiss();
    try {
      const medication = await registerMedication(input);
      router.dismissTo({ pathname: '/medications', params: { registered: String(medication.id) } });
    } catch {
      setSaveError('保存できませんでした。入力内容はそのままです。もう一度お試しください。');
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  };

  const disabled = isSaving || isLoading || !!loadError;

  return (
    <MedicationScreen title="薬を登録する" description={"毎日のリズムに合わせて、\nおくすりの時間を決めましょう。"} backTo="/medications" busy={isSaving}>
      <Stack.Screen options={{ gestureEnabled: !isSaving }} />
      <MedicationRegistryStatus />
      <View style={styles.form}>
        <View style={styles.field}>
          <Text nativeID="medication-name-label" style={styles.label}>薬の名前 <Text style={styles.required}>必須</Text></Text>
          <TextInput
            accessibilityLabel="薬名、必須"
            accessibilityHint={errors.name ?? '1文字から100文字で入力してください'}
            style={[styles.input, errors.name && styles.invalid]}
            value={input.name}
            onChangeText={(value) => updateInput('name', value)}
            placeholder="例）ビタミンD"
            placeholderTextColor="#8b9b9c"
            autoCorrect={false}
            editable={!isSaving}
            returnKeyType="next"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          <Text style={styles.hint}>100文字以内で入力してください。</Text>
          {errors.name && <Text accessibilityRole="alert" style={styles.error}>{errors.name}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>毎日の服用時間 <Text style={styles.required}>必須</Text></Text>
          <TimeDropdown value={input.doseTime} onChange={(value) => updateInput('doseTime', value)} disabled={isSaving} />
          <Text style={styles.hint}>時・分を選んでください（24時間表記）。</Text>
          {errors.doseTime && <Text accessibilityRole="alert" style={styles.error}>{errors.doseTime}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>ペナルティ金額 <Text style={styles.required}>必須</Text></Text>
          <View style={styles.amountRow}>
            <TextInput
              ref={amountInput}
              accessibilityLabel="ペナルティ金額、円、必須"
              accessibilityHint={errors.penaltyAmount ?? `最低${MIN_PENALTY_AMOUNT}円から設定できます`}
              style={[styles.input, styles.amountInput, errors.penaltyAmount && styles.invalid]}
              value={input.penaltyAmount}
              onChangeText={(value) => updateInput('penaltyAmount', value)}
              placeholder={`例：${MIN_PENALTY_AMOUNT}`}
              placeholderTextColor="#8b9b9c"
              keyboardType="number-pad"
              autoCorrect={false}
              editable={!isSaving}
            />
            <Text style={styles.currency}>円</Text>
          </View>
          <Text style={styles.hint}>{MIN_PENALTY_AMOUNT}円以上の整数を入力してください。</Text>
          {errors.penaltyAmount && <Text accessibilityRole="alert" style={styles.error}>{errors.penaltyAmount}</Text>}
        </View>
      </View>

      <Text style={styles.notice}>登録した内容はこの端末に保存されます。薬の登録では課金されません。</Text>
      {saveError && <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: isSaving }}
        style={[styles.submit, disabled && styles.disabled]}
        disabled={disabled}
        onPress={() => { void submit(); }}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>登録する</Text>}
      </Pressable>
    </MedicationScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 24 },
  field: { gap: 9 },
  label: { color: C.ink, fontSize: 12, fontWeight: '600' },
  required: { fontSize: 11, color: C.mint, fontWeight: '500' },
  input: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: C.ink, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12 },
  numericInput: { fontVariant: ['tabular-nums'] },
  invalid: { borderColor: C.error, backgroundColor: '#fff9f9' },
  hint: { color: C.muted, fontSize: 12, lineHeight: 20 },
  error: { color: C.error, fontSize: 13, lineHeight: 21 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amountInput: { flex: 1, fontVariant: ['tabular-nums'] },
  currency: { color: C.ink, fontSize: 16 },
  notice: { color: C.muted, fontSize: 12, lineHeight: 21, paddingHorizontal: 4 },
  submit: { backgroundColor: C.mint, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 16 },
  disabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
