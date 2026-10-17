import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const tabs = [
  { title: 'ホーム', icon: '⌂', href: '/' },
  { title: '履歴', icon: '▥', href: null },
  { title: 'お薬', icon: '▤', href: '/medications' },
  { title: '設定', icon: '⚙', href: '/explore' },
] as const;

export function AppBottomNav({ disabled = false }: { disabled?: boolean }) {
  const pathname = usePathname();
  return (
    <View style={styles.nav}>
      {tabs.map((tab) => {
        const selected = tab.href === '/medications' ? pathname.startsWith('/medications') : pathname === tab.href;
        return (
          <Pressable
            key={tab.title}
            accessibilityRole="tab"
            accessibilityLabel={tab.href ? tab.title : '履歴（準備中）'}
            accessibilityState={{ selected, disabled: disabled || !tab.href }}
            disabled={disabled || !tab.href}
            onPress={() => { if (tab.href) router.dismissTo(tab.href); }}
            style={[styles.tab, selected && styles.selected]}>
            <Text style={[styles.icon, selected && styles.active]}>{tab.icon}</Text>
            <Text style={[styles.label, selected && styles.active]}>{tab.title}{!tab.href ? '（準備中）' : ''}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5eeed', paddingHorizontal: 8, paddingTop: 7, paddingBottom: 3, minHeight: 69 },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10 },
  selected: { backgroundColor: '#f3faf9' },
  icon: { color: '#8b999d', fontSize: 22 },
  label: { color: '#8b999d', fontSize: 9 },
  active: { color: '#338fa4' },
});
