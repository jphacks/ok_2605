import { router, useFocusEffect } from 'expo-router';
import { useCallback, type PropsWithChildren } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBottomNav } from './app-bottom-nav';

export const medicationColors = {
  background: '#fff9f6',
  ink: '#3b3439',
  muted: '#93858a',
  mint: '#f56889',
  pale: '#fff0f2',
  line: '#f2e4e4',
  error: '#aa353c',
};

type MedicationScreenProps = PropsWithChildren<{
  title: string;
  description: string;
  backTo?: '/' | '/medications' | '/explore' | '/boxes';
  busy?: boolean;
  hideNavigation?: boolean;
}>;

export function MedicationScreen({ title, description, backTo = '/', busy = false, hideNavigation = false, children }: MedicationScreenProps) {
  useFocusEffect(useCallback(() => {
    if (!hideNavigation) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [hideNavigation]));
  return (
    <SafeAreaView edges={hideNavigation ? undefined : ['top', 'left', 'right']} style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          {hideNavigation ? <View style={styles.headerSpace} /> : <Pressable
            accessibilityRole="button"
            accessibilityLabel="前の画面に戻る"
            disabled={busy}
            onPress={() => router.canGoBack() ? router.back() : router.replace(backTo)}
            style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>}
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <View style={styles.headerSpace} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Text style={styles.description}>{description}</Text>
          <View style={styles.body}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      {!hideNavigation && <AppBottomNav disabled={busy} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: medicationColors.background },
  content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { minHeight: 54, backgroundColor: medicationColors.background, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpace: { width: 44 },
  back: { minHeight: 44, width: 44, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 28, color: medicationColors.ink },
  title: { flex: 1, textAlign: 'center', fontSize: 16, color: medicationColors.ink, fontWeight: '700' },
  description: { color: medicationColors.muted, fontSize: 12, lineHeight: 23, marginTop: 12 },
  body: { marginTop: 22, gap: 16 },
});
