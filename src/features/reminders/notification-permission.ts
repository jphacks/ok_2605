import type { MedicationDatabase, TransactionDatabase } from '../medications/database-types.ts';
import { inTransaction } from '../medications/transaction.ts';

export type PermissionRequest = 'none' | 'initial' | 'explicit';
type Permission = { granted: boolean; canAskAgain: boolean };
type PermissionApi<P extends Permission> = {
  prepare: () => Promise<unknown>;
  get: () => Promise<P>;
  request: () => Promise<P>;
  wasRequested: () => Promise<boolean>;
  markRequested: () => Promise<void>;
};

async function initializePromptState(db: MedicationDatabase) {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS notification_permission_prompt (
    id INTEGER PRIMARY KEY CHECK (id = 1), requested_at TEXT NOT NULL
  );`);
}

export function wasNotificationPermissionRequested(db: TransactionDatabase): Promise<boolean> {
  return inTransaction(db, async (transaction) => {
    await initializePromptState(transaction);
    return !!await transaction.getFirstAsync('SELECT id FROM notification_permission_prompt WHERE id = 1');
  });
}

export function markNotificationPermissionRequested(db: TransactionDatabase): Promise<void> {
  return inTransaction(db, async (transaction) => {
    await initializePromptState(transaction);
    await transaction.runAsync('INSERT OR IGNORE INTO notification_permission_prompt (id, requested_at) VALUES (1, ?)', new Date().toISOString());
  });
}

// Android 13+ may report "denied" before the first prompt because the channel is
// not yet enabled. The OS's canAskAgain flag and our persisted prompt state decide.
export function createNotificationPermissionRequester<P extends Permission>(api: PermissionApi<P>) {
  let queue = Promise.resolve();
  return (mode: PermissionRequest): Promise<P> => {
    const work = queue.then(async () => {
      await api.prepare();
      const permission = await api.get();
      if (mode === 'none') return permission;
      if (mode === 'initial' && await api.wasRequested()) return permission;
      const result = !permission.granted && permission.canAskAgain ? await api.request() : permission;
      await api.markRequested();
      return result;
    });
    queue = work.then(() => undefined, () => undefined);
    return work;
  };
}
