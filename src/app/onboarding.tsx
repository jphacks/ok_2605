import { ActivityIndicator } from 'react-native';
import { BoxRegistrationForm } from '@/components/box-registration-form';
import { DummyCardForm } from '@/components/dummy-card-form';
import { usePaymentSetup } from '@/state/payment-setup-context';

export default function OnboardingScreen() {
  const { setup, refresh } = usePaymentSetup();
  if (!setup) return <ActivityIndicator />;
  if (setup.step === 'box') return <BoxRegistrationForm onNext={refresh} />;
  if (setup.step === 'box-tag') return <BoxRegistrationForm initialBoxId={setup.boxId!} onNext={refresh} />;
  if (setup.step === 'card') return <DummyCardForm onboarding />;
  return <ActivityIndicator />;
}
