import { Redirect, useLocalSearchParams } from 'expo-router';

import NfcDoseConfirmationScreen from '../nfc/nfc-dose-confirmation.android';

export default function AndroidVerificationScreen() {
  const { medicationId, scheduledDay } = useLocalSearchParams<{ medicationId?: string; scheduledDay?: string }>();
  return medicationId
    ? <NfcDoseConfirmationScreen key={`${medicationId}:${scheduledDay}`} />
    : <Redirect href="/boxes" />;
}
