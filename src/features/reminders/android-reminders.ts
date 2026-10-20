import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type AndroidReminders = {
  exactAlarmsAllowed: () => Promise<boolean>;
  openExactAlarmSettings: () => Promise<void>;
};

function nativeReminders() {
  const native = requireOptionalNativeModule<AndroidReminders>('NomupayReminders');
  if (!native) throw new Error('アラーム権限の確認に対応した新しいAPKをインストールしてください。');
  return native;
}

export async function exactAlarmsAllowed(): Promise<boolean> {
  return Platform.OS !== 'android' || nativeReminders().exactAlarmsAllowed();
}

export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS === 'android') await nativeReminders().openExactAlarmSettings();
}

