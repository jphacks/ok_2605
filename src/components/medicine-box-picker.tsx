import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNfcBox } from '@/state/nfc-box-context';
import { medicationColors as C } from './medication-screen';
import { MedicineBoxIcon } from './medicine-box-icon';

export function MedicineBoxPicker({ value, onChange, disabled = false }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const { boxes, loading, error, reload } = useNfcBox();
  return <View style={styles.group}>
    <Text style={styles.label}>この薬を入れる薬箱</Text>
    {loading && <Text style={styles.note}>薬箱を読み込んでいます…</Text>}
    {!!error && <><Text accessibilityRole="alert" style={styles.note}>{error}</Text><Pressable disabled={disabled} onPress={() => void reload()} style={styles.option}><Text>再読み込み</Text></Pressable></>}
    {boxes.map((box) => <Pressable key={box.id} accessibilityRole="radio" accessibilityState={{ selected: value === String(box.id), disabled }} disabled={disabled || loading || !!error} onPress={() => onChange(String(box.id))} style={[styles.option, value === String(box.id) && styles.selected]}>
      <MedicineBoxIcon size={28} /><Text style={styles.name}>{box.name}</Text><Text style={styles.check}>{value === String(box.id) ? '●' : '○'}</Text>
    </Pressable>)}
    {!loading && !error && !boxes.length && <Text style={styles.note}>はじめに、お薬を入れる薬箱を作成しましょう。</Text>}
    <Link href="/boxes/new" asChild><Pressable accessibilityRole="button" disabled={disabled} style={styles.add}><MedicineBoxIcon size={22} /><Text style={styles.check}>＋ 新しい薬箱を作成</Text></Pressable></Link>
  </View>;
}
const styles = StyleSheet.create({
  group: { gap: 10 }, label: { color: C.ink, fontWeight: '600', fontSize: 13 },
  option: { minHeight: 56, padding: 14, borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12 },
  selected: { borderColor: C.mint, backgroundColor: C.pale }, name: { flex: 1, color: C.ink, fontSize: 14 },
  check: { color: C.mint, fontSize: 13, fontWeight: '600' },
  note: { color: C.muted, fontSize: 12, lineHeight: 21 }, add: { minHeight: 44, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' },
});
