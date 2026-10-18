import { MIN_PENALTY_AMOUNT } from '@/features/medications/medication';
import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MedicationRegistryStatus } from '@/components/medication-registry-status';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { useMedicationRegistry } from '@/state/medication-registry-context';

export default function MedicationsScreen() {
  const { medications, isLoading, loadError } = useMedicationRegistry();
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const justRegistered = medications.find((medication) => String(medication.id) === registered);

  return (
    <MedicationScreen title="登録したおくすり" description="毎日の服用時間とペナルティ金額を確認できます。">
      <Link href="/medications/new" asChild>
        <Pressable accessibilityRole="button" style={styles.add}>
          <Text style={styles.addText}>＋ 薬を登録する</Text>
        </Pressable>
      </Link>
      <MedicationRegistryStatus />
      {!isLoading && !loadError && (
        <>
          {justRegistered && <Text accessibilityRole="alert" style={styles.success}>「{justRegistered.name}」を登録しました。</Text>}
          <Text style={styles.count}>登録済み {medications.length}件</Text>
          {medications.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.name}>まだ薬が登録されていません</Text>
              <Text style={styles.helper}>「薬を登録する」から、いつものおくすりを追加しましょう。</Text>
            </View>
          ) : medications.map((medication) => (
            <View key={medication.id} style={styles.card}>
              <Text style={styles.time}>毎日 {medication.doseTime}</Text>
              <Text style={styles.name}>{medication.name}</Text>
              <View style={styles.divider} />
              <Text style={styles.helper}>ペナルティ設定額</Text>
              <Text style={styles.amount}>{medication.penaltyAmount.toLocaleString('ja-JP')}円</Text>
              <Link href={{ pathname: '/medications/[id]', params: { id: String(medication.id) } }} asChild>
                <Pressable accessibilityRole="button" style={styles.add}><Text style={styles.addText}>QRコード・編集 ›</Text></Pressable>
              </Link>
              {medication.penaltyAmount < MIN_PENALTY_AMOUNT && <Text style={styles.helper}>最低金額の変更前に登録された設定です。</Text>}
            </View>
          ))}
          <Text style={styles.footnote}>薬の登録では課金されません。</Text>
        </>
      )}
    </MedicationScreen>
  );
}

const styles = StyleSheet.create({
  add: { minHeight: 52, justifyContent: 'center', alignItems: 'center', backgroundColor: C.mint, borderRadius: 16, padding: 16 },
  addText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  count: { color: C.muted, fontSize: 13, marginTop: 8 },
  success: { color: C.mint, backgroundColor: C.pale, padding: 16, borderRadius: 12, fontSize: 14, lineHeight: 23 },
  card: { padding: 22, gap: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  time: { color: C.mint, fontWeight: '700', fontSize: 15 },
  name: { color: C.ink, fontSize: 19, lineHeight: 28, fontWeight: '700' },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 6 },
  helper: { color: C.muted, fontSize: 13, lineHeight: 22 },
  amount: { color: C.ink, fontSize: 17, fontWeight: '600' },
  footnote: { color: C.muted, fontSize: 12, textAlign: 'center', lineHeight: 20 },
});
