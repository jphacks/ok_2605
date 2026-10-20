import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { getMedicationDatabase } from '@/features/medications/database';
import { acknowledgePenalties, reconcilePenalties, retryPenaltyPayment, type PenaltyPayment } from '@/features/payments/penalty-repository';
import { useMedicationRegistry } from './medication-registry-context';
import { useDoseRecords } from './dose-record-context';
import { useReminders } from './reminder-context';

type PenaltyState = {
  payments: PenaltyPayment[]; pending: PenaltyPayment[]; loading: boolean; error: string | null;
  refresh: () => Promise<void>; acknowledge: (ids: number[]) => Promise<void>; retry: (id: number) => Promise<void>;
};
const Context = createContext<PenaltyState | null>(null);

export function PenaltyProvider({ children }: PropsWithChildren) {
  const { medications, isLoading, loadError } = useMedicationRegistry();
  const { records } = useDoseRecords();
  const { notifyPayments } = useReminders();
  const [payments, setPayments] = useState<PenaltyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const pending = payments.filter((payment) => !payment.acknowledgedAt);

  const refresh = useCallback(() => {
    const work = queue.current.then(async () => {
      if (!mounted.current || AppState.currentState !== 'active') return;
      try {
        const db = await getMedicationDatabase();
        if (!mounted.current || AppState.currentState !== 'active') return;
        const saved = await reconcilePenalties(db);
        if (mounted.current) { setPayments(saved); setError(null); }
        // Test settlement is foreground-only. The OS deadline notification does
        // not read the database or create a payment while the app is closed.
        void notifyPayments(saved);
      } catch {
        if (mounted.current) setError('飲み忘れと決済結果を確認できませんでした。再読み込みしてください。');
      } finally { if (mounted.current) setLoading(false); }
    });
    queue.current = work;
    return work;
  }, [notifyPayments]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!isLoading && !loadError) void refresh();
  }, [medications, isLoading, loadError, records, refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const updateTimer = (state: string) => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (state === 'active') timer = setInterval(() => { void refresh(); }, 15_000);
    };
    updateTimer(AppState.currentState);
    const subscription = AppState.addEventListener('change', (state) => {
      updateTimer(state);
      if (state === 'active') void refresh();
    });
    return () => { subscription.remove(); if (timer) clearInterval(timer); };
  }, [refresh]);

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
      const saved = await retryPenaltyPayment(await getMedicationDatabase(), id);
      setPayments(saved);
      await notifyPayments(saved);
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
