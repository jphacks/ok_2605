import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { localDay } from '@/features/medications/dose-record';
import { getMedicationDatabase } from '@/features/medications/database';
import { useDoseRecords } from '@/state/dose-record-context';
import { useMedicationRegistry } from '@/state/medication-registry-context';
import { useNfcBox } from '@/state/nfc-box-context';
import { confirmNfcDose } from './nfc-box-repository';
import { NfcReadError, readNfcTag } from './nfc-reader.android';

const C = { ink: '#263e48', muted: '#72848a', mint: '#36b7aa', pale: '#e8f7f4', coral: '#e77760' };

export default function NfcDoseConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ medicationId?: string; scheduledDay?: string }>();
  const medicationId = Number(params.medicationId);
  const today = localDay(new Date());
  const validOccurrence = Number.isSafeInteger(medicationId) && medicationId > 0 && params.scheduledDay === today;
  const { medications, isLoading: medicationsLoading } = useMedicationRegistry();
  const { records, isLoading: recordsLoading, refresh: refreshDoseRecords } = useDoseRecords();
  const { box, loading: boxLoading, error: boxError, reload } = useNfcBox();
  const medication = medications.find((item) => item.id === medicationId);
  const alreadyTaken = records.some((record) => record.medicationId === medicationId && record.scheduledDay === today);
  const boxHasMedication = box?.medications.some((item) => item.id === medicationId) ?? false;
  const [focused, setFocused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const startedAttempt = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  useFocusEffect(useCallback(() => {
    active.current = true;
    setFocused(true);
    void reload();
    return () => {
      active.current = false;
      setFocused(false);
      controller.current?.abort();
    };
  }, [reload]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') controller.current?.abort();
    });
    return () => subscription.remove();
  }, []);

  const startScan = useCallback(async () => {
    if (!medication || !params.scheduledDay || !active.current || busy) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    try {
      const tagId = await readNfcTag(request.signal);
      if (request.signal.aborted || !active.current) return;
      const database = await getMedicationDatabase();
      const result = await confirmNfcDose(database, tagId, medication.id, params.scheduledDay, request.signal);
      if (request.signal.aborted || !active.current) return;
      await Promise.all([reload(), refreshDoseRecords()]);
      if (!active.current) return;
      router.replace({
        pathname: '/dose-complete',
        params: {
          medicationName: result.medicationName,
          doseTime: medication.doseTime,
          alreadyRecorded: result.recorded ? '0' : '1',
        },
      } as unknown as Href);
    } catch (cause) {
      if (!active.current) return;
      if (request.signal.aborted || (cause instanceof NfcReadError && cause.code === 'cancelled')) {
        setError('読み取りを中止しました。');
      } else {
        setError(cause instanceof Error ? cause.message : 'NFCタグを読み取れませんでした。もう一度お試しください。');
      }
    } finally {
      if (controller.current === request) controller.current = null;
      if (active.current) setBusy(false);
    }
  }, [busy, medication, params.scheduledDay, refreshDoseRecords, reload, router]);

  useEffect(() => {
    if (!focused || medicationsLoading || recordsLoading || boxLoading || boxError || !validOccurrence
      || !medication || alreadyTaken || !box || !boxHasMedication || startedAttempt.current === attempt) return;
    startedAttempt.current = attempt;
    void startScan();
  }, [alreadyTaken, attempt, box, boxError, boxHasMedication, boxLoading, focused, medication,
    medicationsLoading, recordsLoading, startScan, validOccurrence]);

  const state = useMemo(() => {
    if (medicationsLoading || recordsLoading || boxLoading) return 'loading';
    if (!validOccurrence || !medication) return 'invalid';
    if (alreadyTaken) return 'taken';
    if (boxError) return 'box-error';
    if (!box || !boxHasMedication) return 'unregistered';
    return 'ready';
  }, [alreadyTaken, box, boxError, boxHasMedication, boxLoading, medication, medicationsLoading, recordsLoading, validOccurrence]);

  const goHome = () => router.dismissTo('/');
  const retry = () => {
    startedAttempt.current = null;
    setAttempt((current) => current + 1);
  };

  if (state !== 'ready') {
    const title = state === 'loading' ? '服薬予定を確認しています…'
      : state === 'taken' ? '服用を記録済みです'
        : state === 'unregistered' ? '薬箱タグの登録が必要です'
          : state === 'box-error' ? '薬箱の情報を読み込めませんでした'
            : '服薬予定が見つかりません';
    const body = state === 'taken' ? `${medication?.name ?? 'このお薬'}は今日の服薬済みとして保存されています。`
      : state === 'unregistered' ? 'このお薬を薬箱に登録してから、もう一度お試しください。'
        : state === 'box-error' ? boxError ?? ''
          : state === 'invalid' ? 'ホーム画面から対象のお薬を選び直してください。' : '';
    return <SafeAreaView style={styles.center}>
      <Stack.Screen options={{ gestureEnabled: true }} />
      {state === 'loading' && <ActivityIndicator color={C.mint} size="large" />}
      <Text style={styles.errorTitle}>{title}</Text>
      {!!body && <Text style={styles.body}>{body}</Text>}
      {state === 'unregistered' && <Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.replace('/qr')}><Text style={styles.primaryText}>薬箱タグを登録する</Text></Pressable>}
      {state === 'box-error' && <Pressable accessibilityRole="button" style={styles.primary} onPress={() => void reload()}><Text style={styles.primaryText}>再読み込み</Text></Pressable>}
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={goHome}><Text style={styles.secondaryText}>ホームへ戻る</Text></Pressable>
    </SafeAreaView>;
  }

  if (!medication) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="ホームへ戻る" disabled={busy} onPress={goHome} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>服用確認</Text>
        <View style={styles.headerSpace} />
      </View>

      <View style={styles.content}>
        <Text style={styles.kicker}>MEDICINE TIME</Text>
        <Text style={styles.time}>{medication.doseTime}</Text>
        <View style={styles.namePill}><Text style={styles.name}>{medication.name}</Text></View>
        <Text accessibilityRole="header" style={styles.question}>{medication.name}を{`\n`}飲みましたか？</Text>

        <View accessible accessibilityLabel="NFCタグにスマートフォンを近づけてください" style={styles.nfcVisual}>
          <View style={styles.waveLarge} />
          <View style={styles.waveMedium} />
          <View style={styles.tag}><Text style={styles.tagText}>NFC</Text></View>
          <Text style={styles.phone}>▯</Text>
        </View>

        <Text style={styles.touch}>NFCタグにタッチ！</Text>
        <Text style={styles.body}>薬箱に貼ったタグへ{`\n`}スマホの背面を近づけてください</Text>
        {busy && <View style={styles.statusRow}><ActivityIndicator color={C.mint} /><Text style={styles.status}>タグを待っています…</Text></View>}
        {!!error && <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={retry} style={styles.primary}><Text style={styles.primaryText}>もう一度読み取る</Text></Pressable>
        </View>}
      </View>

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={goHome} style={styles.cancel}>
          <Text style={styles.cancelText}>あとで飲む</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5faf8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18, padding: 28, backgroundColor: '#f5faf8' },
  header: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3fafb' },
  back: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.ink, fontSize: 30 },
  headerTitle: { flex: 1, textAlign: 'center', color: C.ink, fontSize: 14, fontWeight: '700' },
  headerSpace: { width: 44 },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 30 },
  kicker: { color: '#5e9696', fontSize: 10, letterSpacing: 1.5 },
  time: { marginTop: 8, color: C.ink, fontSize: 38, fontWeight: '800', fontVariant: ['tabular-nums'] },
  namePill: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, backgroundColor: C.pale },
  name: { color: '#267f73', fontSize: 14, fontWeight: '700' },
  question: { marginTop: 22, color: C.ink, fontSize: 25, lineHeight: 37, textAlign: 'center', fontWeight: '800' },
  nfcVisual: { width: 210, height: 150, marginTop: 22, alignItems: 'center', justifyContent: 'center' },
  waveLarge: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: '#c9ebe5' },
  waveMedium: { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 2, borderColor: '#9fded4' },
  tag: { position: 'absolute', left: 31, width: 68, height: 88, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 2, borderColor: C.mint, transform: [{ rotate: '-7deg' }] },
  tagText: { color: C.mint, fontSize: 14, fontWeight: '800' },
  phone: { position: 'absolute', right: 28, color: C.ink, fontSize: 93, lineHeight: 103, transform: [{ rotate: '7deg' }] },
  touch: { color: C.coral, fontSize: 19, fontWeight: '800' },
  body: { color: C.muted, fontSize: 13, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  statusRow: { marginTop: 17, flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { color: C.mint, fontSize: 13, fontWeight: '700' },
  errorBox: { width: '100%', marginTop: 16, gap: 12 },
  error: { color: '#aa353c', fontSize: 12, lineHeight: 20, textAlign: 'center' },
  errorTitle: { color: C.ink, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  primary: { minHeight: 48, width: '100%', padding: 14, borderRadius: 14, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondary: { minHeight: 48, width: '100%', padding: 14, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: C.ink, fontSize: 13, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingBottom: 14 },
  cancel: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  cancelText: { color: C.muted, fontSize: 13, fontWeight: '600' },
});
