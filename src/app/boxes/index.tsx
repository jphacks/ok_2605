import { Link, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { MedicineBoxArt } from '@/components/nomupay-art';
import { MedicineBoxIcon } from '@/components/medicine-box-icon';
import { DeviceQrCard } from '@/components/device-qr-card';
import { useNfcBox } from '@/state/nfc-box-context';

export default function BoxesScreen() {
  const { boxes, loading, error, reload } = useNfcBox();
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  return <MedicationScreen title="薬箱" description="お薬の居場所を、ひとつずつ。">
    <MedicineBoxArt />
    {loading && <Text style={styles.note}>薬箱を読み込んでいます…</Text>}
    {!!error && <><Text accessibilityRole="alert" style={styles.note}>{error}</Text><Pressable onPress={() => void reload()} style={styles.card}><Text>再読み込み</Text></Pressable></>}
    {!loading && !error && !boxes.length && <View style={styles.card}><Text style={styles.name}>はじめての薬箱を作りましょう</Text><Text style={styles.note}>「いつもの薬箱」「持ち歩き用」など、わかりやすい名前をつけられます。</Text></View>}
    {boxes.map((box) => <Link key={box.id} href={{ pathname: '/boxes/[id]', params: { id: box.id } }} asChild>
      <Pressable accessibilityRole="button" style={styles.card}>
        <View style={styles.row}><MedicineBoxIcon size={36} /><View style={{ flex: 1, gap: 7 }}><Text style={styles.name}>{box.name}</Text><Text style={styles.note}>お薬 {box.medications.length}件{Platform.OS === 'android' ? ` ・ ${box.tagId ? 'NFCタグ登録済み' : 'NFCタグ未登録'}` : ''}</Text></View><Text style={styles.arrow}>›</Text></View>
      </Pressable>
    </Link>)}
    <Link href="/boxes/new" asChild><Pressable accessibilityRole="button" style={styles.add}><MedicineBoxIcon size={24} /><Text style={styles.addText}>＋ 薬箱を追加する</Text></Pressable></Link>
    <DeviceQrCard />
  </MedicationScreen>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 20, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 }, arrow: { color: C.muted, fontSize: 24 },
  name: { fontSize: 16, fontWeight: '700', color: C.ink }, note: { fontSize: 12, lineHeight: 22, color: C.muted },
  add: { minHeight: 50, borderRadius: 25, backgroundColor: C.mint, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, addText: { fontWeight: '700', fontSize: 14, color: '#fff' },
});
