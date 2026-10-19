import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { buildDailySchedule, localDay } from '@/features/medications/dose-record';
import { nextScheduledDoseGroup } from '@/features/medications/dose-groups';
import { useNfcBox } from '@/state/nfc-box-context';
import { doseDeadline } from '@/features/medications/dose-timing';
import { medicationGraceMinutes } from '@/features/medications/grace-period';
import { useMedicationRegistry } from '@/state/medication-registry-context';
import { useDoseRecords } from '@/state/dose-record-context';
import { BunnyArt } from '@/components/nomupay-art';

const C = { ink: '#3b3439', muted: '#93858a', mint: '#f56889', pale: '#fff0f2' };

export default function DoseCompleteScreen() {
  const router = useRouter();
  const { medicationName, doseTime, alreadyRecorded } = useLocalSearchParams<{
    medicationName?: string;
    doseTime?: string;
    alreadyRecorded?: string;
  }>();
  const name = medicationName || 'お薬';
  const { medications, isLoading, loadError } = useMedicationRegistry();
  const { records, isLoading: recordsLoading, loadError: recordsError } = useDoseRecords();
  const { boxes } = useNfcBox();
  const now = new Date();
  const schedule = buildDailySchedule(medications, records, now).filter((item) =>
    item.status !== 'due' || now.getTime() < doseDeadline(
      item.scheduledDay, item.medication.doseTime, medicationGraceMinutes(item.medication.graceMinutes),
    ).getTime());
  const next = nextScheduledDoseGroup(schedule, medications, boxes, now);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>MISSION COMPLETE</Text>
        <View style={styles.checkCircle}><Text style={styles.check}>✓</Text></View>
        <Text accessibilityRole="header" style={styles.title}>服用完了！</Text>
        <Text style={styles.message}>{name}の服用を{`\n`}記録しました</Text>
        <View style={styles.recordCard}>
          <View><Text style={styles.label}>今日のおくすり</Text><Text style={styles.name}>{name}</Text></View>
          {!!doseTime && <Text style={styles.time}>{doseTime}</Text>}
        </View>
        {alreadyRecorded === '1' && <Text style={styles.note}>この服用はすでに記録されていました。</Text>}
        <View style={styles.nextCard}>
          <Text style={styles.label}>次の服薬予定</Text>
          {isLoading || recordsLoading ? <Text style={styles.note}>確認中…</Text> : loadError || recordsError ? <Text style={styles.note}>予定を読み込めませんでした。ホームで再確認してください。</Text> : next ? <>
            <Text style={styles.name}>{next.medications.map((medication) => medication.name).join('・')}</Text>
            <Text style={styles.time}>{next.day === localDay(now) ? '今日' : `${Number(next.day.slice(5, 7))}月${Number(next.day.slice(8))}日`} {next.medication.doseTime}</Text>
            <Text style={styles.note}>{next.box?.name ?? '薬箱未選択'}</Text>
          </> : <Text style={styles.note}>次の服薬予定はありません。</Text>}
        </View>
        <BunnyArt />
        <Text style={styles.cheer}>今日もひとつ、よくできました！</Text>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.dismissTo('/')}>
          <Text style={styles.buttonText}>ホームへ戻る</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff9f6' },
  content: { flexGrow: 1, paddingVertical: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  kicker: { color: '#d98a9b', fontSize: 10, letterSpacing: 1.5 },
  checkCircle: { width: 92, height: 92, marginTop: 22, borderRadius: 46, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', shadowColor: C.mint, shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  check: { color: '#fff', fontSize: 49, fontWeight: '800' },
  title: { marginTop: 23, color: C.ink, fontSize: 30, lineHeight: 40, fontWeight: '800' },
  message: { marginTop: 10, color: C.muted, fontSize: 14, lineHeight: 24, textAlign: 'center' },
  recordCard: { width: '100%', marginTop: 28, padding: 18, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#f2e4e4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextCard: { width: '100%', marginTop: 16, padding: 18, borderRadius: 18, backgroundColor: '#fff0f2', gap: 6 },
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
