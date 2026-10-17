import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = { ink: '#263e48', muted: '#72848a', mint: '#36b7aa', pale: '#e8f7f4' };

export default function DoseCompleteScreen() {
  const router = useRouter();
  const { medicationName, doseTime, alreadyRecorded } = useLocalSearchParams<{
    medicationName?: string;
    doseTime?: string;
    alreadyRecorded?: string;
  }>();
  const name = medicationName || 'お薬';

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.content}>
        <Text style={styles.kicker}>MISSION COMPLETE</Text>
        <View style={styles.checkCircle}><Text style={styles.check}>✓</Text></View>
        <Text accessibilityRole="header" style={styles.title}>服用完了！</Text>
        <Text style={styles.message}>{name}の服用を{`\n`}記録しました</Text>
        <View style={styles.recordCard}>
          <View><Text style={styles.label}>今日のおくすり</Text><Text style={styles.name}>{name}</Text></View>
          {!!doseTime && <Text style={styles.time}>{doseTime}</Text>}
        </View>
        {alreadyRecorded === '1' && <Text style={styles.note}>この服用はすでに記録されていました。</Text>}
        <Text style={styles.bear} accessibilityLabel="よろこぶくま">🐻</Text>
        <Text style={styles.cheer}>今日もひとつ、よくできました！</Text>
      </View>
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.dismissTo('/')}>
          <Text style={styles.buttonText}>ホームへ戻る</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5faf8' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  kicker: { color: '#5e9696', fontSize: 10, letterSpacing: 1.5 },
  checkCircle: { width: 92, height: 92, marginTop: 22, borderRadius: 46, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', shadowColor: C.mint, shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  check: { color: '#fff', fontSize: 49, fontWeight: '800' },
  title: { marginTop: 23, color: C.ink, fontSize: 30, lineHeight: 40, fontWeight: '800' },
  message: { marginTop: 10, color: C.muted, fontSize: 14, lineHeight: 24, textAlign: 'center' },
  recordCard: { width: '100%', marginTop: 28, padding: 18, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5eeed', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: C.muted, fontSize: 11 },
  name: { marginTop: 5, color: C.ink, fontSize: 15, fontWeight: '700' },
  time: { color: C.mint, fontSize: 23, fontWeight: '800', fontVariant: ['tabular-nums'] },
  note: { marginTop: 12, color: C.muted, fontSize: 11 },
  bear: { marginTop: 24, fontSize: 74 },
  cheer: { color: C.ink, fontSize: 13, fontWeight: '700' },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: C.mint },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
