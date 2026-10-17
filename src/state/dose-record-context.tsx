import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { getMedicationDatabase } from '@/features/medications/database';
import { localDay, type DoseRecord, type DoseRecordSource } from '@/features/medications/dose-record';
import { listDoseRecordsForDay, saveDoseRecord } from '@/features/medications/dose-record-repository';

type DoseRecordState = {
  day: string;
  records: DoseRecord[];
  isLoading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  recordMedicationTaken: (medicationId: number, source: DoseRecordSource) => Promise<DoseRecord>;
};

const Context = createContext<DoseRecordState | null>(null);

export function DoseRecordProvider({ children }: PropsWithChildren) {
  const [day, setDay] = useState(() => localDay(new Date()));
  const [records, setRecords] = useState<DoseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const nextDay = localDay(new Date());
    setDay(nextDay);
    setIsLoading(true);
    setLoadError(null);
    try {
      const database = await getMedicationDatabase();
      const saved = await listDoseRecordsForDay(database, nextDay);
      if (version === requestVersion.current) setRecords(saved);
    } catch {
      if (version === requestVersion.current) setLoadError('今日の服薬記録を読み込めませんでした。');
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (localDay(new Date()) !== day) void refresh();
    }, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      requestVersion.current += 1;
      clearTimeout(initialLoad);
      clearInterval(timer);
      subscription.remove();
    };
  }, [day, refresh]);

  const recordMedicationTaken = async (medicationId: number, source: DoseRecordSource) => {
    const currentDay = localDay(new Date());
    const database = await getMedicationDatabase();
    const saved = await saveDoseRecord(database, medicationId, currentDay, source);
    requestVersion.current += 1;
    setDay(currentDay);
    setIsLoading(false);
    setLoadError(null);
    setRecords((current) => {
      const withoutSameOccurrence = current.filter(
        (record) => record.medicationId !== medicationId || record.scheduledDay !== currentDay,
      );
      return [...withoutSameOccurrence, saved].sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.id - b.id);
    });
    return saved;
  };

  return (
    <Context.Provider value={{ day, records, isLoading, loadError, refresh, recordMedicationTaken }}>
      {children}
    </Context.Provider>
  );
}

export function useDoseRecords() {
  const value = useContext(Context);
  if (!value) throw new Error('DoseRecordProvider is required');
  return value;
}
