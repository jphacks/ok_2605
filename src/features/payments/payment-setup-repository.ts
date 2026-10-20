import type { MedicationDatabase } from '../medications/database-types.ts';
import { inTransaction, type TransactionDatabase } from '../medications/transaction.ts';

// Only these fictional presets can be registered; no real card number or CVC is accepted.
export const DUMMY_CARDS = [
  { id: 'demo-visa', brand: 'Visa', number: '4242 4242 4242 4242', last4: '4242', expiry: '12 / 99' },
  { id: 'demo-mastercard', brand: 'Mastercard', number: '5555 5555 5555 4444', last4: '4444', expiry: '12 / 99' },
] as const;
export type DummyCardId = typeof DUMMY_CARDS[number]['id'];
export type DummyCard = { presetId: DummyCardId; nickname: string; updatedAt: string };
export type SetupStep = 'box' | 'box-tag' | 'card' | 'complete';
export type PaymentSetup = { step: SetupStep; boxId: number | null; card: DummyCard | null };

export const PAYMENT_SETUP_SCHEMA = `
  CREATE TABLE IF NOT EXISTS app_onboarding (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    completed_at TEXT
  );
  INSERT OR IGNORE INTO app_onboarding (id) VALUES (1);
  CREATE TABLE IF NOT EXISTS dummy_payment_card (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    preset_id TEXT NOT NULL CHECK (preset_id IN ('demo-visa', 'demo-mastercard')),
    nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 40),
    updated_at TEXT NOT NULL
  );
`;

export async function readPaymentSetup(db: MedicationDatabase, requireNfc = false): Promise<PaymentSetup> {
  const box = await db.getFirstAsync<{ id: number; tagId: string | null }>('SELECT id, tag_uid AS tagId FROM medicine_boxes ORDER BY id LIMIT 1');
  const setup = await db.getFirstAsync<{ completedAt: string | null }>('SELECT completed_at AS completedAt FROM app_onboarding WHERE id = 1');
  const card = await db.getFirstAsync<DummyCard>('SELECT preset_id AS presetId, nickname, updated_at AS updatedAt FROM dummy_payment_card WHERE id = 1');
  const step = setup?.completedAt && card ? 'complete' : !box ? 'box'
    : requireNfc && !box.tagId ? 'box-tag' : 'card';
  return { step, boxId: box?.id ?? null, card };
}

export function loadPaymentSetup(db: TransactionDatabase, requireNfc = false): Promise<PaymentSetup> {
  return inTransaction(db, (transaction) => readPaymentSetup(transaction, requireNfc));
}

export function saveDummyCard(db: TransactionDatabase, presetId: DummyCardId, nickname: string, completeOnboarding: boolean, requireNfc = false): Promise<PaymentSetup> {
  if (!DUMMY_CARDS.some((card) => card.id === presetId)) throw new Error('ダミーカードを選択してください。');
  const name = nickname.trim();
  if (!name || Array.from(name).length > 40 || name.includes('\0')) throw new Error('カードの表示名を1〜40文字で入力してください。');
  return inTransaction(db, async (transaction) => {
    const before = await readPaymentSetup(transaction, requireNfc);
    if (completeOnboarding && before.step === 'box-tag') throw new Error('先に薬箱のNFCタグを登録してください。');
    if (completeOnboarding && before.step !== 'card' && before.step !== 'complete') throw new Error('先に薬箱を登録してください。');
    if (!completeOnboarding && before.step !== 'complete') throw new Error('初回登録を完了してください。');
    const now = new Date().toISOString();
    await transaction.runAsync(`INSERT INTO dummy_payment_card (id, preset_id, nickname, updated_at) VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET preset_id = excluded.preset_id, nickname = excluded.nickname, updated_at = excluded.updated_at`, presetId, name, now);
    if (completeOnboarding) await transaction.runAsync('UPDATE app_onboarding SET completed_at = COALESCE(completed_at, ?) WHERE id = 1', now);
    return readPaymentSetup(transaction, requireNfc);
  });
}
