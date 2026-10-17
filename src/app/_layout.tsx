import { Stack } from 'expo-router';
import { MedicationProvider } from '@/state/medication-context';
import { MedicationRegistryProvider } from '@/state/medication-registry-context';
import { ReminderProvider } from '@/state/reminder-context';

export default function RootLayout() {
  return (
    <MedicationProvider>
      <MedicationRegistryProvider>
        <ReminderProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ReminderProvider>
      </MedicationRegistryProvider>
    </MedicationProvider>
  );
}
