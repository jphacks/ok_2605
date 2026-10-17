const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DEMO_QR_PAYLOAD, initialMedicationState, medicationReducer } = require('../src/state/medication-state.ts');

test('unrelated and malformed QR codes never record a dose', () => {
  for (const payload of ['', 'https://example.com', 'nomupay:demo:night', `${DEMO_QR_PAYLOAD} `]) {
    assert.equal(medicationReducer(initialMedicationState, { type: 'scan', payload }), initialMedicationState);
  }
});

test('the demo QR records once without mutating the initial state', () => {
  const action = { type: 'scan', payload: DEMO_QR_PAYLOAD };
  const recorded = medicationReducer(initialMedicationState, action);
  assert.equal(recorded.taken, true);
  assert.equal(initialMedicationState.taken, false);
  assert.equal(medicationReducer(recorded, action), recorded);
});
