import { AppNavigation } from '@/components/app-navigation';
import { PaymentSetupProvider } from '@/state/payment-setup-context';
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
            <PaymentSetupProvider>
              <PenaltyProvider>
                <AppNavigation />
              </PenaltyProvider>
            </PaymentSetupProvider>
          </ReminderProvider>
        </NfcBoxProvider>
      </DoseRecordProvider>
    </MedicationRegistryProvider>
  );
}
