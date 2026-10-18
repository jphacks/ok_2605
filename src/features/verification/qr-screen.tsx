import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { localDay } from '@/features/medications/dose-record';
import { getMedicationDatabase } from '@/features/medications/database';
import { confirmQrDose } from './qr-confirmation';
import { useDoseRecords } from '@/state/dose-record-context';
import { useMedicationRegistry } from '@/state/medication-registry-context';

export default function QrScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ medicationId?: string; scheduledDay?: string }>();
  const medicationId = Number(params.medicationId);
  const today = localDay(new Date());
  const validOccurrence = Number.isSafeInteger(medicationId) && medicationId > 0 && params.scheduledDay === today;
  const { medications, isLoading: medicationsLoading } = useMedicationRegistry();
  const { records, isLoading: recordsLoading, refresh } = useDoseRecords();
  const medication = medications.find((item) => item.id === medicationId);
  const alreadyTaken = records.some((record) => record.medicationId === medicationId && record.scheduledDay === today);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [scanned, setScanned] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const scanLocked = useRef(false);
  const visible = useRef(false);

  useFocusEffect(useCallback(() => {
    visible.current = true;
    setFocused(true);
    return () => { visible.current = false; setFocused(false); };
  }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      setForeground(status === 'active');
      if (status === 'active') void getPermission().catch(() => setCameraError(true));
    });
    return () => subscription.remove();
  }, [getPermission]);

  const goHome = () => router.dismissTo('/');

  async function allowCamera() {
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      Alert.alert('カメラを利用できません', '端末の設定でカメラ権限を確認してください。');
    }
  }

  async function complete(source: 'qr' | 'demo', data = '') {
    if (scanLocked.current || alreadyTaken || !medication || !validOccurrence || !visible.current) return;
    scanLocked.current = true;
    setScanned(true);
    try {
      if (source === 'demo' && !__DEV__) throw new Error('開発用の操作は利用できません。');
      const result = await confirmQrDose(await getMedicationDatabase(), medication.id, params.scheduledDay ?? '', data, new Date(), source === 'demo');
      await refresh();
      if (visible.current) router.replace({ pathname: '/dose-complete', params: { medicationName: result.medication.name, doseTime: result.medication.doseTime } });
    } catch (cause) {
      Alert.alert('服用を記録できませんでした', cause instanceof Error ? cause.message : '保存できませんでした。もう一度お試しください。', [{ text: '確認', onPress: () => { scanLocked.current = false; setScanned(false); } }], { cancelable: false });
    }
  }

  const cancel = <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={goHome}><Text>ホームへ戻る</Text></Pressable>;
  const demoButton = __DEV__ && <Pressable accessibilityRole="button" style={styles.demoButton} onPress={() => void complete('demo')}><Text style={styles.demoButtonText}>デモ：ボタンで読み取り完了</Text></Pressable>;

  if (medicationsLoading || recordsLoading) return <SafeAreaView style={styles.center}><Text>服薬予定を確認しています…</Text>{cancel}</SafeAreaView>;
  if (!validOccurrence || !medication) return <SafeAreaView style={styles.center}><Text style={styles.title}>服薬予定が見つかりません</Text><Text style={styles.body}>ホーム画面から対象のお薬を選び直してください。</Text>{cancel}</SafeAreaView>;
  if (alreadyTaken) return <SafeAreaView style={styles.center}><Text style={styles.title}>服用を記録済みです</Text><Text style={styles.body}>{medication.name}は今日の服薬済みとして保存されています。</Text>{cancel}</SafeAreaView>;
  if (!permission) return <SafeAreaView style={styles.center}><Text>カメラの準備中…</Text>{cancel}</SafeAreaView>;
  if (!permission.granted) return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.title}>QR読み取りにはカメラが必要です</Text>
      <Text style={styles.body}>{medication.name}の服薬確認にカメラを使用します。</Text>
      <Pressable accessibilityRole="button" style={styles.primary} onPress={allowCamera}>
        <Text style={styles.primaryText}>{permission.canAskAgain ? 'カメラを許可する' : '端末の設定を開く'}</Text>
      </Pressable>
      {demoButton}
      {cancel}
    </SafeAreaView>
  );
  if (cameraError) return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.title}>カメラを起動できませんでした</Text>
      <Text style={styles.body}>実機とカメラ権限を確認してください。</Text>
      <Pressable accessibilityRole="button" style={styles.primary} onPress={() => setCameraError(false)}><Text style={styles.primaryText}>再試行</Text></Pressable>
      {demoButton}
      {cancel}
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.headerTitle}>{medication.name}を服用する</Text>
      <View style={styles.cameraWrap}>
        {focused && foreground && !scanned && <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => void complete('qr', data)}
          onMountError={() => setCameraError(true)}
        />}
        <View pointerEvents="none" style={styles.frame} />
        <Text style={styles.guide}>対象のお薬のQRコードを枠に合わせてください</Text>
      </View>
      <View style={styles.bottom}>
        <Text style={styles.body}>{scanned ? '服薬記録を保存しています…' : `${medication.doseTime}の服薬予定`}</Text>
        {demoButton}
        {cancel}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5faf8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 18, backgroundColor: '#f5faf8' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', color: '#263e48' },
  body: { fontSize: 13, lineHeight: 22, textAlign: 'center', color: '#72848a' },
  primary: { backgroundColor: '#36b7aa', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  primaryText: { color: '#fff', fontWeight: '700' },
  demoButton: { borderRadius: 14, borderWidth: 1, borderColor: '#36b7aa', backgroundColor: '#e9f8f5', padding: 13, width: '100%', alignItems: 'center' },
  demoButtonText: { color: '#267f7b', fontSize: 12, fontWeight: '700' },
  headerTitle: { fontWeight: '700', fontSize: 16, color: '#263e48', textAlign: 'center', padding: 16 },
  cameraWrap: { flex: 1, marginHorizontal: 20, borderRadius: 22, overflow: 'hidden', backgroundColor: '#263e48', justifyContent: 'center', alignItems: 'center' },
  frame: { width: '72%', aspectRatio: 1, borderWidth: 3, borderColor: '#fff', borderRadius: 20 },
  guide: { position: 'absolute', bottom: 18, color: '#fff', fontSize: 12, textAlign: 'center', paddingHorizontal: 12 },
  bottom: { alignItems: 'center', padding: 20, gap: 14 },
  cancelButton: { borderRadius: 14, backgroundColor: '#fff', padding: 14, width: '100%', alignItems: 'center' },
});
