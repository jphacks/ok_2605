const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDatabase } = require('./helpers/database.cjs');
const { initializeMedicationDatabase, saveMedication, listMedications } = require('../src/features/medications/medication-repository.ts');
const { createMedicineBox, listMedicineBoxes, assignMedicineBox, setMedicineBoxTag, deviceQrPayload } = require('../src/features/boxes/medicine-box-repository.ts');
const { editMedication, archiveMedication } = require('../src/features/medications/medication-lifecycle.ts');
const { inTransaction } = require('../src/features/medications/transaction.ts');
const { confirmNfcDose } = require('../src/features/nfc/nfc-box-repository.ts');
const { confirmQrDose } = require('../src/features/verification/qr-confirmation.ts');
const { listDoseRecordsForDay } = require('../src/features/medications/dose-record-repository.ts');
const input = { name: '朝のお薬', doseTime: '08:00', penaltyAmount: '100' };
const now = new Date(2026, 9, 18, 8, 10);
const day = '2026-10-18';
async function setup(t, file) {
  const connection = createDatabase(file); t.after(connection.close);
  await initializeMedicationDatabase(connection.db);
  return connection;
}

test('multiple named boxes retain assignments and a single QR after reopening the app', async (t) => {
  const { mkdtemp, rm } = require('node:fs/promises');
  const { join } = require('node:path'); const { tmpdir } = require('node:os');
  const dir = await mkdtemp(join(tmpdir(), 'nomupay-boxes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { db, reopen } = await setup(t, join(dir, 'app.db'));
  const home = await createMedicineBox(db, '  いつもの薬箱  ');
  const travel = await createMedicineBox(db, '持ち歩き用');
  const medication = await saveMedication(db, input);
  await assignMedicineBox(db, medication.id, home);
  const qr = await deviceQrPayload(db);
  reopen(); await initializeMedicationDatabase(db);
  assert.equal(await deviceQrPayload(db), qr);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS count FROM device_verification')).count, 1);
  const boxes = await listMedicineBoxes(db);
  assert.deepEqual(boxes.map((b) => b.name), ['いつもの薬箱', '持ち歩き用']);
  assert.deepEqual(boxes[0].medications.map((m) => m.id), [medication.id]);
  await editMedication(db, medication.id, { ...input, boxId: String(travel) }, now);
  const moved = await listMedicineBoxes(db);
  assert.equal(moved[0].medications.length, 0);
  assert.equal(moved[1].medications[0].id, medication.id);
  assert.equal(await deviceQrPayload(db), qr);
});

test('invalid box selection rolls back registration and edits without leaving partial medication data', async (t) => {
  const { db } = await setup(t);
  await assert.rejects(inTransaction(db, async (tx) => {
    const medication = await saveMedication(tx, input);
    await assignMedicineBox(tx, medication.id, 999);
  }), /薬箱/);
  assert.deepEqual(await listMedications(db), []);
  const medication = await saveMedication(db, input);
  await assert.rejects(editMedication(db, medication.id, { ...input, name: '変更後', boxId: '999' }, now), /薬箱/);
  assert.equal((await listMedications(db))[0].name, input.name);
  for (const name of ['', '   ', 'a'.repeat(41), '\0']) await assert.rejects(createMedicineBox(db, name), /1〜40文字/);
});

test('NFC verifies the selected medication against its own box and rejects duplicate tags', async (t) => {
  const { db } = await setup(t);
  const first = await createMedicineBox(db, '家');
  const second = await createMedicineBox(db, '外');
  await setMedicineBoxTag(db, first, 'AABB'); await setMedicineBoxTag(db, second, 'CCDD');
  await assert.rejects(setMedicineBoxTag(db, second, 'AABB'), /別の薬箱/);
  const a = await saveMedication(db, input); const b = await saveMedication(db, { ...input, name: '外のお薬' });
  await assignMedicineBox(db, a.id, first); await assignMedicineBox(db, b.id, second);
  const signal = new AbortController().signal;
  await assert.rejects(confirmNfcDose(db, 'AABB', b.id, day, signal, now), /対象ではありません/);
  assert.deepEqual(await listDoseRecordsForDay(db, day), []);
  await confirmNfcDose(db, 'CCDD', b.id, day, signal, now);
  assert.deepEqual((await listDoseRecordsForDay(db, day)).map((r) => r.medicationId), [b.id]);
  await archiveMedication(db, a.id, now);
  assert.equal((await listMedicineBoxes(db))[0].medications.length, 0);
});

test('moving medication to another box invalidates the old NFC tag without changing the device QR', async (t) => {
  const { db } = await setup(t);
  const first = await createMedicineBox(db, '家'); const second = await createMedicineBox(db, '外');
  await setMedicineBoxTag(db, first, 'AABB'); await setMedicineBoxTag(db, second, 'CCDD');
  const medication = await saveMedication(db, input);
  await assignMedicineBox(db, medication.id, first);
  const payload = await deviceQrPayload(db);
  await editMedication(db, medication.id, { ...input, boxId: String(second) }, now);
  await assert.rejects(confirmNfcDose(db, 'AABB', medication.id, day, new AbortController().signal, now), /対象ではありません/);
  const record = await confirmNfcDose(db, 'CCDD', medication.id, day, new AbortController().signal, now);
  assert.equal(record.recorded, true);
  assert.equal(await deviceQrPayload(db), payload);
});

test('another device QR and old medication QR cannot record a dose', async (t) => {
  const { db } = await setup(t); const { db: other } = await setup(t);
  const medication = await saveMedication(db, input);
  const payload = await deviceQrPayload(db); const otherPayload = await deviceQrPayload(other);
  assert.notEqual(payload, otherPayload);
  await assert.rejects(confirmQrDose(db, medication.id, day, otherPayload, now), /この端末/);
  const legacy = await db.getFirstAsync('SELECT qr_token FROM medication_details WHERE medication_id = ?', medication.id);
  await assert.rejects(confirmQrDose(db, medication.id, day, 'nomupay:medication:v1:' + legacy.qr_token, now), /この端末/);
  assert.deepEqual(await listDoseRecordsForDay(db, day), []);
  await confirmQrDose(db, medication.id, day, payload, now);
  assert.equal((await listDoseRecordsForDay(db, day)).length, 1);
});

test('legacy NFC box migrates once and later assignments are not overwritten on restart', async (t) => {
  const { db } = await setup(t);
  const medication = await saveMedication(db, input);
  await db.execAsync(`CREATE TABLE nfc_box (id INTEGER PRIMARY KEY, tag_uid TEXT, updated_at TEXT);
    CREATE TABLE nfc_box_medications (medication_id INTEGER PRIMARY KEY);
    INSERT INTO nfc_box VALUES (1, 'ABCD', '2026-10-18');`);
  await db.runAsync('INSERT INTO nfc_box_medications VALUES (?)', medication.id);
  await initializeMedicationDatabase(db);
  let boxes = await listMedicineBoxes(db);
  assert.equal(boxes.length, 1); assert.equal(boxes[0].tagId, 'ABCD');
  assert.equal(boxes[0].medications[0].id, medication.id);
  const second = await createMedicineBox(db, '新しい薬箱');
  await assignMedicineBox(db, medication.id, second);
  await initializeMedicationDatabase(db);
  boxes = await listMedicineBoxes(db);
  assert.equal(boxes.length, 2); assert.equal(boxes[0].medications.length, 0);
  assert.equal(boxes[1].medications[0].id, medication.id);
});
