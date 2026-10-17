import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { initializeMedicationDatabase } from './medication-repository';

let databasePromise: Promise<SQLiteDatabase> | undefined;

// Keep one initialized connection across screens; allow a fresh attempt after an open error.
export function getMedicationDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await openDatabaseAsync('nomupay.db');
      try {
        await initializeMedicationDatabase(database);
        return database;
      } catch (error) {
        await database.closeAsync().catch(() => undefined);
        throw error;
      }
    })().catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  }

  return databasePromise;
}
