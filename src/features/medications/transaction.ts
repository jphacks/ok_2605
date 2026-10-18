import type { MedicationDatabase } from './medication-repository.ts';

export interface TransactionDatabase extends MedicationDatabase {
  withExclusiveTransactionAsync(task: (transaction: MedicationDatabase) => Promise<void>): Promise<void>;
}

const queues = new WeakMap<TransactionDatabase, Promise<void>>();

export async function inTransaction<T>(db: TransactionDatabase, task: (transaction: MedicationDatabase) => Promise<T>): Promise<T> {
  const previous = queues.get(db) ?? Promise.resolve();
  const work = previous.then(async () => {
    let result!: T;
    await db.withExclusiveTransactionAsync(async (transaction) => { result = await task(transaction); });
    return result;
  });
  const settled = work.then(() => undefined, () => undefined);
  queues.set(db, settled);
  try { return await work; }
  finally { if (queues.get(db) === settled) queues.delete(db); }
}
