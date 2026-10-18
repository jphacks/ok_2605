import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { MedicineBoxArt } from '@/components/nomupay-art';
import { BoxTagButton } from '@/components/box-tag-button';
import { useNfcBox } from '@/state/nfc-box-context';

export default function BoxDetailScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { boxes, loading, error, reload } = useNfcBox();
  const box = boxes.find((item) => String(item.id) === id);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  return <MedicationScreen title={box?.name ?? '薬箱の確認'} description={created ? '薬箱の登録が完了しました！' : 'この薬箱のお薬を確認できます。'} backTo="/boxes">
    <MedicineBoxArt />
    {loading && <Text style={styles.note}>読み込み中…</Text>}
    {!!error && <><Text accessibilityRole="alert" style={styles.note}>{error}</Text><Pressable style={styles.button} onPress={() => void reload()}><Text style={styles.buttonText}>再読み込み</Text></Pressable></>}
    {!loading && !error && !box && <Text style={styles.note}>薬箱が見つかりません。薬箱一覧から選び直してください。</Text>}
    {box && <>
      <View style={styles.card}><Text style={styles.title}>{box.name}</Text><Text style={styles.badge}>{Platform.OS === 'android' ? (box.tagId ? '✓ NFCタグ登録済み' : 'NFCタグを登録してください') : '✓ 端末共通QRコードで服薬を確認'}</Text><BoxTagButton boxId={box.id} registered={!!box.tagId} /></View>
      <Text style={styles.title}>この薬箱に登録されているお薬</Text>
      {!box.medications.length && <Text style={styles.note}>まだお薬は登録されていません。お薬の登録・編集画面で、この薬箱を選んでください。</Text>}
      {box.medications.map((medication) => <Link key={medication.id} href={{ pathname: '/medications/[id]', params: { id: medication.id } }} asChild><Pressable accessibilityRole="button" style={styles.card}><View style={styles.row}><Text style={styles.sun}>{Number(medication.doseTime.slice(0, 2)) < 17 ? '☀' : '☾'}</Text><Text style={styles.name}>{medication.name}</Text><Text style={styles.time}>{medication.doseTime} ›</Text></View></Pressable></Link>)}
      <Link href={{ pathname: '/medications/new', params: { boxId: box.id } }} asChild><Pressable accessibilityRole="button" style={styles.button}><Text style={styles.buttonText}>＋ この薬箱にお薬を追加する</Text></Pressable></Link>
      <Link href="/medications" asChild><Pressable style={styles.secondary}><Text style={styles.link}>登録済みのお薬の保管先を変更する ›</Text></Pressable></Link>
      {Platform.OS !== 'android' && <Link href="/boxes" style={styles.link}>端末共通QRコードを確認する ›</Link>}
    </>}
  </MedicationScreen>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 14, borderWidth: 1, borderColor: C.line }, title: { color: C.ink, fontSize: 15, fontWeight: '700' },
  badge: { color: '#299567', fontSize: 12, lineHeight: 20 }, note: { color: C.muted, fontSize: 12, lineHeight: 22 }, row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  sun: { color: '#e9b05c', fontSize: 24 }, name: { flex: 1, color: C.ink, fontWeight: '600' }, time: { color: C.muted, fontSize: 12 },
  button: { minHeight: 50, borderRadius: 25, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', padding: 12 }, buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, link: { color: C.mint, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
});
