import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  cancelNfcRead,
  checkNfcAvailability,
  openAndroidNfcSettings,
  readNfcTag,
  type NfcAvailability,
  type NfcReadResult,
} from '@/features/nfc/nfc-reader';
import { useMedication } from '@/state/medication-context';

const C = { ink: '#263e48', muted: '#72848a', mint: '#36b7aa', pale: '#e9f8f5' };

export default function NfcScreen() {
  const { state, dispatch } = useMedication();
  const [availability, setAvailability] = useState<NfcAvailability | null>(null);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<NfcReadResult | null>(null);
  const [error, setError] = useState('');
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    setAvailability(null);
    setAvailability(await checkNfcAvailability());
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      cancelled.current = true;
      void cancelNfcRead();
    };
  }, [refresh]));

  useEffect(() => () => {
    cancelled.current = true;
    void cancelNfcRead();
  }, []);

  function complete(tag: NfcReadResult) {
    dispatch({ type: 'confirm-with-nfc', tagId: tag.tagId });
    setResult(tag);
    setReading(false);
  }

  async function startReading() {
    cancelled.current = false;
    setError('');
    setReading(true);
    try {
      complete(await readNfcTag());
    } catch (readError) {
      if (!cancelled.current) {
        setError(readError instanceof Error ? readError.message : 'NFCタグを読み取れませんでした。');
        setReading(false);
      }
    }
  }

  async function stopReading() {
    cancelled.current = true;
    await cancelNfcRead();
    setReading(false);
  }

  function completePreview() {
    complete({ tagId: 'demo-nfc-tag', technology: 'デモ' });
  }

  if (result || state.taken) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <View style={s.successCircle}><Text style={s.successMark}>✓</Text></View>
          <Text style={s.title}>服用確認が完了しました</Text>
          <Text style={s.body}>薬箱の読み取りを確認し、朝のおくすりを服用済みにしました。</Text>
          {result && <Text style={s.tagInfo}>読み取り方式：{result.technology}{'\n'}タグID：{result.tagId}</Text>}
          <Pressable accessibilityRole="button" style={s.primary} onPress={() => router.replace('/')}>
            <Text style={s.primaryText}>ホームへ戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const previewReason = availability?.kind === 'preview'
    ? availability.reason === 'expo-go'
      ? 'Expo GoではNFCを利用できません。画面と完了動作をデモで確認できます。'
      : availability.reason === 'simulator'
        ? 'AndroidエミュレーターではNFCを読み取れません。完了動作をデモで確認できます。'
        : '現在はAndroid実機でNFCを読み取れます。iPhoneではデモ動作を確認できます。'
    : '';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>‹ 戻る</Text></Pressable>
        <Text style={s.headerTitle}>薬箱を読み取る</Text>
        <View style={s.headerSpacer} />
      </View>
      <View style={s.center}>
        <View style={[s.nfcIcon, reading && s.nfcIconReading]}><Text style={s.nfcText}>NFC</Text></View>
        <Text style={s.title}>{reading ? '薬箱を探しています…' : 'スマートフォンを薬箱に近づけてください'}</Text>
        <Text style={s.body}>{reading ? '読み取りが完了するまで、そのまま動かさないでください。' : '薬箱のNFCタグにスマートフォンの背面を近づけます。'}</Text>

        {!availability && <Text style={s.status}>NFCの状態を確認中…</Text>}
        {availability?.kind === 'ready' && !reading && (
          <Pressable accessibilityRole="button" style={s.primary} onPress={startReading}>
            <Text style={s.primaryText}>NFC読み取りを開始</Text>
          </Pressable>
        )}
        {reading && (
          <Pressable accessibilityRole="button" style={s.secondary} onPress={stopReading}>
            <Text style={s.secondaryText}>読み取りをキャンセル</Text>
          </Pressable>
        )}
        {availability?.kind === 'disabled' && (
          <>
            <Text style={s.warning}>端末のNFCがオフになっています。</Text>
            <Pressable accessibilityRole="button" style={s.primary} onPress={openAndroidNfcSettings}>
              <Text style={s.primaryText}>NFC設定を開く</Text>
            </Pressable>
          </>
        )}
        {availability?.kind === 'unsupported' && <Text style={s.warning}>この端末はNFC読み取りに対応していません。</Text>}
        {availability?.kind === 'error' && <Text style={s.warning}>NFCを準備できませんでした：{availability.message}</Text>}
        {previewReason && (
          <View style={s.previewBox}>
            <Text style={s.previewText}>{previewReason}</Text>
            <Pressable accessibilityRole="button" style={s.demoButton} onPress={completePreview}>
              <Text style={s.demoButtonText}>デモで読み取り完了</Text>
            </Pressable>
          </View>
        )}
        {error && (
          <View style={s.previewBox}>
            <Text style={s.warning}>{error}</Text>
            <Pressable accessibilityRole="button" style={s.demoButton} onPress={startReading}>
              <Text style={s.demoButtonText}>もう一度読み取る</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5faf8' },
  header: { minHeight: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: C.ink, fontSize: 14 },
  headerTitle: { color: C.ink, fontSize: 16, fontWeight: '700' },
  headerSpacer: { width: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 18 },
  nfcIcon: { width: 142, height: 142, borderRadius: 71, borderWidth: 3, borderColor: C.mint, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  nfcIconReading: { borderWidth: 8, backgroundColor: '#d9f5ef' },
  nfcText: { color: C.mint, fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  successCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  successMark: { color: '#fff', fontSize: 64, fontWeight: '700' },
  title: { color: C.ink, fontSize: 22, lineHeight: 31, fontWeight: '700', textAlign: 'center' },
  body: { color: C.muted, fontSize: 13, lineHeight: 22, textAlign: 'center' },
  status: { color: C.muted, fontSize: 13 },
  warning: { color: '#a45b34', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  tagInfo: { color: C.muted, backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 11, lineHeight: 18, width: '100%' },
  primary: { width: '100%', backgroundColor: C.mint, borderRadius: 14, padding: 15, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondary: { width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 15, alignItems: 'center' },
  secondaryText: { color: C.ink, fontSize: 13, fontWeight: '600' },
  previewBox: { width: '100%', padding: 16, borderRadius: 16, backgroundColor: '#fff', gap: 14 },
  previewText: { color: C.muted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  demoButton: { borderWidth: 1, borderColor: C.mint, borderRadius: 12, padding: 13, alignItems: 'center', backgroundColor: C.pale },
  demoButtonText: { color: '#267f7b', fontSize: 12, fontWeight: '700' },
});
