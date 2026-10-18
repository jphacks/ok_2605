const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDatabase } = require('./helpers/database.cjs');
const { initializeMedicationDatabase, saveMedication, saveMedicationPlan } = require('../src/features/medications/medication-repository.ts');
const { createMedicineBox, assignMedicineBox, setMedicineBoxTag, deviceQrPayload } = require('../src/features/boxes/medicine-box-repository.ts');
const { confirmNfcDose, loadNfcBox } = require('../src/features/nfc/nfc-box-repository.ts');
const { confirmQrDose } = require('../src/features/verification/qr-confirmation.ts');
const { listDoseRecordsForDay, saveDoseRecord } = require('../src/features/medications/dose-record-repository.ts');
const { inTransaction } = require('../src/features/medications/transaction.ts');
const day = '2026-10-18';
const now = new Date(2026, 9, 18, 8, 10);
async function setup(t) {
  const connection = createDatabase(); t.after(connection.close);
  const { db } = connection;
  await initializeMedicationDatabase(db);
  const box = await createMedicineBox(db, '家');
  const other = await createMedicineBox(db, '外');
  await setMedicineBoxTag(db, box, 'AABB');
  const meds = [];
  for (let i = 0; i < 4; i++) {
    const med = await saveMedication(db, { name: `薬${i}`, doseTime: i === 3 ? '08:05' : '08:00', penaltyAmount: '100' });
    await assignMedicineBox(db, med.id, i === 2 ? other : box);
    meds.push(med);
  }
  return { db, meds, box };
}
for (const method of ['qr', 'nfc']) {
  async function confirm(db, id) {
    return method === 'qr' ? confirmQrDose(db, id, day, await deviceQrPayload(db), now)
      : confirmNfcDose(db, 'AABB', id, day, new AbortController().signal, now);
  }
  test(`${method}: one confirmation records both unrecorded medicines`, async (t) => {
    const { db, meds } = await setup(t);
    await confirm(db, meds[0].id);
    const rows = await listDoseRecordsForDay(db, day);
    assert.deepEqual(rows.map((row) => row.medicationId), [meds[0].id, meds[1].id]);
    assert.ok(rows.every((row) => row.takenAt === now.toISOString() && row.source === method));
  });
  test(`${method}: same box/time records together, other boxes/times stay untouched and repeats are idempotent`, async (t) => {
    const { db, meds } = await setup(t);
    await saveDoseRecord(db, meds[0].id, day, method, new Date(2026, 9, 18, 8, 1).toISOString());
    await Promise.all([confirm(db, meds[1].id), confirm(db, meds[1].id)]);
    const rows = await listDoseRecordsForDay(db, day);
    assert.deepEqual(rows.map((row) => row.medicationId), [meds[0].id, meds[1].id]);
    assert.equal(rows[0].takenAt, new Date(2026, 9, 18, 8, 1).toISOString());
  });
  test(`${method}: a failure on the second medicine rolls back the entire group`, async (t) => {
    const { db, meds } = await setup(t);
    await db.execAsync(`CREATE TRIGGER fail_second BEFORE INSERT ON dose_records WHEN NEW.medication_id = ${meds[1].id} BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
    await assert.rejects(confirm(db, meds[0].id), /test failure/);
    assert.deepEqual(await listDoseRecordsForDay(db, day), []);
  });
  test(`${method}: expired and inactive group members are excluded`, async (t) => {
    const { db, meds } = await setup(t);
    await db.runAsync('UPDATE medication_groups SET is_plan = 1, starts_on = ?, grace_minutes = 5 WHERE id = ?', day, meds[1].id);
    await db.runAsync('UPDATE medications SET dose_time = ? WHERE id = ?', '08:00', meds[3].id);
    await db.runAsync('UPDATE medication_groups SET is_plan = 1, starts_on = ? WHERE id = ?', '2026-10-19', meds[3].id);
    await confirm(db, meds[0].id);
    assert.deepEqual((await listDoseRecordsForDay(db, day)).map((row) => row.medicationId), [meds[0].id]);
  });
}

test('box snapshot waits for queued registration and never reads the parent connection during an exclusive write', async (t) => {
  const { db, box } = await setup(t);
  await loadNfcBox(db, now);
  let writing = false;
  const original = db.withExclusiveTransactionAsync;
  // Model the native exclusive connection: parent reads cannot run during its write.
  const native = { ...db };
  db.withExclusiveTransactionAsync = (task) => original(async () => {
    writing = true;
    try { return await task(native); } finally { writing = false; }
  });
  const read = db.getAllAsync;
  db.getAllAsync = async (...args) => {
    if (writing) throw new Error('database is locked');
    return read(...args);
  };
  const input = { name: '追加薬', doses: [{ doseTime: '08:00', doseAmount: '1' }], penaltyAmount: '100', inventory: '', unit: '錠', memo: '', startDay: day, endDay: null, notificationsEnabled: true, graceMinutes: 30, graceBeforeMinutes: 0, boxId: String(box) };
  const [saved, snapshot] = await Promise.all([saveMedicationPlan(db, input), loadNfcBox(db, now)]);
  assert.ok(snapshot.boxes.find((item) => item.id === box).medications.some((item) => item.id === saved[0].id));
  assert.equal(await inTransaction(db, async () => 'queue healthy'), 'queue healthy');
});
