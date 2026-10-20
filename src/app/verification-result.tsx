import VerificationEntryScreen from '@/features/verification/verification-entry-screen';

// This route deliberately cannot render a scanner, even if a schedule changes
// while the notification's initial DB check is in flight.
export default function VerificationResultScreen() {
  return <VerificationEntryScreen allowReader={false} />;
}
