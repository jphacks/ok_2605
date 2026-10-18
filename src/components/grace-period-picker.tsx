import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GRACE_MINUTE_OPTIONS } from '@/features/medications/grace-period';
import { medicationColors as C } from './medication-screen';

function label(minutes: number) {
  return minutes === 60 ? '1時間' : `${minutes}分`;
}

export function GracePeriodPicker({ value, onChange, disabled = false }: {
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = expanded && !disabled;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`執行猶予時間：${label(value)}、選択する`}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setExpanded(!open)}
        style={styles.control}>
        <Text style={styles.value}>{label(value)}</Text>
        <Text style={styles.arrow}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <ScrollView style={styles.options} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {GRACE_MINUTE_OPTIONS.map((minutes) => (
            <Pressable
              key={minutes}
              accessibilityRole="button"
              accessibilityState={{ selected: value === minutes }}
              onPress={() => { onChange(minutes); setExpanded(false); }}
              style={[styles.option, value === minutes && styles.selected]}>
              <Text style={styles.optionText}>{label(minutes)}{value === minutes ? ' ✓' : ''}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  control: { minHeight: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { color: C.ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  arrow: { color: C.muted, fontSize: 14 },
  options: { maxHeight: 220, marginTop: 6, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: '#fff' },
  option: { minHeight: 46, paddingHorizontal: 14, justifyContent: 'center' },
  selected: { backgroundColor: C.pale },
  optionText: { color: C.ink, fontSize: 14 },
});
