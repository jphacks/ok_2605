import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { useReminders } from '@/state/reminder-context';

export default function RemindersScreen() {
  const { message, error, busy, enable, refresh } = useReminders();
  const [settingsError, setSettingsError] = useState('');
  return <MedicationScreen title="服薬リマインダー" description="いつもの時間に、おくすりのお知らせ。" backTo="/explore">
    <View style={styles.card}>
      <Text style={styles.heading}>毎日の服用時間に通知</Text>
      <Text style={styles.text}>登録したお薬の名前と服用時刻を通知します。通知をタップすると、そのお薬の服用確認画面を直接開きます。</Text>
      <Text accessibilityLiveRegion="polite" style={styles.text}>{busy ? '通知を設定中…' : message}</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={() => void enable()}><Text style={styles.buttonText}>通知を許可する</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => void refresh()}><Text style={styles.text}>通知の予約を再確認する</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { void Linking.openSettings().catch(() => setSettingsError('設定を開けませんでした。端末の設定アプリから通知を確認してください。')); }}><Text style={styles.text}>端末の通知設定を開く</Text></Pressable>
      {!!settingsError && <Text style={styles.error}>{settingsError}</Text>}
    </View>
    <Text style={styles.note}>通知には薬名が表示されます。プレビュー・通知音・通知の停止は端末の設定で変更できます。省電力・集中モード等によって表示が遅れる場合があります。Androidで正確な時刻に通知するには、設定の「アラームとリマインダー」も許可してください。</Text>
  </MedicationScreen>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 16 },
  heading: { color: C.ink, fontSize: 16, fontWeight: '600' },
  text: { color: C.ink, fontSize: 13, lineHeight: 23 },
  note: { color: C.muted, fontSize: 12, lineHeight: 22 },
  error: { color: C.error, fontSize: 13, lineHeight: 22 },
  button: { minHeight: 48, backgroundColor: C.mint, borderRadius: 14, padding: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  secondary: { minHeight: 44, borderRadius: 14, padding: 12, backgroundColor: C.pale, alignItems: 'center' },
  disabled: { opacity: 0.5 },
});
