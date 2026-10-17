import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { getMedicationDatabase } from '@/features/medications/database';
import { loadNfcBox, type NfcBoxSnapshot } from '@/features/nfc/nfc-box-repository';
import { useMedicationRegistry } from './medication-registry-context';

type NfcBoxState = NfcBoxSnapshot & {
  loading: boolean;
  error: string | null;
  now: Date;
  reload: () => Promise<void>;
};
const Context = createContext<NfcBoxState | null>(null);

export function NfcBoxProvider({ children }: PropsWithChildren) {
  const { medications, isLoading, loadError } = useMedicationRegistry();
  const [snapshot, setSnapshot] = useState<NfcBoxSnapshot>({ box: null, records: [] });
  const [loading, setLoading] = useState(Platform.OS === 'android');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const version = useRef(0);
  const reload = useCallback((): Promise<void> => {
    if (Platform.OS !== 'android') return Promise.resolve();
    const request = ++version.current;
    const date = new Date();
    return getMedicationDatabase().then((db) => loadNfcBox(db, date)).then((result) => {
      if (request === version.current) { setSnapshot(result); setNow(date); setError(null); }
    }, () => {
      if (request === version.current) setError('薬箱の登録・服用記録を読み込めませんでした。再読み込みしてください。');
    }).finally(() => {
      if (request === version.current) setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || isLoading || loadError) return;
    void reload();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void reload(); }, 30000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void reload(); });
    return () => { clearInterval(timer); subscription.remove(); version.current += 1; };
  }, [isLoading, loadError, medications, reload]);

  return <Context.Provider value={{ ...snapshot, loading, error, now, reload }}>{children}</Context.Provider>;
}

export function useNfcBox() {
  const value = useContext(Context);
  if (!value) throw new Error('NfcBoxProvider is required');
  return value;
}
