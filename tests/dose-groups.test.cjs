const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildDailySchedule } = require('../src/features/medications/dose-record.ts');
const { groupScheduledDoses, nextScheduledDoseGroup } = require('../src/features/medications/dose-groups.ts');
const now = new Date(2026, 9, 18, 8, 5);
const medications = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: `薬${id}`, doseTime: id === 6 ? '09:00' : '08:00', penaltyAmount: 100, createdAt: now.toISOString() }));
const boxes = [{ id: 1, name: '朝', medications: [medications[0], medications[1], medications[5]] }, { id: 2, name: '朝', medications: [medications[2]] }];

test('groups only the same day, time and box; unassigned medicines stay separate', () => {
  const schedule = buildDailySchedule(medications, [], now);
  const groups = groupScheduledDoses(schedule, boxes);
  assert.deepEqual(groups.map((group) => group.items.map((item) => item.medication.id)), [[1, 2], [3], [4], [5], [6]]);
  assert.equal(groupScheduledDoses([schedule[0], { ...schedule[0], scheduledDay: '2026-10-19' }], boxes).length, 2);
});

test('next group excludes recorded medicines and keeps the remaining recording target', () => {
  const records = [{ id: 1, medicationId: 1, scheduledDay: '2026-10-18', takenAt: now.toISOString(), source: 'qr' }];
  const schedule = buildDailySchedule(medications, records, now);
  const next = nextScheduledDoseGroup(schedule, medications, boxes, now);
  assert.equal(next.medication.id, 2);
  assert.deepEqual(next.medications.map((medication) => medication.id), [2]);
  assert.deepEqual(groupScheduledDoses(schedule, boxes)[0].items.map((item) => item.status), ['taken', 'due']);
});

test('next group handles tomorrow and respects active dates', () => {
  const meds = medications.slice(0, 2);
  const records = meds.map((medication) => ({ id: medication.id, medicationId: medication.id, scheduledDay: '2026-10-18', takenAt: now.toISOString(), source: 'qr' }));
  const schedule = buildDailySchedule(meds, records, now);
  const next = nextScheduledDoseGroup(schedule, meds, boxes, now);
  assert.equal(next.day, '2026-10-19');
  assert.equal(next.medications.length, 2);
  const future = [meds[0], { ...meds[1], activeStartDay: '2026-10-25' }];
  assert.equal(nextScheduledDoseGroup(schedule, future, boxes, now).medications.length, 1);
  assert.equal(nextScheduledDoseGroup([], [], boxes, now), null);
});

test('next group does not restore expired doses filtered from the actionable schedule', () => {
  const schedule = buildDailySchedule(medications, [], now).filter((item) => item.medication.id !== 1);
  const next = nextScheduledDoseGroup(schedule, medications, boxes, now);
  assert.deepEqual(next.medications.map((medication) => medication.id), [2]);
});
