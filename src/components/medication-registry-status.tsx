import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useMedicationRegistry } from '@/state/medication-registry-context';

import { medicationColors as C } from './medication-screen';

export function MedicationRegistryStatus() {
  const { isLoading, loadError, reloadMedications } = useMedicationRegistry();
  if (isLoading) {
    return <View style={styles.box}><ActivityIndicator color={C.mint} /><Text style={styles.text}>薬の情報を読み込んでいます…</Text></View>;
  }
  if (!loadError) return null;

  return (
    <View style={styles.box}>
      <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
      <Pressable accessibilityRole="button" style={styles.retry} onPress={() => { void reloadMedications(); }}>
        <Text style={styles.retryText}>もう一度読み込む</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 12, backgroundColor: '#fff', borderRadius: 16 },
  text: { color: C.muted, fontSize: 14, textAlign: 'center' },
  error: { color: C.error, fontSize: 14, lineHeight: 22 },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: C.pale, borderRadius: 12 },
  retryText: { color: C.mint, fontWeight: '600' },
});
