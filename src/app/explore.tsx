import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';

export default function ExploreScreen() {
  return (
    <MedicationScreen title="設定" description="あなたに合った続け方を。">
      <View style={styles.card}>
        {([
          ['/medications', 'お薬・服用スケジュール'],
          ['/medications/new', '薬を登録する'],
          ['/nfc', '薬箱のNFC読み取り'],
          ['/payments', 'ペナルティ課金（デモ）'],
        ] as const).map(([href, label]) => (
          <Link key={href} href={href} asChild>
            <Pressable accessibilityRole="button" style={styles.row}>
              <Text style={styles.label}>{label}</Text><Text style={styles.arrow}>›</Text>
            </Pressable>
          </Link>
        ))}
      </View>
      <Text style={styles.note}>通知・ご褒美の設定は今後追加します。</Text>
    </MedicationScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 20 },
  row: { minHeight: 60, paddingVertical: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line },
  label: { color: C.ink, fontSize: 13 },
  arrow: { color: '#6d9196', fontSize: 22 },
  note: { fontSize: 11, lineHeight: 21, color: C.muted },
});
