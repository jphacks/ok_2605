type MedicationDatabaseValue = string | number | null;

// Both expo-sqlite and the real SQLite test adapter implement this contract.
export interface MedicationDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    ...params: MedicationDatabaseValue[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, ...params: MedicationDatabaseValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: MedicationDatabaseValue[]): Promise<T | null>;
}

export interface TransactionDatabase extends MedicationDatabase {
  withExclusiveTransactionAsync(task: (transaction: MedicationDatabase) => Promise<void>): Promise<void>;
}
