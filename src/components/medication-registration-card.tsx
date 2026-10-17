import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMedicationRegistry } from '@/state/medication-registry-context';

import { MedicationRegistryStatus } from './medication-registry-status';
import { medicationColors as C } from './medication-screen';

export function MedicationRegistrationCard() {
  const { medications, isLoading, loadError } = useMedicationRegistry();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>おくすりの管理</Text>
      <Text style={styles.description}>
        {isLoading || loadError ? '服用時間とペナルティ金額を登録できます。' : `登録したおくすり ${medications.length}件`}
      </Text>
      <MedicationRegistryStatus />
      <Link href="/medications/new" asChild>
        <Pressable accessibilityRole="button" style={styles.add}>
          <Text style={styles.addText}>＋ 薬を登録する</Text>
        </Pressable>
      </Link>
      <Link href="/medications" asChild>
        <Pressable accessibilityRole="button" style={styles.list}>
          <Text style={styles.listText}>登録した薬を見る ›</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 22, backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 10, borderWidth: 1, borderColor: C.line },
  title: { color: C.ink, fontWeight: '700', fontSize: 16 },
  description: { color: C.muted, fontSize: 13, lineHeight: 22 },
  add: { backgroundColor: C.mint, borderRadius: 12, padding: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  listText: { color: C.mint, fontWeight: '600', fontSize: 14 },
});
