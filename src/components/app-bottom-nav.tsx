import { router, useFocusEffect, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MedicineBoxIcon } from './medicine-box-icon';

const tabs = [
  { title: 'ホーム', icon: require('../../assets/images/navigation/home.png'), href: '/' },
  { title: '履歴', icon: require('../../assets/images/navigation/calendar.png'), href: '/history' },
  { title: 'お薬', icon: require('../../assets/images/navigation/medicine.png'), href: '/medications' },
  { title: '薬箱', icon: require('../../assets/images/navigation/medicine-box.png'), href: '/boxes' },
  { title: '設定', icon: require('../../assets/images/navigation/settings.png'), href: '/explore' },
] as const;

type TabHref = typeof tabs[number]['href'];
type Animation = 'slide_from_left' | 'slide_from_right';
function tabIndex(path: string) {
  return tabs.findIndex((tab) => tab.href === '/medications' || tab.href === '/boxes'
    ? path === tab.href || path.startsWith(`${tab.href}/`)
    : path === tab.href || (tab.href === '/explore' && ['/payments', '/penalties', '/reminders', '/payment-card'].includes(path)));
}
const NavigationContext = createContext<{
  disabled: boolean; setDisabled: (value: boolean) => void;
  animation: Animation; visible: boolean; navigate: (href: TabHref) => void;
} | null>(null);

export function TabNavigationProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [disabled, setDisabled] = useState(false);
  const [transition, setTransition] = useState<{ href: TabHref; animation: Animation } | null>(null);
  // Commit screen options before dispatching a replacement; stack history must
  // not determine the direction of a tab selection.
  useEffect(() => {
    if (transition) router.replace(transition.href);
  }, [transition]);
  function navigate(href: TabHref) {
    if (disabled || href === pathname) return;
    setTransition({ href, animation: tabIndex(href) < tabIndex(pathname) ? 'slide_from_left' : 'slide_from_right' });
  }
  return <NavigationContext.Provider value={{ disabled, setDisabled, animation: transition?.animation ?? 'slide_from_right', visible: tabIndex(pathname) >= 0, navigate }}>{children}</NavigationContext.Provider>;
}

export function useTabNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('TabNavigationProvider is required');
  return value;
}

// Existing screens register their save lock here; the footer itself is rendered
// once beside the navigator so it remains stationary during transitions.
export function AppBottomNav({ disabled = false }: { disabled?: boolean }) {
  const { setDisabled } = useTabNavigation();
  useFocusEffect(useCallback(() => {
    setDisabled(disabled);
    return () => setDisabled(false);
  }, [disabled, setDisabled]));
  return null;
}

export function FixedBottomNav() {
  const { disabled, navigate } = useTabNavigation();
  const pathname = usePathname();
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safe}>
    <View style={styles.nav}>
      {tabs.map((tab, index) => {
        const selected = tabIndex(pathname) === index;
        return (
          <Pressable
            key={tab.title}
            accessibilityRole="tab"
            accessibilityLabel={tab.title}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => navigate(tab.href)}
            style={[styles.tab, selected && styles.selected]}>
            {tab.title === '薬箱'
              ? <View style={[styles.icon, !selected && styles.iconInactive]}><MedicineBoxIcon size={25} /></View>
              : <Image source={tab.icon} contentFit="contain" style={[styles.icon, !selected && styles.iconInactive]} />}
            <Text style={[styles.label, selected && styles.active]}>{tab.title}</Text>
          </Pressable>
        );
      })}
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: '#fffdfa' },
  nav: { flexDirection: 'row', backgroundColor: '#fffdfa', borderTopWidth: 1, borderTopColor: '#f2e4e4', paddingHorizontal: 8, paddingTop: 7, paddingBottom: 3, minHeight: 69 },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10 },
  selected: { backgroundColor: '#fff0f2' },
  icon: { width: 25, height: 25 },
  iconInactive: { opacity: 0.48 },
  label: { color: '#8b999d', fontSize: 9 },
  active: { color: '#f56889' },
});
