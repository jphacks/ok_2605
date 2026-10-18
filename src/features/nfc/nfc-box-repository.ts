import { isMedicationActiveOnDay, type Medication } from '../medications/medication.ts';
import type { MedicationDatabase } from '../medications/medication-repository.ts';
import { inTransaction } from '../medications/transaction.ts';
import { saveDoseRecord } from '../medications/dose-record-repository.ts';
import { localDay, scheduledDate } from '../medications/dose-record.ts';
import { medicationGraceMinutes } from '../medications/grace-period.ts';
import { doseDeadline } from '../payments/penalty-repository.ts';
import { listMedicineBoxes, type MedicineBox } from '../boxes/medicine-box-repository.ts';

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
export type NfcBoxSnapshot = { box: NfcBox | null; boxes: MedicineBox[]; records: NfcDoseRecord[] };
export type NfcDose = { medication: Medication; day: string; deadline: Date };

const initialization = new WeakMap<NfcDatabase, Promise<void>>();

// Additive, namespaced tables. Existing medication/payment tables and their schema version stay intact.
export async function initializeNfcDatabase(db: NfcDatabase): Promise<void> {
  let work = initialization.get(db);
  if (!work) {
    work = inTransaction(db, async (transaction) => {
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
        CREATE TRIGGER IF NOT EXISTS nfc_auto_link_new_medication
        AFTER INSERT ON medications
        WHEN EXISTS (SELECT 1 FROM nfc_box WHERE id = 1)
        BEGIN
          INSERT OR IGNORE INTO nfc_box_medications (medication_id) VALUES (NEW.id);
        END;
        INSERT OR IGNORE INTO nfc_box_medications (medication_id)
        SELECT id FROM medications
        WHERE EXISTS (SELECT 1 FROM nfc_box WHERE id = 1);
      `);
    });
    initialization.set(db, work);
    void work.catch(() => { initialization.delete(db); });
  }
  await work;
}

async function readBox(db: MedicationDatabase, tagId?: string): Promise<NfcBox | null> {
  const boxes = await listMedicineBoxes(db);
  const box = boxes.find((item) => tagId ? item.tagId === tagId : !!item.tagId);
  return box?.tagId ? { tagId: box.tagId, medications: box.medications } : null;
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
  return { box: await readBox(db), boxes: await listMedicineBoxes(db), records };
}

export function pendingNfcDoses(box: NfcBox | null, now: Date): NfcDose[] {
  if (!box || !Number.isFinite(now.getTime())) return [];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const days = [localDay(yesterday), localDay(now)];
  return box.medications.flatMap((medication) => days.flatMap((day) => {
    if (!isMedicationActiveOnDay(medication, day)) return [];
    const deadline = doseDeadline(day, medication.doseTime, medicationGraceMinutes(medication.graceMinutes));
    const start = scheduledDate(day, medication.doseTime).getTime();
    return now.getTime() >= start && now.getTime() < deadline.getTime()
      ? [{ medication, day, deadline }] : [];
  }));
}

export async function saveNfcBox(db: NfcDatabase, tagId: string, signal: AbortSignal): Promise<{ linkedMedicationCount: number }> {
  if (!/^(?:[0-9A-F]{2}){1,32}$/.test(tagId)) throw new Error('タグIDを読み取り直してください。');
  await initializeNfcDatabase(db);
  let linkedMedicationCount = 0;
  await inTransaction(db, async (transaction) => {
    if (signal.aborted) throw new Error('登録を中止しました。');
    await transaction.runAsync(`INSERT INTO nfc_box (id, tag_uid, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET tag_uid = excluded.tag_uid, updated_at = excluded.updated_at`, tagId, new Date().toISOString());
    await transaction.runAsync('DELETE FROM nfc_box_medications');
    await transaction.runAsync('INSERT INTO nfc_box_medications (medication_id) SELECT id FROM medications');
    await transaction.runAsync(`INSERT INTO medicine_boxes (name, tag_uid, legacy_id, created_at)
      VALUES ('いつもの薬箱', ?, 1, ?) ON CONFLICT(legacy_id) DO UPDATE SET tag_uid = excluded.tag_uid`, tagId, new Date().toISOString());
    await transaction.runAsync(`INSERT OR IGNORE INTO medicine_box_assignments (medication_id, box_id)
      SELECT m.id, b.id FROM medications m CROSS JOIN medicine_boxes b WHERE b.legacy_id = 1`);
    const count = await transaction.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM nfc_box_medications');
    linkedMedicationCount = count?.count ?? 0;
    if (signal.aborted) throw new Error('登録を中止しました。');
  });
  return { linkedMedicationCount };
}

export async function confirmNfcDoses(db: NfcDatabase, tagId: string, signal: AbortSignal) {
  await initializeNfcDatabase(db);
  let result = { recorded: 0, alreadyRecorded: 0, names: [] as string[] };
  await inTransaction(db, async (transaction) => {
    if (signal.aborted) throw new Error('読み取りを中止しました。');
    const box = await readBox(transaction, tagId);
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

export async function confirmNfcDose(
  db: NfcDatabase,
  tagId: string,
  medicationId: number,
  scheduledDay: string,
  signal: AbortSignal,
  now = new Date(),
) {
  if (!Number.isSafeInteger(medicationId) || medicationId <= 0) {
    throw new Error('服用するお薬を確認できませんでした。ホームから選び直してください。');
  }
  await initializeNfcDatabase(db);
  let result = { recorded: false, medicationName: '', confirmedAt: '' };
  await inTransaction(db, async (transaction) => {
    if (signal.aborted) throw new Error('読み取りを中止しました。');
    const box = await readBox(transaction, tagId);
    if (!box || tagId !== box.tagId) throw new Error('登録した薬箱のタグではありません。薬箱のタグを確認してください。');

    const dose = pendingNfcDoses(box, now).find(
      (candidate) => candidate.medication.id === medicationId && candidate.day === scheduledDay,
    );
    if (!dose) {
      throw new Error('このお薬は現在、服用確認の対象ではありません。ホームで服用時刻を確認してください。');
    }

    const existing = await transaction.getFirstAsync<{ takenAt: string }>(
      'SELECT taken_at AS takenAt FROM dose_records WHERE medication_id = ? AND scheduled_day = ?',
      medicationId,
      scheduledDay,
    );
    if (existing) {
      result = { recorded: false, medicationName: dose.medication.name, confirmedAt: existing.takenAt };
      return;
    }

    const confirmedAt = now.toISOString();
    await transaction.runAsync(`INSERT INTO nfc_dose_confirmations
      (medication_id, scheduled_day, dose_time, medication_name, tag_uid, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(medication_id, scheduled_day, dose_time) DO NOTHING`,
    dose.medication.id, dose.day, dose.medication.doseTime, dose.medication.name, tagId, confirmedAt);
    await saveDoseRecord(transaction, dose.medication.id, dose.day, 'nfc', confirmedAt);
    if (signal.aborted) throw new Error('読み取りを中止しました。');
    result = { recorded: true, medicationName: dose.medication.name, confirmedAt };
  });
  return result;
}

