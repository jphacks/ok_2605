import type { Medication } from '../medications/medication.ts';
import type { MedicationDatabase } from '../medications/medication-repository.ts';
import { saveDoseRecord } from '../medications/dose-record-repository.ts';
import { DEMO_GRACE_MINUTES, demoDeadline, localDay } from '../payments/demo-payment.ts';

export interface NfcDatabase extends MedicationDatabase {
  withExclusiveTransactionAsync(task: (transaction: MedicationDatabase) => Promise<void>): Promise<void>;
}

export type NfcBox = { tagId: string; medications: Medication[] };
export type NfcDoseRecord = {
  medicationId: number;
  medicationName: string;
  scheduledDay: string;
  doseTime: string;
  confirmedAt: string;
};
export type NfcBoxSnapshot = { box: NfcBox | null; records: NfcDoseRecord[] };
export type NfcDose = { medication: Medication; day: string; deadline: Date };

const initialization = new WeakMap<NfcDatabase, Promise<void>>();

// Additive, namespaced tables. Existing medication/payment tables and their schema version stay intact.
export async function initializeNfcDatabase(db: NfcDatabase): Promise<void> {
  let work = initialization.get(db);
  if (!work) {
    work = db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(`
        CREATE TABLE IF NOT EXISTS nfc_box (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          tag_uid TEXT NOT NULL CHECK (length(tag_uid) BETWEEN 2 AND 64),
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS nfc_box_medications (
          medication_id INTEGER PRIMARY KEY REFERENCES medications(id)
        );
        CREATE TABLE IF NOT EXISTS nfc_dose_confirmations (
          medication_id INTEGER NOT NULL REFERENCES medications(id),
          scheduled_day TEXT NOT NULL,
          dose_time TEXT NOT NULL,
          medication_name TEXT NOT NULL,
          tag_uid TEXT NOT NULL,
          confirmed_at TEXT NOT NULL,
          PRIMARY KEY (medication_id, scheduled_day, dose_time)
        );
      `);
    });
    initialization.set(db, work);
    void work.catch(() => { initialization.delete(db); });
  }
  await work;
}

async function readBox(db: MedicationDatabase): Promise<NfcBox | null> {
  const box = await db.getFirstAsync<{ tagId: string }>('SELECT tag_uid AS tagId FROM nfc_box WHERE id = 1');
  if (!box) return null;
  const medications = await db.getAllAsync<Medication>(`
    SELECT m.id, m.name, m.dose_time AS doseTime, m.penalty_amount AS penaltyAmount, m.created_at AS createdAt
    FROM medications m JOIN nfc_box_medications b ON b.medication_id = m.id
    ORDER BY m.dose_time, m.id
  `);
  return { tagId: box.tagId, medications };
}

export async function loadNfcBox(db: NfcDatabase, now = new Date()): Promise<NfcBoxSnapshot> {
  await initializeNfcDatabase(db);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const records = await db.getAllAsync<NfcDoseRecord>(`
    SELECT d.medication_id AS medicationId, m.name AS medicationName,
      d.scheduled_day AS scheduledDay, m.dose_time AS doseTime, d.taken_at AS confirmedAt
    FROM dose_records d JOIN medications m ON m.id = d.medication_id
    WHERE d.scheduled_day >= ? AND d.scheduled_day <= ?
    ORDER BY d.taken_at DESC
  `, localDay(yesterday), localDay(now));
  return { box: await readBox(db), records };
}

export function pendingNfcDoses(box: NfcBox | null, now: Date): NfcDose[] {
  if (!box || !Number.isFinite(now.getTime())) return [];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const days = [localDay(yesterday), localDay(now)];
  return box.medications.flatMap((medication) => days.flatMap((day) => {
    const deadline = demoDeadline(day, medication.doseTime);
    const start = deadline.getTime() - DEMO_GRACE_MINUTES * 60_000;
    return now.getTime() >= start && now.getTime() < deadline.getTime()
      ? [{ medication, day, deadline }] : [];
  }));
}

export async function saveNfcBox(db: NfcDatabase, tagId: string, medicationIds: number[], signal: AbortSignal): Promise<void> {
  if (!/^(?:[0-9A-F]{2}){1,32}$/.test(tagId)) throw new Error('タグIDを読み取り直してください。');
  const ids = [...new Set(medicationIds)];
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('薬箱に入れる薬を1件以上選んでください。');
  }
  await initializeNfcDatabase(db);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (signal.aborted) throw new Error('登録を中止しました。');
    for (const id of ids) {
      if (!await transaction.getFirstAsync('SELECT id FROM medications WHERE id = ?', id)) {
        throw new Error('選択した薬が見つかりません。登録内容を再読み込みしてください。');
      }
    }
    await transaction.runAsync(`INSERT INTO nfc_box (id, tag_uid, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET tag_uid = excluded.tag_uid, updated_at = excluded.updated_at`, tagId, new Date().toISOString());
    await transaction.runAsync('DELETE FROM nfc_box_medications');
    for (const id of ids) await transaction.runAsync('INSERT INTO nfc_box_medications (medication_id) VALUES (?)', id);
    if (signal.aborted) throw new Error('登録を中止しました。');
  });
}

export async function confirmNfcDoses(db: NfcDatabase, tagId: string, signal: AbortSignal) {
  await initializeNfcDatabase(db);
  let result = { recorded: 0, alreadyRecorded: 0, names: [] as string[] };
  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (signal.aborted) throw new Error('読み取りを中止しました。');
    const box = await readBox(transaction);
    if (!box || tagId !== box.tagId) throw new Error('登録した薬箱のタグではありません。薬箱のタグを確認してください。');
    const now = new Date();
    const doses = pendingNfcDoses(box, now);
    if (!doses.length) throw new Error('現在、服用確認の対象はありません。登録した服用時刻から30分以内に読み取ってください。');
    let recorded = 0;
    for (const dose of doses) {
      const existing = await transaction.getFirstAsync('SELECT id FROM dose_records WHERE medication_id = ? AND scheduled_day = ?', dose.medication.id, dose.day);
      if (existing) continue;
      const inserted = await transaction.runAsync(`INSERT INTO nfc_dose_confirmations
        (medication_id, scheduled_day, dose_time, medication_name, tag_uid, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(medication_id, scheduled_day, dose_time) DO NOTHING`,
      dose.medication.id, dose.day, dose.medication.doseTime, dose.medication.name, tagId, now.toISOString());
      await saveDoseRecord(transaction, dose.medication.id, dose.day, 'nfc', now.toISOString());
      recorded += inserted.changes;
    }
    if (signal.aborted) throw new Error('読み取りを中止しました。');
    result = { recorded, alreadyRecorded: doses.length - recorded, names: doses.map((dose) => dose.medication.name) };
  });
  return result;
}

