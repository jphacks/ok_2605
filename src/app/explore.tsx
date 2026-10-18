import { Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { MedicineBoxIcon } from '@/components/medicine-box-icon';

export default function ExploreScreen() {
  return (
    <MedicationScreen title="設定" description="あなたに合った、続けやすい毎日へ。">
      <View style={styles.card}>
        {([
          ['/reminders', '通知設定・デモ通知'],
          ['/payment-card', 'クレジットカード設定'],
          ['/penalties', 'ペナルティ・履歴'],
          ['/medications', 'お薬の管理'],
          ['/boxes', Platform.OS === 'android' ? '薬箱の管理・NFCタグ' : '薬箱の管理・共通QRコード'],
          ['/history', '服薬カレンダー'],
          ...(__DEV__ ? [['/missed?demo=1', 'デモ：ペナルティ発生画面'] ] as const : []),
          ...(__DEV__ ? [['/payments', '開発用・決済シミュレーター']] as const : []),
        ] as const).map(([href, label], index) => (
          <Link key={href} href={href} asChild>
            <Pressable accessibilityRole="button" style={styles.row}>
              {href === '/boxes' ? <MedicineBoxIcon size={30} /> : <View style={[styles.icon, { backgroundColor: ['#b8a4ee', '#f58fa6', '#f8ad8f', '#88c9c0', '#8fb6d1'][index % 5] }]}><Text style={styles.symbol}>{['♧', '¥', '✚', '▣', '▦'][index % 5]}</Text></View>}
              <Text style={styles.label}>{label}</Text><Text style={styles.arrow}>›</Text>
            </Pressable>
          </Link>
        ))}
      </View>
      <Text style={styles.brand}>のむペイ</Text>
      <Text style={styles.tagline}>飲めた、が増える毎日に。</Text>
      <Text style={styles.note}>ペナルティはテスト決済です。実際の請求はありません。</Text>
    </MedicationScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 20 },
  row: { minHeight: 74, gap: 12, paddingVertical: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line },
  label: { color: C.ink, fontSize: 13, flex: 1 },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  symbol: { color: '#fff', fontSize: 19 },
  brand: { color: C.mint, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 24 },
  tagline: { color: C.muted, textAlign: 'center', fontSize: 12 },
  arrow: { color: '#6d9196', fontSize: 22 },
  note: { fontSize: 11, lineHeight: 21, color: C.muted },
});
