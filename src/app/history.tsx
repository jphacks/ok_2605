import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { getMedicationDatabase } from '@/features/medications/database';
import { localDay, scheduledDate, type DoseRecord } from '@/features/medications/dose-record';
import { listDoseRecordsBetween } from '@/features/medications/dose-record-repository';
import { buildHistoryDay, monthCalendarDays, monthRange, type HistoryDayStatus } from '@/features/medications/medication-history';
import { listMedicationSchedules, type HistoricalMedication } from '@/features/medications/medication-lifecycle';
import { useMedicationRegistry } from '@/state/medication-registry-context';
import { usePenalties } from '@/state/penalty-context';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const statusLabel: Record<HistoryDayStatus, string> = {
  none: '予定なし',
  future: '予定',
  pending: '進行中',
  complete: '完了',
  missed: '未服用あり',
};

export default function HistoryScreen() {
  const [now, setNow] = useState(() => new Date());
  const today = localDay(now);
  const { isLoading: medicationsLoading, loadError: medicationsError } = useMedicationRegistry();
  const { payments } = usePenalties();
  const [visibleMonth, setVisibleMonth] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() }));
  const [selectedDay, setSelectedDay] = useState(today);
  const [medications, setMedications] = useState<HistoricalMedication[]>([]);
  const [records, setRecords] = useState<DoseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const range = useMemo(() => monthRange(visibleMonth.year, visibleMonth.month), [visibleMonth]);
  const calendarDays = useMemo(() => monthCalendarDays(visibleMonth.year, visibleMonth.month), [visibleMonth]);

  const loadRecords = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const database = await getMedicationDatabase();
      const [savedRecords, schedules] = await Promise.all([
        listDoseRecordsBetween(database, range.firstDay, range.lastDay), listMedicationSchedules(database),
      ]);
      if (version === requestVersion.current) { setRecords(savedRecords); setMedications(schedules); setNow(new Date()); }
    } catch {
      if (version === requestVersion.current) setError('服薬履歴を読み込めませんでした。もう一度お試しください。');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [range.firstDay, range.lastDay]);

  useFocusEffect(useCallback(() => {
    void loadRecords();
    return () => { requestVersion.current += 1; };
  }, [loadRecords]));

  const historyByDay = useMemo(() => new Map(calendarDays.flatMap((day) => (
    day ? [[day, buildHistoryDay(day, medications, records, today, payments)] as const] : []
  ))), [calendarDays, medications, records, today, payments]);
  const selected = historyByDay.get(selectedDay) ?? buildHistoryDay(selectedDay, medications, records, today, payments);

  const changeMonth = (offset: number) => {
    const date = new Date(visibleMonth.year, visibleMonth.month + offset, 1, 12);
    const next = { year: date.getFullYear(), month: date.getMonth() };
    const nextRange = monthRange(next.year, next.month);
    setVisibleMonth(next);
    setSelectedDay(today >= nextRange.firstDay && today <= nextRange.lastDay ? today : nextRange.firstDay);
  };

  const formatTakenTime = (takenAt: string) => new Date(takenAt).toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return (
    <MedicationScreen title="服薬履歴" description="日ごとの服薬状況をカレンダーで確認できます。">
      <View style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="前の月" style={styles.monthButton} onPress={() => changeMonth(-1)}>
            <Text style={styles.monthArrow}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{visibleMonth.year}年 {visibleMonth.month + 1}月</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="次の月" style={styles.monthButton} onPress={() => changeMonth(1)}>
            <Text style={styles.monthArrow}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((weekday, index) => <Text key={weekday} style={[styles.weekday, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{weekday}</Text>)}
        </View>
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, index) => {
            if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
            const history = historyByDay.get(day);
            const selectedCell = day === selectedDay;
            const dayNumber = Number(day.slice(-2));
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={`${visibleMonth.month + 1}月${dayNumber}日、${history ? statusLabel[history.status] : ''}`}
                accessibilityState={{ selected: selectedCell }}
                onPress={() => setSelectedDay(day)}
                style={[styles.dayCell, selectedCell && styles.selectedDay]}>
                <Text style={[styles.dayNumber, day === today && styles.todayText]}>{dayNumber}</Text>
                {history?.status === 'complete' && <Text style={[styles.marker, styles.complete]}>✓</Text>}
                {history?.status === 'missed' && <Text style={[styles.marker, styles.missed]}>!</Text>}
                {history?.status === 'pending' && <Text style={[styles.marker, styles.pending]}>·</Text>}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legend}>
          <Text style={styles.legendText}><Text style={styles.complete}>●</Text> 完了</Text>
          <Text style={styles.legendText}><Text style={styles.missed}>●</Text> 未服用あり</Text>
          <Text style={styles.legendText}><Text style={styles.pending}>●</Text> 進行中</Text>
        </View>
      </View>

      {(loading || medicationsLoading) && <ActivityIndicator color={C.mint} />}
      {(error || medicationsError) && (
        <View style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.error}>{error ?? medicationsError}</Text>
          <Pressable accessibilityRole="button" style={styles.retry} onPress={() => void loadRecords()}><Text style={styles.retryText}>再読み込み</Text></Pressable>
        </View>
      )}

      {!loading && !medicationsLoading && !error && !medicationsError && (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>{Number(selectedDay.slice(5, 7))}月{Number(selectedDay.slice(8, 10))}日</Text>
            <Text style={[styles.badge, selected.status === 'complete' && styles.completeBadge, selected.status === 'missed' && styles.missedBadge]}>
              {statusLabel[selected.status]}
            </Text>
          </View>
          {selected.entries.length === 0 ? (
            <Text style={styles.note}>この日に登録されていた薬はありません。</Text>
          ) : selected.entries.map(({ medication, record }) => {
            const scheduledAt = scheduledDate(selectedDay, medication.doseTime);
            const penalty = payments.find((payment) => payment.medicationId === medication.id && payment.scheduledDay === selectedDay);
            const missed = selectedDay < today && !record;
            const dueToday = selectedDay === today && scheduledAt.getTime() <= now.getTime() && !record;
            return (
              <View key={medication.id} style={styles.historyRow}>
                <View style={styles.historyInfo}>
                  <Text style={styles.medicationTime}>{medication.doseTime}</Text>
                  <Text style={styles.medicationName}>{medication.name}</Text>
                </View>
                <Text style={[styles.recordStatus, (missed || dueToday || !!penalty) && styles.missed]}>
                  {penalty ? `飲み忘れ\n${penalty.amount.toLocaleString()}円・${penalty.status === 'succeeded' ? 'テスト決済済み' : '決済失敗'}` : record ? `服用 ${formatTakenTime(record.takenAt)}${record.source === 'nfc' ? '（NFC）' : ''}` : missed || dueToday ? '未服用' : '予定'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </MedicationScreen>
  );
}

const styles = StyleSheet.create({
  calendarCard: { backgroundColor: '#fff', borderRadius: 20, padding: 14, borderWidth: 1, borderColor: C.line },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.pale },
  monthArrow: { fontSize: 28, color: C.ink },
  monthTitle: { color: C.ink, fontSize: 16, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekday: { width: '14.2857%', textAlign: 'center', color: C.muted, fontSize: 11, paddingVertical: 8 },
  sunday: { color: '#d36c64' },
  saturday: { color: '#4f83b7' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  selectedDay: { backgroundColor: C.pale },
  dayNumber: { color: C.ink, fontSize: 13 },
  todayText: { color: C.mint, fontWeight: '800' },
  marker: { fontSize: 12, fontWeight: '800', height: 15 },
  complete: { color: C.mint },
  missed: { color: '#d9655c' },
  pending: { color: '#d89a35' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 12 },
  legendText: { color: C.muted, fontSize: 11 },
  detailCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  detailTitle: { color: C.ink, fontSize: 17, fontWeight: '700' },
  badge: { color: C.muted, backgroundColor: C.pale, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, fontSize: 11 },
  completeBadge: { color: '#267f73', backgroundColor: '#e4f7f2' },
  missedBadge: { color: '#a8423c', backgroundColor: '#fff0ed' },
  historyRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 14 },
  historyInfo: { flex: 1 },
  medicationTime: { color: C.mint, fontSize: 13, fontWeight: '700' },
  medicationName: { color: C.ink, fontSize: 14, marginTop: 3 },
  recordStatus: { color: C.muted, fontSize: 12 },
  note: { color: C.muted, fontSize: 13, lineHeight: 22, paddingVertical: 12 },
  errorCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12 },
  error: { color: C.error, fontSize: 13, lineHeight: 21 },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.pale },
  retryText: { color: C.mint, fontWeight: '600' },
});
