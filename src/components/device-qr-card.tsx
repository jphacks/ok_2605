import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getMedicationDatabase } from '@/features/medications/database';
import { deviceQrPayload } from '@/features/boxes/medicine-box-repository';
import { qrImageUri } from '@/features/verification/qr-image';
import { medicationColors as C } from './medication-screen';

export function DeviceQrCard() {
  const [uri, setUri] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    getMedicationDatabase().then(deviceQrPayload).then((payload) => {
      if (active) { setUri(qrImageUri(payload)); setError(''); }
    }).catch(() => { if (active) setError('QRコードを読み込めませんでした。'); });
    return () => { active = false; };
  }, [attempt]);
  return <View style={styles.card}>
    <Text style={styles.title}>この端末の共通QRコード</Text>
    <Text style={styles.note}>すべてのお薬・薬箱で、この1枚を使えます。</Text>
    {!!uri && <Image accessible accessibilityLabel="この端末共通の服薬確認QRコード" source={{ uri }} contentFit="contain" style={styles.qr} />}
    {!uri && !error && <Text style={styles.note}>QRコードを準備しています…</Text>}
    {!!error && <><Text accessibilityRole="alert" style={styles.note}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setAttempt((n) => n + 1)} style={styles.retry}><Text>再読み込み</Text></Pressable></>}
    <Text style={styles.note}>スクリーンショットを印刷して薬箱に貼るか、別の端末に表示してください。服薬時刻にホームでお薬を選び、このQRを読み取ると記録できます。</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 20, gap: 12 },
  title: { fontSize: 15, fontWeight: '700', color: C.ink }, note: { fontSize: 12, lineHeight: 22, color: C.muted },
  qr: { width: '100%', maxWidth: 240, aspectRatio: 1, alignSelf: 'center' }, retry: { minHeight: 44, justifyContent: 'center' },
});
