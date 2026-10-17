import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomNav } from '@/components/app-bottom-nav';
import { MedicationRegistryStatus } from '@/components/medication-registry-status';
import { buildDailySchedule, localDay, nextScheduledDose } from '@/features/medications/dose-record';
import { useDoseRecords } from '@/state/dose-record-context';
import { useMedicationRegistry } from '@/state/medication-registry-context';
import { useNfcBox } from '@/state/nfc-box-context';
import { demoDeadline } from '@/features/payments/demo-payment';

const C = { ink: '#263e48', muted: '#72848a', mint: '#36b7aa', pale: '#eef9fa', line: '#e5eeed', coral: '#e77760' };

function formatDay(day: string) {
  const [, month, date] = day.split('-').map(Number);
  return `${month}/${date}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { medications, isLoading: medicationsLoading, loadError: medicationsError } = useMedicationRegistry();
  const { day, records, isLoading: recordsLoading, loadError: recordsError, refresh } = useDoseRecords();
  const { box, loading: nfcLoading, error: nfcError, reload: reloadNfc } = useNfcBox();
  const android = Platform.OS === 'android';
  const [now, setNow] = useState(() => new Date());
  const schedule = useMemo(() => buildDailySchedule(medications, records, now), [medications, records, now]);
  const actionableSchedule = useMemo(() => android
    ? schedule.filter((item) => item.status !== 'due' || now.getTime() < demoDeadline(localDay(now), item.medication.doseTime).getTime())
    : schedule, [android, schedule, now]);
  const next = useMemo(() => nextScheduledDose(actionableSchedule, medications, now), [actionableSchedule, medications, now]);
  const takenCount = schedule.filter((item) => item.status === 'taken').length;
  const loading = medicationsLoading || recordsLoading;
  const hasError = !!medicationsError || !!recordsError;

  useFocusEffect(useCallback(() => {
    setNow(new Date());
  }, []));

  useEffect(() => {
    const updateNow = () => setNow(new Date());
    const timer = setInterval(updateNow, 15_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        updateNow();
        void refresh();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);

  const openScanner = (medicationId: number) => {
    router.push({ pathname: '/qr', params: { medicationId: String(medicationId), scheduledDay: day } });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={styles.headerText}>くすり日和</Text></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>YOUR DAILY LITTLE PROMISE</Text>
        <Text style={styles.title}>
          {medications.length > 0 && takenCount === medications.length ? '今日も、よくできました！' : '今日のおくすり'}
        </Text>
        <View style={styles.mascot}><Text style={styles.bear}>🐻</Text><Text style={styles.spark}>✦</Text></View>
        <Text style={styles.helper}>“飲んで、今日もいい一日にしよう！”</Text>

        <MedicationRegistryStatus />
        {android && !nfcLoading && !box && (
          <View style={styles.emptyCard}>
            <Text style={styles.sectionTitle}>最初に薬箱を登録しましょう</Text>
            <Text style={styles.bodyText}>登録は最初の1回だけです。追加する薬はすべて、この薬箱へ自動で紐づきます。</Text>
            <Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push('/qr')}>
              <Text style={styles.primaryText}>薬箱のNFCタグを登録する</Text>
            </Pressable>
            {!!nfcError && <><Text style={styles.errorText}>{nfcError}</Text><Pressable onPress={() => void reloadNfc()} style={styles.retry}><Text style={styles.retryText}>薬箱を再読み込み</Text></Pressable></>}
          </View>
        )}
        {recordsError && (
          <View style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.errorText}>{recordsError}</Text>
            <Pressable accessibilityRole="button" style={styles.retry} onPress={() => void refresh()}>
              <Text style={styles.retryText}>もう一度読み込む</Text>
            </Pressable>
          </View>
        )}

        {!loading && !hasError && medications.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.sectionTitle}>お薬がまだ登録されていません</Text>
            <Text style={styles.bodyText}>薬を登録すると、今日の予定がここに表示されます。</Text>
            <Pressable style={styles.primary} onPress={() => router.push('/medications/new')}>
              <Text style={styles.primaryText}>＋ 薬を登録する</Text>
            </Pressable>
          </View>
        )}

        {!loading && !hasError && next && (
          <View style={[styles.nextCard, next.due && styles.dueCard]}>
            <Text style={[styles.nextLabel, next.due && styles.dueText]}>
              {next.due ? '服用時間になりました' : next.day === day ? '次の服薬予定' : `${formatDay(next.day)}の次の服薬予定`}
            </Text>
            <Text style={styles.nextTime}>{next.medication.doseTime}</Text>
            <Text style={styles.nextName}>{next.medication.name}</Text>
            {next.due && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${next.medication.name}の服用を記録する`}
                accessibilityHint={android ? 'NFCタグの読み取り画面を開きます' : 'QRコードの読み取り画面を開きます'}
                style={styles.primary}
                onPress={() => openScanner(next.medication.id)}>
                <Text style={styles.primaryText}>「{next.medication.name}」の服用を記録する</Text>
                <Text style={styles.primarySubText}>{android ? 'NFCタグをタッチ' : 'QRコードを読み取る'}</Text>
              </Pressable>
            )}
          </View>
        )}

        {!loading && !hasError && medications.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>今日の服薬予定</Text>
              <Text style={styles.progress}>{takenCount}/{medications.length} 完了</Text>
            </View>
            <View style={styles.list}>
              {schedule.map((item) => {
                const isTaken = item.status === 'taken';
                const isDue = item.status === 'due';
                const expired = android && isDue && now.getTime() >= demoDeadline(day, item.medication.doseTime).getTime();
                const canScan = isDue && !expired;
                return (
                  <View key={item.medication.id} style={styles.medicationCard}>
                    <View style={styles.medicationRow}>
                      <View style={[styles.statusDot, isTaken && styles.takenDot, isDue && styles.dueDot]}>
                        <Text style={styles.statusMark}>{isTaken ? '✓' : isDue ? '!' : '·'}</Text>
                      </View>
                      <View style={styles.medicationInfo}>
                        <Text style={styles.medicationTime}>{item.medication.doseTime}</Text>
                        <Text style={styles.medicationName}>{item.medication.name}</Text>
                      </View>
                      <Text style={[styles.statusText, isDue && styles.dueText]}>
                        {isTaken ? '服用済み' : expired ? '確認期限終了' : isDue ? '服用時間です' : '予定'}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isTaken
                        ? `${item.medication.name}は服用記録済みです`
                        : expired
                          ? `${item.medication.name}の確認期限を過ぎました`
                          : isDue
                            ? `${item.medication.name}の服用を記録する`
                            : `${item.medication.name}は${item.medication.doseTime}から記録できます`}
                      accessibilityState={{ disabled: isTaken || !canScan }}
                      disabled={isTaken || !canScan}
                      onPress={() => openScanner(item.medication.id)}
                      style={[styles.scanButton, (isTaken || !canScan) && styles.disabled]}>
                      <Text style={styles.scanButtonText}>
                        {isTaken
                          ? `✓ 「${item.medication.name}」は服用記録済み`
                          : expired
                            ? `「${item.medication.name}」の確認期限を過ぎました`
                            : isDue
                              ? `「${item.medication.name}」の服用を記録する`
                              : `${item.medication.doseTime}から「${item.medication.name}」を記録できます`}
                      </Text>
                      {isDue && !isTaken && !expired && (
                        <Text style={styles.scanButtonSubText}>{android ? 'NFCタグをタッチ' : 'QRコードを読み取る'}</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
      <AppBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5faf8' },
  header: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3fafb' },
  headerText: { fontSize: 13, fontWeight: '600', color: C.ink },
  content: { padding: 24, paddingBottom: 40 },
  kicker: { fontSize: 10, letterSpacing: 1.5, color: '#5e9696', textAlign: 'center', marginTop: 8 },
  title: { fontSize: 24, lineHeight: 36, fontWeight: '700', color: C.ink, textAlign: 'center', marginTop: 9 },
  mascot: { height: 135, alignItems: 'center', justifyContent: 'center' },
  bear: { fontSize: 92 },
  spark: { position: 'absolute', right: 40, top: 16, fontSize: 28, color: '#f7c45f' },
  helper: { fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 18 },
  nextCard: { backgroundColor: '#fff', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.line },
  dueCard: { borderColor: '#f0b4a7', backgroundColor: '#fffaf8' },
  nextLabel: { color: C.mint, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  nextTime: { fontSize: 38, fontWeight: '700', textAlign: 'center', color: C.ink, marginTop: 5 },
  nextName: { fontSize: 15, textAlign: 'center', color: C.ink, marginTop: 3 },
  primary: { backgroundColor: C.mint, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 18 },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  primarySubText: { color: '#eafffc', fontSize: 10, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: C.line },
  bodyText: { color: C.muted, fontSize: 13, lineHeight: 22, marginTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  progress: { color: C.muted, fontSize: 12 },
  list: { gap: 12 },
  medicationCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.line },
  medicationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  medicationInfo: { flex: 1 },
  medicationTime: { color: C.mint, fontSize: 17, fontWeight: '700' },
  medicationName: { color: C.ink, fontSize: 14, marginTop: 3 },
  statusDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  takenDot: { backgroundColor: C.mint },
  dueDot: { backgroundColor: C.coral },
  statusMark: { color: '#fff', fontWeight: '700' },
  statusText: { color: C.muted, fontSize: 11 },
  dueText: { color: C.coral },
  scanButton: { backgroundColor: C.mint, borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 14 },
  scanButtonText: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  scanButtonSubText: { color: '#eafffc', fontSize: 10, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  disabled: { backgroundColor: '#a9bcb9' },
  errorBox: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12, marginBottom: 16 },
  errorText: { color: '#aa353c', fontSize: 13 },
  retry: { backgroundColor: C.pale, borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: C.mint, fontWeight: '600' },
});
