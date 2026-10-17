import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMedication } from '@/state/medication-context';
import { DEMO_QR_PAYLOAD } from '@/state/medication-state';

export default function QrScreen() {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const { state, dispatch } = useMedication();
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
    const subscription = AppState.addEventListener('change', status => {
      setForeground(status === 'active');
      if (status === 'active') void getPermission().catch(() => setCameraError(true));
    });
    return () => subscription.remove();
  }, [getPermission]);

  function goHome() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function allowCamera() {
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      Alert.alert('カメラを利用できません', 'iPhoneの設定でカメラ権限を確認してください。');
    }
  }

  function onScanned({ data }: { data: string }) {
    if (scanLocked.current || state.taken || !visible.current || AppState.currentState !== 'active') return;
    scanLocked.current = true;
    setScanned(true);
    if (data !== DEMO_QR_PAYLOAD) {
      Alert.alert('対象のお薬ではありません', 'デモ用のお薬QRコードを読み取ってください。', [{
        text: 'もう一度読み取る',
        onPress: () => { scanLocked.current = false; setScanned(false); },
      }], { cancelable: false });
      return;
    }
    dispatch({ type: 'scan', payload: data });
    Alert.alert('デモの服用記録を保存しました', '朝のおくすりを記録しました。ホームに反映されます。', [
      { text: 'ホームへ', onPress: goHome },
    ], { cancelable: false });
  }

  function completeDemoScan() {
    if (state.taken || scanLocked.current) return;
    scanLocked.current = true;
    setScanned(true);
    dispatch({ type: 'scan', payload: DEMO_QR_PAYLOAD });
    Alert.alert('デモの服用記録を保存しました', 'QRを読み取ったものとして、朝のおくすりを記録しました。', [
      { text: 'ホームへ', onPress: goHome },
    ], { cancelable: false });
  }

  const cancel = <Pressable accessibilityRole="button" style={s.cancelButton} onPress={goHome}><Text>ホームへ戻る</Text></Pressable>;
  const demoButton = <Pressable accessibilityRole="button" style={s.demoButton} onPress={completeDemoScan}><Text style={s.demoButtonText}>デモ：ボタンで読み取り完了</Text></Pressable>;
  if (state.taken) return <SafeAreaView style={s.center}><Text style={s.title}>服用を記録済みです</Text>{cancel}</SafeAreaView>;
  if (!permission) return <SafeAreaView style={s.center}><Text>カメラの準備中…</Text>{cancel}</SafeAreaView>;
  if (!permission.granted) return (
    <SafeAreaView style={s.center}>
      <Text style={s.title}>QR読み取りにはカメラが必要です</Text>
      <Text style={s.body}>薬箱のQRコードを読み取るため、カメラへのアクセスを許可してください。</Text>
      <Pressable accessibilityRole="button" style={s.primary} onPress={allowCamera}>
        <Text style={s.primaryText}>{permission.canAskAgain ? 'カメラを許可する' : 'iPhoneの設定を開く'}</Text>
      </Pressable>
      {demoButton}
      {cancel}
    </SafeAreaView>
  );
  if (cameraError) return (
    <SafeAreaView style={s.center}>
      <Text style={s.title}>カメラを起動できませんでした</Text>
      <Text style={s.body}>iPhone実機とカメラ権限を確認してください。</Text>
      <Pressable accessibilityRole="button" style={s.primary} onPress={() => setCameraError(false)}><Text style={s.primaryText}>再試行</Text></Pressable>
      {demoButton}
      {cancel}
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <Text style={s.headerTitle}>QRを読み取る</Text>
      <View style={s.cameraWrap}>
        {focused && foreground && !scanned && <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScanned}
          onMountError={() => setCameraError(true)}
        />}
        <View pointerEvents="none" style={s.frame} />
        <Text style={s.guide}>薬箱のQRコードを枠に合わせてください</Text>
      </View>
      <View style={s.bottom}>
        <Text style={s.body}>{scanned ? '読み取り済みです' : 'デモ用QRを読み取り中…'}</Text>
        {demoButton}
        {cancel}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
