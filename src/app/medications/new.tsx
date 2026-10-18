import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { DateCalendarModal } from '@/components/date-calendar-modal';
import { GracePeriodPicker } from '@/components/grace-period-picker';
import { MedicationRegistryStatus } from '@/components/medication-registry-status';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { TimeDropdown } from '@/components/time-dropdown';
import { localDay, scheduledDate } from '@/features/medications/dose-record';
import { DEFAULT_GRACE_MINUTES } from '@/features/medications/grace-period';
import { MIN_PENALTY_AMOUNT, MedicationValidationError, type MedicationFieldErrors } from '@/features/medications/medication';
import { useMedicationRegistry } from '@/state/medication-registry-context';
import { MedicineBoxPicker } from '@/components/medicine-box-picker';
import { useNfcBox } from '@/state/nfc-box-context';

const UNITS = ['錠', 'カプセル', '包', 'mL', '回'];
type PeriodMode = 'none' | 'days' | 'date';
type DoseInput = { id: number; doseTime: string; doseAmount: string };

function addDays(day: string, amount: number) {
  const date = scheduledDate(day, '12:00');
  date.setDate(date.getDate() + amount);
  return localDay(date);
}

function formatDay(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return `${year}年${month}月${date}日`;
}

function nextTime(doses: DoseInput[]) {
  const last = doses.at(-1)?.doseTime ?? '05:00';
  const [hour, minute] = last.split(':').map(Number);
  return `${String((hour + 4) % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function NewMedicationScreen() {
  const { registerMedicationPlan, isLoading, loadError } = useMedicationRegistry();
  const { boxId } = useLocalSearchParams<{ boxId?: string }>();
  const { boxes, loading: boxesLoading, error: boxesError } = useNfcBox();
  const [selectedBoxId, setSelectedBoxId] = useState(boxId ?? '');
  const [name, setName] = useState('');
  const [doses, setDoses] = useState<DoseInput[]>([{ id: 1, doseTime: '09:00', doseAmount: '1' }]);
  const [startDay, setStartDay] = useState(() => localDay(new Date()));
  const [periodMode, setPeriodMode] = useState<PeriodMode>('none');
  const [durationDays, setDurationDays] = useState('30');
  const [selectedEndDay, setSelectedEndDay] = useState(() => addDays(localDay(new Date()), 29));
  const [calendarTarget, setCalendarTarget] = useState<'start' | 'end' | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [unitIndex, setUnitIndex] = useState(0);
  const [inventory, setInventory] = useState('');
  const [memo, setMemo] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState(String(MIN_PENALTY_AMOUNT));
  const [graceMinutes, setGraceMinutes] = useState(DEFAULT_GRACE_MINUTES);
  const [errors, setErrors] = useState<MedicationFieldErrors>({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const submitting = useRef(false);
  const nextId = useRef(2);

  const endDay = useMemo(() => {
    if (periodMode === 'none') return null;
    if (periodMode === 'date') return selectedEndDay;
    const days = Number(durationDays);
    return Number.isSafeInteger(days) && days > 0 ? addDays(startDay, days - 1) : null;
  }, [durationDays, periodMode, selectedEndDay, startDay]);

  const clearError = () => { setErrors({}); setFormError(''); };
  const updateDose = (id: number, field: 'doseTime' | 'doseAmount', value: string) => {
    setDoses((current) => current.map((dose) => dose.id === id ? { ...dose, [field]: value } : dose));
    clearError();
  };

  const submit = async () => {
    if (submitting.current || isLoading || loadError) return;
    if (!boxes.some((box) => String(box.id) === selectedBoxId)) {
      setErrors((current) => ({ ...current, boxId: 'お薬を入れる薬箱を選択してください。' }));
      return;
    }
    if (!doses.length) { setFormError('服用時間を1件以上追加してください。'); return; }
    if (periodMode === 'days' && endDay === null) { setFormError('服用日数を1日以上の整数で入力してください。'); return; }

    submitting.current = true;
    setIsSaving(true);
    setFormError('');
    Keyboard.dismiss();
    try {
      const saved = await registerMedicationPlan({
        boxId: selectedBoxId,
        name,
        doses,
        penaltyAmount,
        startDay,
        endDay,
        notificationsEnabled,
        unit: UNITS[unitIndex],
        inventory,
        memo,
        graceMinutes,
      });
      router.dismissTo({ pathname: '/medications', params: { registered: String(saved[0].id) } });
    } catch (error) {
      if (error instanceof MedicationValidationError) setErrors(error.errors);
      else setFormError(error instanceof Error ? error.message : '保存できませんでした。もう一度お試しください。');
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  };

  const disabled = isSaving || isLoading || !!loadError || boxesLoading || !!boxesError;

  return (
    <MedicationScreen title="薬を登録する" description="服用時間と期間を設定しましょう。" backTo="/medications" busy={isSaving}>
      <Stack.Screen options={{ gestureEnabled: !isSaving }} />
      <MedicationRegistryStatus />

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>薬の名前 <Text style={styles.required}>必須</Text></Text>
          <TextInput
            accessibilityLabel="薬の名前、必須"
            value={name}
            onChangeText={(value) => { setName(value); clearError(); }}
            editable={!isSaving}
            placeholder="例）ビタミンD"
            placeholderTextColor="#8b9b9c"
            autoCorrect={false}
            style={[styles.input, errors.name && styles.invalid]}
          />
          {!!errors.name && <Text accessibilityRole="alert" style={styles.error}>{errors.name}</Text>}
        </View>

        <View style={styles.field}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>服用時間と量 <Text style={styles.required}>必須</Text></Text>
            <Text style={styles.hint}>{doses.length}件</Text>
          </View>
          {doses.map((dose, index) => (
            <View key={dose.id} style={styles.doseCard}>
              <View style={styles.doseHeader}>
                <Text style={styles.doseTitle}>{index + 1}回目</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${index + 1}回目の服用時間を削除`}
                  disabled={doses.length === 1 || isSaving}
                  onPress={() => setDoses((current) => current.filter((item) => item.id !== dose.id))}
                  style={[styles.remove, doses.length === 1 && styles.disabled]}>
                  <Text style={styles.removeText}>削除</Text>
                </Pressable>
              </View>
              <TimeDropdown value={dose.doseTime} onChange={(value) => updateDose(dose.id, 'doseTime', value)} disabled={isSaving} />
              <View style={styles.amountRow}>
                <TextInput
                  accessibilityLabel={`${index + 1}回目の服用量`}
                  value={dose.doseAmount}
                  onChangeText={(value) => updateDose(dose.id, 'doseAmount', value.replace(/[^0-9.]/g, ''))}
                  editable={!isSaving}
                  keyboardType="decimal-pad"
                  style={[styles.input, styles.amountInput]}
                />
                <Text style={styles.unitText}>{UNITS[unitIndex]}</Text>
              </View>
            </View>
          ))}
          {!!errors.doseTime && <Text accessibilityRole="alert" style={styles.error}>{errors.doseTime}</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={() => setDoses((current) => [...current, { id: nextId.current++, doseTime: nextTime(current), doseAmount: '1' }])}
            style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>＋ 服用時間を追加</Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>服用期間 <Text style={styles.required}>必須</Text></Text>
          <Pressable accessibilityRole="button" onPress={() => setCalendarTarget('start')} style={styles.dateButton}>
            <View><Text style={styles.dateCaption}>開始日</Text><Text style={styles.dateValue}>{formatDay(startDay)}</Text></View>
            <Text style={styles.calendarIcon}>▦</Text>
          </Pressable>
          <View style={styles.segmentRow}>
            {([
              ['none', '期限なし'],
              ['days', '日数指定'],
              ['date', '終了日指定'],
            ] as const).map(([mode, label]) => (
              <Pressable
                key={mode}
                accessibilityRole="radio"
                accessibilityState={{ checked: periodMode === mode }}
                onPress={() => setPeriodMode(mode)}
                style={[styles.segment, periodMode === mode && styles.segmentSelected]}>
                <Text style={[styles.segmentText, periodMode === mode && styles.segmentTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {periodMode === 'days' && (
            <View style={styles.daysRow}>
              <TextInput
                accessibilityLabel="服用日数"
                value={durationDays}
                onChangeText={(value) => { setDurationDays(value.replace(/\D/g, '')); clearError(); }}
                keyboardType="number-pad"
                editable={!isSaving}
                style={[styles.input, styles.daysInput]}
              />
              <Text style={styles.unitText}>日間</Text>
              {!!endDay && <Text style={styles.hint}>{formatDay(endDay)}まで</Text>}
            </View>
          )}
          {periodMode === 'date' && (
            <Pressable accessibilityRole="button" onPress={() => setCalendarTarget('end')} style={styles.dateButton}>
              <View><Text style={styles.dateCaption}>終了日</Text><Text style={styles.dateValue}>{formatDay(selectedEndDay)}</Text></View>
              <Text style={styles.calendarIcon}>▦</Text>
            </Pressable>
          )}
          <Text style={styles.hint}>開始日と終了日は、カレンダーから選択できます。</Text>
        </View>

        <View style={styles.field}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}><Text style={styles.label}>通知</Text><Text style={styles.hint}>各服用時間にお知らせします。</Text></View>
            <Switch
              accessibilityLabel="服薬通知"
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              disabled={isSaving}
              trackColor={{ false: '#b7c7c5', true: C.mint }}
              ios_backgroundColor="#b7c7c5"
            />
          </View>
        </View>

        <View style={styles.twoColumns}>
          <View style={[styles.field, styles.column]}>
            <Text style={styles.label}>単位</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setUnitIndex((current) => (current + 1) % UNITS.length)}
              style={styles.inputButton}>
              <Text style={styles.inputValue}>{UNITS[unitIndex]} ▾</Text>
            </Pressable>
          </View>
          <View style={[styles.field, styles.column]}>
            <Text style={styles.label}>在庫</Text>
            <TextInput
              accessibilityLabel="在庫"
              value={inventory}
              onChangeText={(value) => setInventory(value.replace(/\D/g, ''))}
              keyboardType="number-pad"
              editable={!isSaving}
              placeholder="未設定"
              placeholderTextColor="#8b9b9c"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>メモ</Text>
          <TextInput
            accessibilityLabel="メモ"
            value={memo}
            onChangeText={setMemo}
            editable={!isSaving}
            multiline
            maxLength={500}
            placeholder="飲み方や注意点など"
            placeholderTextColor="#8b9b9c"
            textAlignVertical="top"
            style={[styles.input, styles.memoInput]}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>ペナルティ金額 <Text style={styles.required}>必須</Text></Text>
          <View style={styles.amountRow}>
            <TextInput
              accessibilityLabel="ペナルティ金額、円"
              value={penaltyAmount}
              onChangeText={(value) => { setPenaltyAmount(value.replace(/\D/g, '')); clearError(); }}
              keyboardType="number-pad"
              editable={!isSaving}
              style={[styles.input, styles.amountInput, errors.penaltyAmount && styles.invalid]}
            />
            <Text style={styles.unitText}>円</Text>
          </View>
          <Text style={styles.hint}>{MIN_PENALTY_AMOUNT}円以上の整数を入力してください。</Text>
          {!!errors.penaltyAmount && <Text accessibilityRole="alert" style={styles.error}>{errors.penaltyAmount}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>執行猶予時間 <Text style={styles.required}>必須</Text></Text>
          <GracePeriodPicker value={graceMinutes} onChange={setGraceMinutes} disabled={isSaving} />
          <Text style={styles.hint}>服用時間を過ぎてから課金判定までの時間です。5分から1時間まで、5分刻みで選べます。</Text>
        </View>
      </View>

      <MedicineBoxPicker
        value={selectedBoxId}
        onChange={(id) => { setSelectedBoxId(id); clearError(); }}
        disabled={isSaving}
      />
      {!!errors.boxId && <Text accessibilityRole="alert" style={styles.error}>{errors.boxId}</Text>}
      <Text style={styles.notice}>登録した内容はこの端末に保存されます。薬の登録では課金されません。</Text>
      {!!formError && <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: isSaving }}
        disabled={disabled}
        onPress={() => void submit()}
        style={[styles.submit, disabled && styles.disabled]}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>登録する</Text>}
      </Pressable>

      {calendarTarget && (
        <DateCalendarModal
          visible
          title={calendarTarget === 'start' ? '開始日を選択' : '終了日を選択'}
          value={calendarTarget === 'start' ? startDay : selectedEndDay}
          minimumDay={calendarTarget === 'end' ? startDay : undefined}
          onClose={() => setCalendarTarget(null)}
          onSelect={(day) => {
            if (calendarTarget === 'start') {
              setStartDay(day);
              if (selectedEndDay < day) setSelectedEndDay(day);
            } else setSelectedEndDay(day);
            setCalendarTarget(null);
            clearError();
          }}
        />
      )}
    </MedicationScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 24 },
  field: { gap: 9 },
  label: { color: C.ink, fontSize: 12, fontWeight: '600' },
  required: { color: C.mint, fontSize: 11, fontWeight: '500' },
  input: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: C.ink, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12 },
  invalid: { borderColor: C.error, backgroundColor: '#fff9f9' },
  hint: { color: C.muted, fontSize: 12, lineHeight: 20 },
  error: { color: C.error, fontSize: 13, lineHeight: 21 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  doseCard: { gap: 12, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.line },
  doseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  doseTitle: { color: C.mint, fontSize: 13, fontWeight: '700' },
  remove: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
  removeText: { color: C.error, fontSize: 12, fontWeight: '600' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amountInput: { flex: 1, fontVariant: ['tabular-nums'] },
  unitText: { color: C.ink, fontSize: 16 },
  secondaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center', padding: 14 },
  secondaryText: { color: C.mint, fontSize: 14, fontWeight: '700' },
  dateButton: { minHeight: 60, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateCaption: { color: C.muted, fontSize: 11, marginBottom: 4 },
  dateValue: { color: C.ink, fontSize: 15, fontWeight: '600' },
  calendarIcon: { color: C.mint, fontSize: 24 },
  segmentRow: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, minHeight: 44, paddingHorizontal: 5, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { borderColor: C.mint, backgroundColor: C.pale },
  segmentText: { color: C.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  segmentTextSelected: { color: C.mint },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  daysInput: { width: 90, textAlign: 'right' },
  switchRow: { minHeight: 68, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchCopy: { flex: 1, gap: 5 },
  twoColumns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  inputButton: { minHeight: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', justifyContent: 'center' },
  inputValue: { color: C.ink, fontSize: 14 },
  memoInput: { minHeight: 96 },
  notice: { color: C.muted, fontSize: 12, lineHeight: 21, paddingHorizontal: 4 },
  submit: { minHeight: 48, borderRadius: 14, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', padding: 16 },
  submitText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
