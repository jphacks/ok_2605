import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { monthCalendarDays } from '@/features/medications/medication-history';
import { isLocalDay } from '@/features/medications/dose-record';
import { medicationColors as C } from './medication-screen';

type Props = {
  visible: boolean;
  title: string;
  value: string;
  minimumDay?: string;
  onClose: () => void;
  onSelect: (day: string) => void;
};

function parts(day: string) {
  const safe = isLocalDay(day) ? day : '2000-01-01';
  const [year, month, date] = safe.split('-').map(Number);
  return { year, month: month - 1, date };
}

export function DateCalendarModal({ visible, title, value, minimumDay, onClose, onSelect }: Props) {
  const selected = parts(value);
  const [visibleMonth, setVisibleMonth] = useState({ year: selected.year, month: selected.month });
  const cells = monthCalendarDays(visibleMonth.year, visibleMonth.month);

  const moveMonth = (amount: number) => {
    const next = new Date(visibleMonth.year, visibleMonth.month + amount, 1, 12);
    setVisibleMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <Pressable accessibilityLabel="カレンダーを閉じる" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.dialog}>
          <View style={styles.headingRow}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
          </View>
          <View style={styles.monthHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="前の月" onPress={() => moveMonth(-1)} style={styles.monthButton}><Text style={styles.arrow}>‹</Text></Pressable>
            <Text style={styles.monthTitle}>{visibleMonth.year}年 {visibleMonth.month + 1}月</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="次の月" onPress={() => moveMonth(1)} style={styles.monthButton}><Text style={styles.arrow}>›</Text></Pressable>
          </View>
          <View style={styles.weekRow}>
            {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
              <Text key={day} style={[styles.weekday, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{day}</Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((day, index) => {
              if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
              const date = Number(day.slice(-2));
              const disabled = !!minimumDay && day < minimumDay;
              const chosen = day === value;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={`${visibleMonth.month + 1}月${date}日`}
                  accessibilityState={{ selected: chosen, disabled }}
                  disabled={disabled}
                  onPress={() => onSelect(day)}
                  style={[styles.dayCell, chosen && styles.selected]}>
                  <Text style={[styles.dayText, disabled && styles.disabledText, chosen && styles.selectedText]}>{date}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(20, 40, 44, 0.45)' },
  dialog: { borderRadius: 20, padding: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: C.ink, fontSize: 17, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: C.muted, fontSize: 28 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: C.ink, fontSize: 28 },
  monthTitle: { color: C.ink, fontSize: 16, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekday: { width: '14.2857%', paddingVertical: 8, textAlign: 'center', color: C.muted, fontSize: 11 },
  sunday: { color: '#d36c64' },
  saturday: { color: '#4f83b7' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: C.mint },
  dayText: { color: C.ink, fontSize: 14 },
  selectedText: { color: '#fff', fontWeight: '800' },
  disabledText: { color: '#c8d0d0' },
});
