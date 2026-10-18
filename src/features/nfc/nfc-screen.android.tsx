import { Redirect } from 'expo-router';

// Retain the old entry point while all box registration lives in the 薬箱 tab.
export default function NfcScreen() {
  return <Redirect href="/boxes" />;
}
