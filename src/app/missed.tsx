import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';

export default function MissedScreen() {
  return (
    <MedicationScreen title="飲み忘れのお知らせ" description="飲めなかった場合のデモ画面です。">
      <View style={styles.hero}>
        <Text style={styles.kicker}>LET’S TRY AGAIN</Text>
        <Text style={styles.title}>飲み忘れてしまった…</Text>
        <Text style={styles.bear} accessibilityLabel="応援するくま">🐻</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>ペナルティのお知らせ</Text>
        <Text style={styles.amount}>¥300</Text>
        <Text style={styles.copy}>次の約束につなげよう。{'\n'}くまも一緒に応援しているよ。</Text>
        <Text style={styles.notice}>表示金額はデモ用のサンプルです。{'\n'}実際の課金・服薬記録の変更は行いません。</Text>
        <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/')} style={styles.button}>
          <Text style={styles.buttonText}>わかった、次は忘れず飲む！</Text>
        </Pressable>
      </View>
    </MedicationScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 12 },
  kicker: { fontSize: 10, letterSpacing: 1.5, color: '#5e9696' },
  title: { fontSize: 24, lineHeight: 36, fontWeight: '700', color: C.ink, textAlign: 'center' },
  bear: { fontSize: 105, marginVertical: 12 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 18, alignItems: 'center' },
  heading: { color: C.ink, fontSize: 16, fontWeight: '600' },
  amount: { color: '#e77760', fontSize: 42, fontWeight: '700' },
  copy: { color: C.ink, fontSize: 13, lineHeight: 24, textAlign: 'center' },
  notice: { color: C.muted, fontSize: 11, lineHeight: 21, textAlign: 'center' },
  button: { minHeight: 48, width: '100%', padding: 14, borderRadius: 14, backgroundColor: '#2d414c', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
