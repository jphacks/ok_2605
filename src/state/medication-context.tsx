import { createContext, useContext, useReducer, type Dispatch, type PropsWithChildren } from 'react';

import { initialMedicationState, medicationReducer, type MedicationAction, type MedicationState } from './medication-state';

const MedicationContext = createContext<{
  state: MedicationState;
  dispatch: Dispatch<MedicationAction>;
} | null>(null);

export function MedicationProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(medicationReducer, initialMedicationState);
  return <MedicationContext.Provider value={{ state, dispatch }}>{children}</MedicationContext.Provider>;
}

export function useMedication() {
  const context = useContext(MedicationContext);
  if (!context) throw new Error('MedicationProvider is required');
  return context;
}
