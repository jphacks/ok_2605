// Local demo contract only. Production tag identifiers and schedules are not defined yet.
export const DEMO_QR_PAYLOAD = 'nomupay:demo:morning';
export type MedicationState = { taken: boolean };
export type MedicationAction =
  | { type: 'scan'; payload: string }
  | { type: 'confirm-with-nfc'; tagId: string };
export const initialMedicationState: MedicationState = { taken: false };

export function medicationReducer(state: MedicationState, action: MedicationAction): MedicationState {
  if (state.taken) return state;
  if (action.type === 'scan' && action.payload === DEMO_QR_PAYLOAD) return { taken: true };
  if (action.type === 'confirm-with-nfc' && action.tagId.trim().length > 0) return { taken: true };
  return state;
}
