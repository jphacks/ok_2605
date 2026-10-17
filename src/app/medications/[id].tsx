import { Link, useLocalSearchParams } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { MedicationRegistryStatus } from '@/components/medication-registry-status';
import { useMedicationRegistry } from '@/state/medication-registry-context';

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { medications, isLoading, loadError } = useMedicationRegistry();
  const medication = medications.find((item) => String(item.id) === id);
  return <MedicationScreen title="おくすりの情報" description="お知らせしたお薬の服用時間を確認しましょう。" backTo="/medications">
    <MedicationRegistryStatus />
    {!isLoading && !loadError && (medication ? <View style={styles.card}>
      <Text style={styles.time}>毎日 {medication.doseTime}</Text>
      <Text style={styles.name}>{medication.name}</Text>
      <Text style={styles.note}>ペナルティ設定額：{medication.penaltyAmount.toLocaleString('ja-JP')}円</Text>
      <Text style={styles.note}>この画面を開くだけでは服用済みになりません。</Text>
      {Platform.OS === 'android' && <Link href="/qr" style={styles.time}>薬箱のNFCタグで服用を確認する</Link>}
    </View> : <Text style={styles.note}>このお薬は見つかりません。お薬一覧で登録内容をご確認ください。</Text>)}
  </MedicationScreen>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', padding: 22, borderRadius: 20, gap: 18 },
  time: { color: C.mint, fontSize: 22, fontWeight: '700' },
  name: { color: C.ink, fontSize: 20, fontWeight: '600' },
  note: { color: C.muted, fontSize: 13, lineHeight: 23 },
});
