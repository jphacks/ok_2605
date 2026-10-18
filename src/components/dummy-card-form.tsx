import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DUMMY_CARDS, type DummyCardId } from '@/features/payments/payment-setup-repository';
import { usePaymentSetup } from '@/state/payment-setup-context';
import { MedicationScreen, medicationColors as C } from './medication-screen';

export function DummyCardForm({ onboarding = false }: { onboarding?: boolean }) {
  const { setup, saveCard } = usePaymentSetup();
  const [presetId, setPresetId] = useState<DummyCardId>(setup?.card?.presetId ?? DUMMY_CARDS[0].id);
  const [nickname, setNickname] = useState(setup?.card?.nickname ?? '服薬デモ用カード');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  const selected = DUMMY_CARDS.find((card) => card.id === presetId)!;
  async function save() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); Keyboard.dismiss();
    try {
      await saveCard(presetId, nickname, onboarding);
      // The root coordinator opens Home (or an outstanding penalty notice) after completion.
      if (!onboarding) setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'カードを保存できませんでした。もう一度お試しください。'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <MedicationScreen title={onboarding ? 'ダミーカードの登録' : 'クレジットカード設定'} description={onboarding ? '2 / 2 ダミーカードの登録 — 完了するとホームに進みます。お薬は後から追加できます。' : '登録したダミーカードを確認・変更できます。'} backTo="/explore" busy={busy} hideNavigation={onboarding}>
    <Stack.Screen options={{ gestureEnabled: !busy && !onboarding }} />
    <Text style={styles.notice}>デモ専用の架空のカードです。実際の請求はありません。実在するカード番号やセキュリティコードを入力する必要はありません。</Text>
    <View style={styles.card}>
      <Text style={styles.demo}>DEMO CARD</Text>
      <Text style={styles.brand}>{selected.brand}</Text>
      <Text style={styles.number}>{selected.number}</Text>
      <View style={styles.row}><Text style={styles.cardCopy}>NOMUPAY DEMO</Text><Text style={styles.cardCopy}>有効期限 {selected.expiry}</Text></View>
    </View>
    <Text style={styles.label}>使用するダミーカード</Text>
    {DUMMY_CARDS.map((card) => <Pressable key={card.id} accessibilityRole="radio" accessibilityState={{ checked: presetId === card.id, disabled: busy }} disabled={busy} onPress={() => { setPresetId(card.id); setSaved(false); }} style={[styles.option, presetId === card.id && styles.selected]}>
      <Text style={styles.label}>{card.brand}　•••• {card.last4}</Text><Text style={styles.check}>{presetId === card.id ? '●' : '○'}</Text>
    </Pressable>)}
    <Text style={styles.label}>カードの表示名</Text>
    <TextInput accessibilityLabel="ダミーカードの表示名" value={nickname} onChangeText={(value) => { setNickname(value); setSaved(false); }} editable={!busy} maxLength={40} style={styles.input} placeholder="例）服薬デモ用カード" placeholderTextColor={C.muted} />
    <Text style={styles.note}>猶予を過ぎて服用記録がない予定は、薬に設定した金額でテスト決済を記録します。登録後のカードの変更は設定から行えます。</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {saved && <Text accessibilityLiveRegion="polite" style={styles.label}>カードを変更しました。</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !nickname.trim(), busy }} disabled={busy || !nickname.trim()} onPress={() => void save()} style={[styles.button, (busy || !nickname.trim()) && styles.disabled]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{onboarding ? '登録を完了してホームへ' : '変更を保存'}</Text>}
    </Pressable>
  </MedicationScreen>;
}
const styles = StyleSheet.create({
  notice: { backgroundColor: C.pale, padding: 16, borderRadius: 16, fontSize: 12, lineHeight: 23, color: C.ink },
  card: { backgroundColor: '#675474', padding: 24, borderRadius: 20, gap: 20 }, demo: { color: '#f6d8e4', letterSpacing: 2, fontSize: 11 },
  brand: { color: '#fff', fontSize: 24, fontWeight: '700' }, number: { color: '#fff', fontSize: 19, letterSpacing: 1 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, cardCopy: { color: '#f6e5ef', fontSize: 10 },
  label: { color: C.ink, fontSize: 14, fontWeight: '600' }, option: { minHeight: 56, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selected: { borderColor: C.mint, backgroundColor: C.pale }, check: { color: C.mint },
  input: { minHeight: 52, padding: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, color: C.ink }, note: { color: C.muted, fontSize: 12, lineHeight: 23 }, error: { color: C.error, fontSize: 13, lineHeight: 23 },
  button: { minHeight: 52, backgroundColor: C.mint, borderRadius: 26, padding: 16, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#fff', fontWeight: '700' }, disabled: { opacity: 0.5 },
});
