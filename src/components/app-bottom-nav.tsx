import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const tabs = [
  { title: 'ホーム', icon: '⌂', href: '/' },
  { title: '履歴', icon: '▥', href: '/history' },
  { title: 'お薬', icon: '▤', href: '/medications' },
  { title: '薬箱', icon: '▣', href: '/boxes' },
  { title: '設定', icon: '⚙', href: '/explore' },
] as const;

export function AppBottomNav({ disabled = false }: { disabled?: boolean }) {
  const pathname = usePathname();
  return (
    <View style={styles.nav}>
      {tabs.map((tab) => {
        const selected = tab.href === '/medications' || tab.href === '/boxes' ? pathname.startsWith(tab.href) : pathname === tab.href || (tab.href === '/explore' && ['/payments', '/penalties', '/reminders'].includes(pathname));
        return (
          <Pressable
            key={tab.title}
            accessibilityRole="tab"
            accessibilityLabel={tab.title}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => router.dismissTo(tab.href)}
            style={[styles.tab, selected && styles.selected]}>
            <Text style={[styles.icon, selected && styles.active]}>{tab.icon}</Text>
            <Text style={[styles.label, selected && styles.active]}>{tab.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', backgroundColor: '#fffdfa', borderTopWidth: 1, borderTopColor: '#f2e4e4', paddingHorizontal: 8, paddingTop: 7, paddingBottom: 3, minHeight: 69 },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10 },
  selected: { backgroundColor: '#fff0f2' },
  icon: { color: '#8b999d', fontSize: 22 },
  label: { color: '#8b999d', fontSize: 9 },
  active: { color: '#f56889' },
});
