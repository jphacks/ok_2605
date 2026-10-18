import { router, usePathname, useRootNavigationState } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { getMedicationDatabase } from '@/features/medications/database';
import { acknowledgePenalties, reconcilePenalties, retryPenaltyPayment, type PenaltyPayment } from '@/features/payments/penalty-repository';
import { useMedicationRegistry } from './medication-registry-context';
import { useDoseRecords } from './dose-record-context';

type PenaltyState = {
  payments: PenaltyPayment[]; pending: PenaltyPayment[]; loading: boolean; error: string | null;
  refresh: () => Promise<void>; acknowledge: (ids: number[]) => Promise<void>; retry: (id: number) => Promise<void>;
};
const Context = createContext<PenaltyState | null>(null);

export function PenaltyProvider({ children }: PropsWithChildren) {
  const { medications, isLoading, loadError } = useMedicationRegistry();
  const { records } = useDoseRecords();
  const [payments, setPayments] = useState<PenaltyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const pending = payments.filter((payment) => !payment.acknowledgedAt);

  const refresh = useCallback(() => {
    const work = queue.current.then(async () => {
      if (!mounted.current) return;
      try {
        const db = await getMedicationDatabase();
        const saved = await reconcilePenalties(db);
        if (mounted.current) { setPayments(saved); setError(null); }
      } catch {
        if (mounted.current) setError('飲み忘れと決済結果を確認できませんでした。再読み込みしてください。');
      } finally { if (mounted.current) setLoading(false); }
    });
    queue.current = work;
    return work;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!isLoading && !loadError) void refresh();
  }, [medications, isLoading, loadError, records, refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (navigation?.key && !loading && pending.length && pathname !== '/missed') router.push('/missed');
  }, [navigation?.key, loading, pending.length, pathname]);

  const acknowledge = async (ids: number[]) => {
    // Queue behind in-flight foreground checks so stale results cannot restore an acknowledged notice.
    const work = queue.current.then(async () => {
      const db = await getMedicationDatabase();
      await acknowledgePenalties(db, ids);
      setPayments((current) => current.map((payment) => ids.includes(payment.id) ? { ...payment, acknowledgedAt: new Date().toISOString() } : payment));
    });
    queue.current = work.catch(() => undefined);
    await work;
  };
  const retry = async (id: number) => {
    const work = queue.current.then(async () => {
      setPayments(await retryPenaltyPayment(await getMedicationDatabase(), id));
    });
    queue.current = work.catch(() => undefined);
    await work;
  };

  return <Context.Provider value={{ payments, pending, loading, error, refresh, acknowledge, retry }}>{children}</Context.Provider>;
}

export function usePenalties() {
  const value = useContext(Context);
  if (!value) throw new Error('PenaltyProvider is required');
  return value;
}
