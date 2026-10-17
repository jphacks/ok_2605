import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { medicationColors as C } from './medication-screen';

type Props = { value: string; onChange: (value: string) => void; disabled?: boolean };

export function TimeDropdown({ value, onChange, disabled = false }: Props) {
  const [expanded, setExpanded] = useState<'hour' | 'minute' | null>(null);
  const [hour, minute] = value.split(':');

  return (
    <View style={styles.row}>
      {(['hour', 'minute'] as const).map((part) => {
        const selected = part === 'hour' ? hour : minute;
        const unit = part === 'hour' ? '時' : '分';
        const open = expanded === part && !disabled;
        return (
          <View key={part} style={styles.column}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`服用時間の${unit}：${selected}、選択する`}
              accessibilityState={{ expanded: open, disabled }}
              disabled={disabled}
              onPress={() => { Keyboard.dismiss(); setExpanded(open ? null : part); }}
              style={styles.control}>
              <Text style={styles.value}>{selected} {unit}</Text>
              <Text style={styles.arrow}>{open ? '▴' : '▾'}</Text>
            </Pressable>
            {open && (
              <ScrollView style={styles.options} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {Array.from({ length: part === 'hour' ? 24 : 60 }, (_, index) => String(index).padStart(2, '0')).map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: option === selected }}
                    accessibilityLabel={`${option}${unit}`}
                    onPress={() => {
                      onChange(part === 'hour' ? `${option}:${minute}` : `${hour}:${option}`);
                      setExpanded(null);
                    }}
                    style={[styles.option, option === selected && styles.selected]}>
                    <Text style={styles.value}>{option} {unit}{option === selected ? ' ✓' : ''}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  column: { flex: 1 },
  control: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#dce7e6', borderRadius: 12, backgroundColor: '#fff', padding: 13 },
  value: { color: C.ink, fontSize: 16, fontVariant: ['tabular-nums'] },
  arrow: { color: C.muted, fontSize: 14 },
  options: { maxHeight: 192, marginTop: 6, borderWidth: 1, borderColor: '#dce7e6', borderRadius: 12, backgroundColor: '#fff' },
  option: { minHeight: 48, padding: 13, justifyContent: 'center' },
  selected: { backgroundColor: '#dff1ff' },
});
