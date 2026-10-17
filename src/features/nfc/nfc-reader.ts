import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type NfcAvailability =
  | { kind: 'ready' }
  | { kind: 'disabled' }
  | { kind: 'preview'; reason: 'expo-go' | 'simulator' | 'ios' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export type NfcReadResult = {
  tagId: string;
  technology: string;
};

const ANDROID_TECH_NAMES = [
  'Ndef',
  'IsoDep',
  'NfcA',
  'NfcB',
  'NfcF',
  'NfcV',
  'MifareClassic',
  'MifareUltralight',
] as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isExpoGo() {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export async function checkNfcAvailability(): Promise<NfcAvailability> {
  if (Platform.OS !== 'android') return { kind: 'preview', reason: 'ios' };
  if (isExpoGo()) return { kind: 'preview', reason: 'expo-go' };
  if (!Device.isDevice) return { kind: 'preview', reason: 'simulator' };

  try {
    const { default: NfcManager } = await import('react-native-nfc-manager');
    const supported = await NfcManager.isSupported();
    if (!supported) return { kind: 'unsupported' };
    await NfcManager.start();
    const enabled = await NfcManager.isEnabled();
    return enabled ? { kind: 'ready' } : { kind: 'disabled' };
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) };
  }
}

export async function readNfcTag(): Promise<NfcReadResult> {
  const { default: NfcManager, NfcTech } = await import('react-native-nfc-manager');
  await NfcManager.start();

  const technologies = ANDROID_TECH_NAMES.map((name) => NfcTech[name]);
  try {
    const technology = await NfcManager.requestTechnology(technologies, {
      alertMessage: '薬箱のNFCタグにスマートフォンを近づけてください',
    });
    const tag = await NfcManager.getTag();
    const tagId = tag?.id ?? tag?.idm ?? technology;
    if (!tagId) throw new Error('NFCタグの識別情報を取得できませんでした。');
    return { tagId, technology: technology ?? 'NFC' };
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}

export async function cancelNfcRead() {
  if (Platform.OS !== 'android' || isExpoGo()) return;
  const { default: NfcManager } = await import('react-native-nfc-manager');
  await NfcManager.cancelTechnologyRequest().catch(() => undefined);
}

export async function openAndroidNfcSettings() {
  if (Platform.OS !== 'android' || isExpoGo()) return;
  const { default: NfcManager } = await import('react-native-nfc-manager');
  await NfcManager.goToNfcSetting();
}
