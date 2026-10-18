import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { AppBottomNav } from '@/components/app-bottom-nav';
import { BunnyArt } from '@/components/nomupay-art';
import { MedicationRegistryStatus } from '@/components/medication-registry-status';
import { medicationColors as C } from '@/components/medication-screen';
import { buildDailySchedule, localDay, nextScheduledDose } from '@/features/medications/dose-record';
import { medicationGraceMinutes } from '@/features/medications/grace-period';
import { useDoseRecords } from '@/state/dose-record-context';
import { useMedicationRegistry } from '@/state/medication-registry-context';
import { useNfcBox } from '@/state/nfc-box-context';
import { doseCountdown, doseDeadline, formatDoseCountdown } from '@/features/payments/penalty-repository';
import { usePenalties } from '@/state/penalty-context';

function progressImage(progress: number) {
  const circumference = 2 * Math.PI * 52;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="52" fill="none" stroke="#f0eae6" stroke-width="9"/><circle cx="64" cy="64" r="52" fill="none" stroke="#43b88b" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + circumference * progress + ' ' + circumference + '" transform="rotate(-90 64 64)"/></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export default function HomeScreen() {
  const router = useRouter();
  const { medications, isLoading: medicationsLoading, loadError: medicationsError } = useMedicationRegistry();
  const { records, isLoading: recordsLoading, loadError: recordsError, refresh } = useDoseRecords();
  const { boxes, loading: boxesLoading, error: boxesError, reload } = useNfcBox();
  const { error: penaltyError, refresh: refreshPenalties } = usePenalties();
  const android = Platform.OS === 'android';
  const [now, setNow] = useState(() => new Date());
  const day = localDay(now);
  const schedule = useMemo(() => buildDailySchedule(medications, records, now), [medications, records, now]);
  const actionable = useMemo(() => schedule.filter((item) => item.status !== 'due' || now.getTime() < doseDeadline(
    item.scheduledDay, item.medication.doseTime, medicationGraceMinutes(item.medication.graceMinutes),
  ).getTime()), [schedule, now]);
  const next = useMemo(() => nextScheduledDose(actionable, medications, now), [actionable, medications, now]);
  const countdown = useMemo(() => next ? doseCountdown(next.medication, next.day, now) : null, [next, now]);
  const nextBox = next ? boxes.find((box) => box.medications.some((medication) => medication.id === next.medication.id)) : undefined;
  const todaySchedule = schedule.filter((item) => item.scheduledDay === day);
  const taken = todaySchedule.filter((item) => item.status === 'taken').length;
  const progressUri = useMemo(() => progressImage(todaySchedule.length ? taken / todaySchedule.length : 0), [todaySchedule.length, taken]);
  const loading = medicationsLoading || recordsLoading;
  const hasError = !!medicationsError || !!recordsError;

  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setNow(new Date()); void refresh(); }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [refresh]);

  function openScanner(medicationId: number, scheduledDay = day) {
    router.push({ pathname: '/verify', params: { medicationId: String(medicationId), scheduledDay } });
  }

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Text style={styles.date}>{now.getMonth() + 1}月{now.getDate()}日（{'日月火水木金土'[now.getDay()]}）</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="薬箱を開く" onPress={() => router.push('/boxes')} style={styles.boxShortcut}><Text style={styles.boxIcon}>▣</Text></Pressable>
      </View>
      <MedicationRegistryStatus />
      {!loading && !hasError && next && countdown && countdown.phase !== 'expired' && <View style={[styles.nextCard, next.due && styles.nextCardDue]}>
        <Text style={styles.nextLabel}>{next.due ? '服用確認を受け付けています' : '次に飲むお薬'}</Text>
        <Text style={styles.nextName}>{next.medication.name}</Text>
        <Text style={styles.nextSchedule}>{next.day === day ? '今日' : `${Number(next.day.slice(5, 7))}月${Number(next.day.slice(8, 10))}日`}　{next.medication.doseTime}</Text>
        <Text style={styles.nextBox}>{nextBox?.name ?? '薬箱未選択'}</Text>
        <Text style={styles.countdown}>
          {countdown.phase === 'until-dose'
            ? `受付開始まであと${formatDoseCountdown(countdown.remainingSeconds, false)}`
            : `課金まであと${formatDoseCountdown(countdown.remainingSeconds, true)}`}
        </Text>
        {next.due && <Pressable accessibilityRole="button" style={styles.primary} onPress={() => openScanner(next.medication.id, next.day)}><Text style={styles.primaryText}>{android ? 'NFCで服用を記録する' : '共通QRで服用を記録する'}</Text></Pressable>}
      </View>}
      {!loading && !hasError && <View style={styles.summary}>
        <View style={styles.progressGroup}>
          <Text style={styles.sectionTitle}>今日の服薬</Text>
          <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: Math.max(1, todaySchedule.length), now: taken }} accessibilityLabel={'今日の服薬、' + todaySchedule.length + '件中' + taken + '件完了'} style={styles.ring}>
            <Image source={{ uri: progressUri }} style={StyleSheet.absoluteFill} />
            <Text style={styles.progressText}>{taken}<Text style={styles.progressTotal}>/{todaySchedule.length}</Text></Text>
          </View>
          <Text style={styles.progressCaption}>{todaySchedule.length > 0 && taken === todaySchedule.length ? '今日の服薬はすべて完了！' : 'できた、を重ねよう。'}</Text>
        </View>
        <View style={styles.bunny}><BunnyArt /></View>
      </View>}
      {!!recordsError && <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{recordsError}</Text><Pressable style={styles.secondary} onPress={() => void refresh()}><Text style={styles.link}>もう一度読み込む</Text></Pressable></View>}
      {!!penaltyError && <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{penaltyError}</Text><Pressable style={styles.secondary} onPress={() => void refreshPenalties()}><Text style={styles.link}>飲み忘れを再確認</Text></Pressable></View>}
      {!!boxesError && <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{boxesError}</Text><Pressable style={styles.secondary} onPress={() => void reload()}><Text style={styles.link}>薬箱を再読み込み</Text></Pressable></View>}
      {!boxesLoading && !boxesError && !boxes.length && <View style={styles.card}>
        <Text style={styles.sectionTitle}>はじめに、薬箱を登録しましょう</Text>
        <Text style={styles.note}>お薬を入れる場所を決めて、毎日の服薬をはじめましょう。</Text>
        <Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push('/boxes/new')}><Text style={styles.primaryText}>＋ 薬箱を登録する</Text></Pressable>
      </View>}
      {!loading && !hasError && !medications.length && boxes.length > 0 && <View style={styles.card}>
        <Text style={styles.sectionTitle}>いつものお薬を登録しましょう</Text><Text style={styles.note}>お薬と服用時間を登録すると、ここに今日の予定が表示されます。</Text>
        <Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push('/medications/new')}><Text style={styles.primaryText}>＋ お薬を登録する</Text></Pressable>
      </View>}
      {!loading && !hasError && schedule.length > 0 && <>
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>服薬予定</Text><Pressable accessibilityRole="button" onPress={() => router.push('/history')} style={styles.historyLink}><Text style={styles.link}>履歴を見る ›</Text></Pressable></View>
        <View style={styles.list}>
          {schedule.map((item) => {
            const isTaken = item.status === 'taken';
            const expired = item.status === 'due' && now.getTime() >= doseDeadline(
              item.scheduledDay, item.medication.doseTime, medicationGraceMinutes(item.medication.graceMinutes),
            ).getTime();
            const canScan = item.status === 'due' && !expired;
            const box = boxes.find((b) => b.medications.some((m) => m.id === item.medication.id));
            const hour = Number(item.medication.doseTime.slice(0, 2));
            return <Pressable key={`${item.medication.id}:${item.scheduledDay}`} accessibilityRole="button" accessibilityLabel={item.medication.doseTime + ' ' + item.medication.name + '、' + (isTaken ? '服用済み' : expired ? '確認期限終了' : canScan ? '服用を記録する' : '服用時間前')} accessibilityState={{ disabled: !canScan }} disabled={!canScan} onPress={() => openScanner(item.medication.id, item.scheduledDay)} style={styles.doseRow}>
              <View style={[styles.timeIcon, hour >= 17 && styles.nightIcon]}><Text style={[styles.sun, hour >= 17 && styles.moon]}>{hour < 17 ? '☀' : '☾'}</Text></View>
              <View style={{ flex: 1, gap: 5 }}><View style={styles.doseHeading}><Text style={styles.doseTime}>{item.scheduledDay !== day ? `${Number(item.scheduledDay.slice(5, 7))}/${Number(item.scheduledDay.slice(8))} ` : ''}{item.medication.doseTime}</Text><Text style={styles.doseName}>{item.medication.name}</Text></View><Text style={styles.doseNote}>{box?.name ?? '薬箱未選択'}{expired ? ' · 確認期限終了' : canScan ? ' · 受付中' : ''}</Text></View>
              <View style={[styles.status, isTaken && styles.statusTaken]}><Text style={[styles.statusText, isTaken && { color: '#fff' }]}>{isTaken ? '✓' : expired ? '!' : ''}</Text></View>
            </Pressable>;
          })}
        </View>
        {android && boxes.some((box) => !box.tagId) && <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push('/boxes')}><Text style={styles.link}>薬箱のNFCタグを登録する ›</Text></Pressable>}
      </>}
    </ScrollView>
    <AppBottomNav />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, date: { color: C.muted, fontSize: 12, fontWeight: '600' },
  content: { padding: 24, paddingTop: 10, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  topRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, note: { fontSize: 12, color: C.muted, lineHeight: 22 },
  boxShortcut: { width: 44, height: 44, backgroundColor: C.pale, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, boxIcon: { color: C.mint, fontSize: 26 },
  nextCard: { padding: 22, gap: 7, borderRadius: 24, backgroundColor: '#fff', borderWidth: 2, borderColor: C.mint },
  nextCardDue: { backgroundColor: C.pale }, nextLabel: { color: C.mint, fontSize: 13, fontWeight: '800' },
  nextName: { color: C.ink, fontSize: 24, lineHeight: 32, fontWeight: '800' }, nextSchedule: { color: C.ink, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  nextBox: { color: C.muted, fontSize: 11 }, countdown: { marginTop: 5, color: C.mint, fontSize: 21, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 12 }, progressGroup: { alignItems: 'center', flex: 1 },
  bunny: { flex: 1, alignItems: 'center', overflow: 'hidden' }, ring: { width: 128, height: 128, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  progressText: { color: C.ink, fontSize: 36, fontWeight: '700' }, progressTotal: { color: C.muted, fontSize: 22, fontWeight: '400' }, progressCaption: { color: C.muted, fontSize: 10, marginTop: 6 },
  card: { borderRadius: 22, padding: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, gap: 10 }, sectionTitle: { color: C.ink, fontSize: 14, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, historyLink: { minHeight: 44, justifyContent: 'center' },
  list: { borderTopWidth: 1, borderColor: C.line }, doseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, gap: 12, borderBottomWidth: 1, borderColor: C.line },
  timeIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff1d9', alignItems: 'center', justifyContent: 'center' }, nightIcon: { backgroundColor: '#efecfc' },
  sun: { color: '#e8ad4c', fontSize: 22 }, moon: { color: '#a29bd6' }, doseHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  doseTime: { color: C.ink, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }, doseName: { color: C.ink, fontSize: 13 }, doseNote: { color: C.muted, fontSize: 10 },
  status: { width: 23, height: 23, borderRadius: 12, borderWidth: 1, borderColor: '#cec4c5', alignItems: 'center', justifyContent: 'center' }, statusTaken: { backgroundColor: '#43b88b', borderColor: '#43b88b' }, statusText: { color: C.mint, fontSize: 14, fontWeight: '700' },
  primary: { minHeight: 50, backgroundColor: C.mint, borderRadius: 26, padding: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' }, secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, link: { color: C.mint, fontSize: 12 }, error: { color: C.error, fontSize: 13, lineHeight: 22 },
});
