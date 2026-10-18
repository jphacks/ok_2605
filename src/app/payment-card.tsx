import { DummyCardForm } from '@/components/dummy-card-form';
import { ActivityIndicator } from 'react-native';
import { usePaymentSetup } from '@/state/payment-setup-context';

export default function PaymentCardScreen() {
  const { setup } = usePaymentSetup();
  if (setup?.step !== 'complete') return <ActivityIndicator />;
  return <DummyCardForm />;
}
