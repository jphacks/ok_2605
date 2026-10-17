import { Stack } from 'expo-router';
import { MedicationProvider } from '@/state/medication-context';
import { MedicationRegistryProvider } from '@/state/medication-registry-context';

export default function RootLayout() {
  return (
    <MedicationProvider>
      <MedicationRegistryProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </MedicationRegistryProvider>
    </MedicationProvider>
  );
}
