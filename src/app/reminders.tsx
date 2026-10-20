import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MedicationScreen, medicationColors as C } from '@/components/medication-screen';
import { useReminders } from '@/state/reminder-context';
import { NOTIFICATION_PATTERNS } from '@/features/reminders/reminder-plan';
import { openExactAlarmSettings } from '@/features/reminders/android-reminders';

export default function RemindersScreen() {
  const { message, error, busy, exactAlarmAllowed, enable, refresh, sendDemo } = useReminders();
  const [settingsError, setSettingsError] = useState('');
  return <MedicationScreen title="服薬リマインダー" description="いつもの時間に、おくすりのお知らせ。" backTo="/explore">
    <View style={styles.card}>
      <Text style={styles.heading}>服用10分前・服用時刻・期限10分前・期限超過を通知</Text>
      <Text style={styles.text}>服用期限は服用時刻＋設定した猶予時間です。4種類すべてを事前予約し、アプリを閉じていてもお知らせします。服薬を記録すると、その予定の未送信通知を取り消し、表示済みの服薬リマインダーも消します。同じ期限のお薬はまとめて期限超過をお知らせします。</Text>
      <Text accessibilityLiveRegion="polite" style={styles.text}>{busy ? '通知を設定中…' : message}</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={() => void enable()}><Text style={styles.buttonText}>通知を許可する</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => void refresh()}><Text style={styles.text}>通知の予約を再確認する</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { void Linking.openSettings().catch(() => setSettingsError('設定を開けませんでした。端末の設定アプリから通知を確認してください。')); }}><Text style={styles.text}>端末の通知設定を開く</Text></Pressable>
      {Platform.OS === 'android' && <>
        <Text style={styles.text}>アラームとリマインダー：{exactAlarmAllowed === null ? '確認中' : exactAlarmAllowed ? '許可済み' : '未許可（通知が遅れる場合があります）'}</Text>
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { void openExactAlarmSettings().catch(() => setSettingsError('設定を開けませんでした。端末の設定から「アラームとリマインダー」を許可してください。')); }}><Text style={styles.text}>アラームとリマインダーの設定を開く</Text></Pressable>
      </>}
      {!!settingsError && <Text style={styles.error}>{settingsError}</Text>}
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>デモ通知</Text>
      <Text style={styles.text}>薬が未登録でも、いつでも各パターンを試せます。通知の表示だけを行い、服薬記録や決済は変更しません。</Text>
      {NOTIFICATION_PATTERNS.map((pattern) => <Pressable key={pattern.value} accessibilityRole="button" disabled={busy} style={[styles.secondary, busy && styles.disabled]} onPress={() => void sendDemo(pattern.value)}><Text style={styles.text}>{pattern.label}の通知を送る</Text></Pressable>)}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={() => void sendDemo('all')}><Text style={styles.buttonText}>4種類すべて送る</Text></Pressable>
    </View>
    <Text style={styles.note}>通知は約7日先まで、最大60件を予約し、アプリを開いた際に補充します。定期的にアプリを開いてください。Android・iOSともに、期限には「服用期限を過ぎました。次回起動時にテスト決済を処理します」と通知します。通知時には決済せず、アプリの起動・復帰時や表示中に服薬記録を再確認し、未服用の予定だけテスト決済を記録します。実際の請求はありません。</Text>
    <Text style={styles.note}>通知には薬名が表示されます。プレビュー・通知音・通知の停止は端末の設定で変更できます。省電力・集中モード等によって表示が遅れる場合があります。Androidの「アラームとリマインダー」は時刻の正確さのための任意設定で、通常の通知に必須ではありません。</Text>
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
