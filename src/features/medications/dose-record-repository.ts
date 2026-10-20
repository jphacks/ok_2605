import type { MedicationDatabase } from './database-types.ts';
import { isLocalDay, type DoseRecord, type DoseRecordSource } from './dose-record.ts';

const columns = `id, medication_id AS medicationId, scheduled_day AS scheduledDay,
  taken_at AS takenAt, source`;

export async function hasDoseRecord(db: MedicationDatabase, medicationId: number, day: string): Promise<boolean> {
  if (!isLocalDay(day)) throw new Error('服薬記録の日付が正しくありません。');
  return !!await db.getFirstAsync('SELECT id FROM dose_records WHERE medication_id = ? AND scheduled_day = ?', medicationId, day);
}

export async function listDoseRecordsForDay(db: MedicationDatabase, day: string): Promise<DoseRecord[]> {
  if (!isLocalDay(day)) throw new Error('服薬記録の日付が正しくありません。');
  return db.getAllAsync<DoseRecord>(
    `SELECT ${columns} FROM dose_records WHERE scheduled_day = ? ORDER BY taken_at ASC, id ASC`,
    day,
  );
}

export async function listDoseRecordsBetween(
  db: MedicationDatabase,
  firstDay: string,
  lastDay: string,
): Promise<DoseRecord[]> {
  if (!isLocalDay(firstDay) || !isLocalDay(lastDay) || firstDay > lastDay) {
    throw new Error('服薬履歴の期間が正しくありません。');
  }
  return db.getAllAsync<DoseRecord>(
    `SELECT ${columns} FROM dose_records
     WHERE scheduled_day BETWEEN ? AND ?
     ORDER BY scheduled_day ASC, taken_at ASC, id ASC`,
    firstDay,
    lastDay,
  );
}

export async function saveDoseRecord(
  db: MedicationDatabase,
  medicationId: number,
  day: string,
  source: DoseRecordSource,
  takenAt = new Date().toISOString(),
): Promise<DoseRecord> {
  if (!Number.isSafeInteger(medicationId) || medicationId <= 0) throw new Error('服薬する薬を選択してください。');
  if (!isLocalDay(day)) throw new Error('服薬記録の日付が正しくありません。');
  if (source !== 'qr' && source !== 'demo' && source !== 'nfc') throw new Error('服薬記録の方法が正しくありません。');
  if (!Number.isFinite(Date.parse(takenAt))) throw new Error('服薬日時が正しくありません。');

  const medication = await db.getFirstAsync<{ id: number }>('SELECT id FROM medications WHERE id = ?', medicationId);
  if (!medication) throw new Error('登録された薬が見つかりません。');

  await db.runAsync(
    `INSERT OR IGNORE INTO dose_records (medication_id, scheduled_day, taken_at, source)
     VALUES (?, ?, ?, ?)`,
    medicationId,
    day,
    takenAt,
    source,
  );
  const record = await db.getFirstAsync<DoseRecord>(
    `SELECT ${columns} FROM dose_records WHERE medication_id = ? AND scheduled_day = ?`,
    medicationId,
    day,
  );
  if (!record) throw new Error('服薬記録を保存できませんでした。');
  return record;
}
