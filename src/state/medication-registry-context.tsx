import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { getMedicationDatabase } from '@/features/medications/database';
import type { Medication, MedicationInput } from '@/features/medications/medication';
import { listMedications, saveMedication } from '@/features/medications/medication-repository';
import { archiveMedication, editMedication } from '@/features/medications/medication-lifecycle';

type MedicationRegistry = {
  medications: Medication[];
  isLoading: boolean;
  loadError: string | null;
  reloadMedications: () => Promise<void>;
  registerMedication: (input: MedicationInput) => Promise<Medication>;
  updateMedication: (id: number, input: MedicationInput) => Promise<void>;
  deleteMedication: (id: number) => Promise<void>;
};

const MedicationRegistryContext = createContext<MedicationRegistry | null>(null);

export function MedicationRegistryProvider({ children }: PropsWithChildren) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const isSaving = useRef(false);

  const loadMedications = useCallback(async (version: number) => {
    try {
      const database = await getMedicationDatabase();
      const savedMedications = await listMedications(database);
      if (version === requestVersion.current) setMedications(savedMedications);
    } catch {
      if (version === requestVersion.current) {
        setLoadError('登録した薬を読み込めませんでした。もう一度お試しください。');
      }
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, []);

  const reloadMedications = useCallback(async () => {
    const version = ++requestVersion.current;
    setIsLoading(true);
    setLoadError(null);
    await loadMedications(version);
  }, [loadMedications]);

  useEffect(() => {
    // Initial loading is already represented by the initial state; publish after the DB read.
    const version = ++requestVersion.current;
    void loadMedications(version);
    return () => { requestVersion.current += 1; };
  }, [loadMedications]);

  const registerMedication = async (input: MedicationInput) => {
    if (isLoading || loadError) throw new Error('薬の情報を読み込んでからお試しください。');
    if (isSaving.current) throw new Error('登録処理中です。');
    isSaving.current = true;

    try {
      const database = await getMedicationDatabase();
      const saved = await saveMedication(database, input);
      // Publish only after SQLite has confirmed the write, without a fallible second query.
      requestVersion.current += 1;
      setIsLoading(false);
      setLoadError(null);
      setMedications((current) => [...current, saved].sort((a, b) => (
        a.doseTime.localeCompare(b.doseTime) || a.id - b.id
      )));
      return saved;
    } finally {
      isSaving.current = false;
    }
  };

  const updateMedication = async (id: number, input: MedicationInput) => {
    if (isSaving.current || isLoading || loadError) throw new Error('薬の情報を確認してから再試行してください。');
    isSaving.current = true;
    try {
      const saved = await editMedication(await getMedicationDatabase(), id, input);
      requestVersion.current += 1;
      setMedications((current) => current.map((item) => item.id === id ? saved : item).sort((a, b) => a.doseTime.localeCompare(b.doseTime) || a.id - b.id));
    } finally { isSaving.current = false; }
  };

  const deleteMedication = async (id: number) => {
    if (isSaving.current || isLoading || loadError) throw new Error('薬の情報を確認してから再試行してください。');
    isSaving.current = true;
    try {
      await archiveMedication(await getMedicationDatabase(), id);
      requestVersion.current += 1;
      setMedications((current) => current.filter((item) => item.id !== id));
    } finally { isSaving.current = false; }
  };

  return (
    <MedicationRegistryContext.Provider value={{ medications, isLoading, loadError, reloadMedications, registerMedication, updateMedication, deleteMedication }}>
      {children}
    </MedicationRegistryContext.Provider>
  );
}

export function useMedicationRegistry() {
  const context = useContext(MedicationRegistryContext);
  if (!context) throw new Error('MedicationRegistryProvider is required');
  return context;
}
