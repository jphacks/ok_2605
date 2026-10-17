import { Stack } from 'expo-router';
import { MedicationProvider } from '@/state/medication-context';

export default function RootLayout() {
  return <MedicationProvider><Stack screenOptions={{ headerShown: false }} /></MedicationProvider>;
}
