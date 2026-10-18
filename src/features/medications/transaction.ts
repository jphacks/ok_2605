import type { MedicationDatabase } from './medication-repository.ts';

export interface TransactionDatabase extends MedicationDatabase {
  withExclusiveTransactionAsync(task: (transaction: MedicationDatabase) => Promise<void>): Promise<void>;
  withTransactionAsync?: (task: () => Promise<void>) => Promise<void>;
}

const queues = new WeakMap<TransactionDatabase, Promise<void>>();

export async function inTransaction<T>(db: TransactionDatabase, task: (transaction: MedicationDatabase) => Promise<T>): Promise<T> {
  const previous = queues.get(db) ?? Promise.resolve();
  const work = previous.then(async () => {
    let result!: T;
    let callbackStarted = false;
    try {
      await db.withExclusiveTransactionAsync(async (transaction) => {
        callbackStarted = true;
        result = await task(transaction);
      });
    } catch (cause) {
      // expo-sqlite does not implement withExclusiveTransactionAsync on web.
      // The non-exclusive transaction is safe here because all writes for a
      // database are serialized through this queue.
      if (callbackStarted || !(cause instanceof Error) || cause.message !== 'withExclusiveTransactionAsync is not supported on web' || !db.withTransactionAsync) {
        throw cause;
      }
      await db.withTransactionAsync(async () => { result = await task(db); });
    }
    return result;
  });
  const settled = work.then(() => undefined, () => undefined);
  queues.set(db, settled);
  try { return await work; }
  finally { if (queues.get(db) === settled) queues.delete(db); }
}
