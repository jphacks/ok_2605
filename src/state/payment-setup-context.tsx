import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { getMedicationDatabase } from '@/features/medications/database';
import { loadPaymentSetup, saveDummyCard, type DummyCardId, type PaymentSetup } from '@/features/payments/payment-setup-repository';

type SetupState = {
  setup: PaymentSetup | null; loading: boolean; error: string | null;
  refresh: () => Promise<void>;
  saveCard: (presetId: DummyCardId, nickname: string, completeOnboarding: boolean) => Promise<void>;
};
const Context = createContext<SetupState | null>(null);
const EMPTY_SETUP: PaymentSetup = { step: 'box', boxId: null, card: null };

function normalizeSetupForPlatform(value: PaymentSetup): PaymentSetup {
  // Web is used as a UI preview, so it should open the app without the native
  // device/card onboarding flow. Native platforms keep the real setup state.
  return Platform.OS === 'web' ? { ...value, step: 'complete' } : value;
}

function fallbackSetup(): PaymentSetup {
  return normalizeSetupForPlatform(EMPTY_SETUP);
}

export function PaymentSetupProvider({ children }: PropsWithChildren) {
  const [setup, setSetup] = useState<PaymentSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const saving = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    try {
      const saved = await loadPaymentSetup(await getMedicationDatabase(), Platform.OS === 'android');
      if (request === version.current) { setSetup(normalizeSetupForPlatform(saved)); setError(null); }
    } catch {
      if (request === version.current) {
        // Keep the app usable even when the first local database read fails.
        // A later refresh can replace this temporary state with the saved setup.
        setSetup((current) => current ?? fallbackSetup());
        setError(null);
      }
    } finally { if (request === version.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const initialLoad = setTimeout(() => void refresh(), 0);
    return () => { clearTimeout(initialLoad); version.current += 1; };
  }, [refresh]);
  const saveCard = async (presetId: DummyCardId, nickname: string, completeOnboarding: boolean) => {
    if (saving.current) throw new Error('保存中です。');
    saving.current = true;
    try {
      const saved = await saveDummyCard(await getMedicationDatabase(), presetId, nickname, completeOnboarding, Platform.OS === 'android');
      version.current += 1;
      setSetup(normalizeSetupForPlatform(saved)); setError(null); setLoading(false);
    } finally { saving.current = false; }
  };
  return <Context.Provider value={{ setup, loading, error, refresh, saveCard }}>{children}</Context.Provider>;
}

export function usePaymentSetup() {
  const value = useContext(Context);
  if (!value) throw new Error('PaymentSetupProvider is required');
  return value;
}
