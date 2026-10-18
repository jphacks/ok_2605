import { Stack } from 'expo-router';
import { MedicationRegistryProvider } from '@/state/medication-registry-context';
import { DoseRecordProvider } from '@/state/dose-record-context';
import { ReminderProvider } from '@/state/reminder-context';
import { NfcBoxProvider } from '@/state/nfc-box-context';
import { PenaltyProvider } from '@/state/penalty-context';

export default function RootLayout() {
  return (
    <MedicationRegistryProvider>
      <DoseRecordProvider>
        <NfcBoxProvider>
          <ReminderProvider>
            <PenaltyProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </PenaltyProvider>
          </ReminderProvider>
        </NfcBoxProvider>
      </DoseRecordProvider>
    </MedicationRegistryProvider>
  );
}
