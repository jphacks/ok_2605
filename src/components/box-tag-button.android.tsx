import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { getMedicationDatabase } from '@/features/medications/database';
import { setMedicineBoxTag } from '@/features/boxes/medicine-box-repository';
import { inTransaction } from '@/features/medications/transaction';
import { readNfcTag } from '@/features/nfc/nfc-reader.android';
import { useNfcBox } from '@/state/nfc-box-context';
import { medicationColors as C } from './medication-screen';

export function BoxTagButton({ boxId, registered }: { boxId: number; registered: boolean }) {
  const { reload } = useNfcBox();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  useFocusEffect(useCallback(() => {
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); };
  }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') controller.current?.abort(); });
    return () => subscription.remove();
  }, []);
  async function scan() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true); setError(''); setMessage('薬箱のNFCタグにスマホの背面を近づけてください。');
    try {
      const tag = await readNfcTag(request.signal);
      await inTransaction(await getMedicationDatabase(), async (db) => {
        if (request.signal.aborted) throw new Error('読み取りを中止しました。');
        await setMedicineBoxTag(db, boxId, tag);
        if (request.signal.aborted) throw new Error('読み取りを中止しました。');
      });
      if (active.current) setMessage('NFCタグを登録しました！');
      await reload();
    } catch (cause) {
      if (active.current) { setMessage(''); setError(cause instanceof Error ? cause.message : 'NFCタグを登録できませんでした。'); }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }
  return <View style={{ gap: 12 }}>
    <Stack.Screen options={{ gestureEnabled: !busy }} />
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void scan()} style={{ backgroundColor: C.mint, padding: 16, borderRadius: 24, minHeight: 48, opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>{registered ? 'NFCタグを変更する' : 'NFCタグを登録する'}</Text>
    </Pressable>
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: C.muted, lineHeight: 22 }}>{message}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: C.error, lineHeight: 22 }}>{error}</Text>}
    {busy && <Pressable accessibilityRole="button" style={{ padding: 16 }} onPress={() => controller.current?.abort()}><Text style={{ textAlign: 'center', color: C.ink }}>読み取りを中止</Text></Pressable>}
  </View>;
}
