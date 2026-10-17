import { Stack } from 'expo-router';
import { MedicationRegistryProvider } from '@/state/medication-registry-context';
import { DoseRecordProvider } from '@/state/dose-record-context';
import { ReminderProvider } from '@/state/reminder-context';

export default function RootLayout() {
  return (
    <MedicationRegistryProvider>
      <DoseRecordProvider>
        <ReminderProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ReminderProvider>
      </DoseRecordProvider>
    </MedicationRegistryProvider>
  );
}
