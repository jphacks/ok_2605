// Local demo contract only. Production QR identifiers and schedules are not defined yet.
export const DEMO_QR_PAYLOAD = 'nomupay:demo:morning';
export type MedicationState = { taken: boolean };
export type MedicationAction = { type: 'scan'; payload: string };
export const initialMedicationState: MedicationState = { taken: false };

export function medicationReducer(state: MedicationState, action: MedicationAction): MedicationState {
  if (action.type !== 'scan' || action.payload !== DEMO_QR_PAYLOAD || state.taken) return state;
  return { taken: true };
}
