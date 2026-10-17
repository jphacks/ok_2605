import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBottomNav } from './app-bottom-nav';

export const medicationColors = {
  background: '#f4f9f8',
  ink: '#263e48',
  muted: '#72848a',
  mint: '#36b7aa',
  pale: '#eef4f3',
  line: '#e5eeed',
  error: '#aa353c',
};

type MedicationScreenProps = PropsWithChildren<{
  title: string;
  description: string;
  backTo?: '/' | '/medications' | '/explore';
  busy?: boolean;
}>;

export function MedicationScreen({ title, description, backTo = '/', busy = false, children }: MedicationScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="前の画面に戻る"
            disabled={busy}
            onPress={() => router.canGoBack() ? router.back() : router.replace(backTo)}
            style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <View style={styles.headerSpace} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Text style={styles.description}>{description}</Text>
          <View style={styles.body}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      <AppBottomNav disabled={busy} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: medicationColors.background },
  content: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24 },
  header: { minHeight: 48, backgroundColor: '#f3fafb', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpace: { width: 44 },
  back: { minHeight: 44, width: 44, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 28, color: medicationColors.ink },
  title: { flex: 1, textAlign: 'center', fontSize: 13, color: medicationColors.ink, fontWeight: '600' },
  description: { color: medicationColors.muted, fontSize: 12, lineHeight: 23, marginTop: 12 },
  body: { marginTop: 22, gap: 16 },
});
