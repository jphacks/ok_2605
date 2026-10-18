import type { Medication } from '../medications/medication.ts';
import type { MedicationDatabase } from '../medications/medication-repository.ts';

export type MedicineBox = { id: number; name: string; tagId: string | null; medications: Medication[] };

export async function initializeMedicineBoxes(db: MedicationDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS medicine_boxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
      tag_uid TEXT UNIQUE,
      legacy_id INTEGER UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS medicine_box_assignments (
      medication_id INTEGER PRIMARY KEY REFERENCES medications(id),
      box_id INTEGER NOT NULL REFERENCES medicine_boxes(id)
    );
    CREATE TABLE IF NOT EXISTS device_verification (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      token TEXT NOT NULL
    );
    INSERT OR IGNORE INTO device_verification (id, token) VALUES (1, lower(hex(randomblob(32))));
    CREATE TRIGGER IF NOT EXISTS medicine_box_legacy_assignment AFTER INSERT ON medications
    WHEN EXISTS (SELECT 1 FROM medicine_boxes WHERE legacy_id = 1)
    BEGIN
      INSERT OR IGNORE INTO medicine_box_assignments (medication_id, box_id)
      SELECT NEW.id, id FROM medicine_boxes WHERE legacy_id = 1;
    END;
  `);
  const legacy = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nfc_box'");
  if (legacy) {
    await db.execAsync(`
      INSERT OR IGNORE INTO medicine_boxes (name, tag_uid, legacy_id, created_at)
      SELECT 'いつもの薬箱', tag_uid, 1, updated_at FROM nfc_box WHERE id = 1;
      INSERT OR IGNORE INTO medicine_box_assignments (medication_id, box_id)
      SELECT medication_id, b.id FROM nfc_box_medications CROSS JOIN medicine_boxes b WHERE b.legacy_id = 1;
    `);
  }
}

export async function listMedicineBoxes(db: MedicationDatabase): Promise<MedicineBox[]> {
  const boxes = await db.getAllAsync<Omit<MedicineBox, 'medications'>>('SELECT id, name, tag_uid AS tagId FROM medicine_boxes ORDER BY id');
  const rows = await db.getAllAsync<Medication & { boxId: number; isPlan: number; rawNotificationsEnabled: number }>(`
    SELECT m.id, m.name, m.dose_time AS doseTime, m.penalty_amount AS penaltyAmount,
      m.created_at AS createdAt, a.box_id AS boxId, g.id AS groupId,
      gd.dose_amount AS doseAmount, g.unit, g.starts_on AS activeStartDay,
      g.ends_on AS activeEndDay, g.notifications_enabled AS rawNotificationsEnabled,
      g.is_plan AS isPlan
    FROM medications m JOIN medicine_box_assignments a ON a.medication_id = m.id
    JOIN medication_details d ON d.medication_id = m.id
    LEFT JOIN medication_group_doses gd ON gd.medication_id = m.id
    LEFT JOIN medication_groups g ON g.id = gd.group_id
    WHERE d.archived_at IS NULL ORDER BY m.dose_time, m.id
  `);
  const medications = rows.map((row) => {
    const { isPlan, rawNotificationsEnabled, ...medication } = row;
    if (!isPlan) {
      const { groupId: _groupId, doseAmount: _doseAmount, unit: _unit,
        activeStartDay: _activeStartDay, activeEndDay: _activeEndDay, ...legacy } = medication;
      return legacy;
    }
    return { ...medication, notificationsEnabled: rawNotificationsEnabled === 1 };
  });
  return boxes.map((box) => ({ ...box, medications: medications.filter((m) => m.boxId === box.id) }));
}

export async function createMedicineBox(db: MedicationDatabase, name: string): Promise<number> {
  const normalized = name.trim();
  if (!normalized || Array.from(normalized).length > 40 || normalized.includes('\0')) throw new Error('薬箱の名前は1〜40文字で入力してください。');
  const result = await db.runAsync('INSERT INTO medicine_boxes (name, created_at) VALUES (?, ?)', normalized, new Date().toISOString());
  return result.lastInsertRowId;
}

export async function assignMedicineBox(db: MedicationDatabase, medicationId: number, boxId: number) {
  const box = Number.isSafeInteger(boxId) && boxId > 0 && await db.getFirstAsync('SELECT id FROM medicine_boxes WHERE id = ?', boxId);
  if (!box) throw new Error('薬を入れる薬箱を選択してください。');
  await db.runAsync(`INSERT INTO medicine_box_assignments (medication_id, box_id) VALUES (?, ?)
    ON CONFLICT(medication_id) DO UPDATE SET box_id = excluded.box_id`, medicationId, boxId);
}

export async function setMedicineBoxTag(db: MedicationDatabase, boxId: number, tagId: string) {
  if (!/^(?:[0-9A-F]{2}){1,32}$/.test(tagId)) throw new Error('タグIDを読み取り直してください。');
  const duplicate = await db.getFirstAsync('SELECT id FROM medicine_boxes WHERE tag_uid = ? AND id != ?', tagId, boxId);
  if (duplicate) throw new Error('このNFCタグは別の薬箱に登録されています。別のタグを使用してください。');
  const result = await db.runAsync('UPDATE medicine_boxes SET tag_uid = ? WHERE id = ?', tagId, boxId);
  if (!result.changes) throw new Error('薬箱が見つかりません。');
}

export async function deviceQrPayload(db: MedicationDatabase): Promise<string> {
  const row = await db.getFirstAsync<{ token: string }>('SELECT token FROM device_verification WHERE id = 1');
  if (!row) throw new Error('端末のQRコードを読み込めませんでした。');
  return `nomupay:device:v1:${row.token}`;
}
