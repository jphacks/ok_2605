import { router, Stack, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePaymentSetup } from '@/state/payment-setup-context';
import { usePenalties } from '@/state/penalty-context';
import { medicationColors as C } from './medication-screen';

// One coordinator owns redirects so onboarding and overdue notices cannot compete.
export function AppNavigation() {
  const { setup, loading, error, refresh } = usePaymentSetup();
  const { pending, loading: penaltiesLoading } = usePenalties();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const initialLoading = loading || !setup || (setup.step === 'complete' && penaltiesLoading);
  const target = !setup ? null : setup.step !== 'complete' ? '/onboarding'
    : pending.length ? '/missed' : pathname === '/onboarding' ? '/' : null;
  useEffect(() => {
    if (navigation?.key && !initialLoading && !error && target && pathname !== target) router.replace(target);
  }, [navigation?.key, initialLoading, error, target, pathname]);
  const blocked = !!error || initialLoading || (target !== null && pathname !== target);
  return <View style={styles.container}>
    <Stack screenOptions={{ headerShown: false }} />
    {blocked && <SafeAreaView style={styles.overlay}>
      {error ? <>
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.button}><Text style={styles.buttonText}>再読み込み</Text></Pressable>
      </> : <><ActivityIndicator color={C.mint} /><Text style={styles.note}>登録内容と服薬状況を確認しています…</Text></>}
    </SafeAreaView>}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 20 },
  note: { color: C.muted, fontSize: 13 }, error: { color: C.error, lineHeight: 23, textAlign: 'center' },
  button: { backgroundColor: C.mint, padding: 16, borderRadius: 20, minHeight: 48 }, buttonText: { color: '#fff', fontWeight: '700' },
});
