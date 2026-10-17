export class NfcReadError extends Error {
  constructor(message: string, readonly code: 'cancelled' | 'disabled' | 'unavailable' | 'timeout' | 'invalid') {
    super(message);
    this.name = 'NfcReadError';
  }
}

let reading = false;

export function normalizeTagId(id: string | undefined): string {
  const normalized = (id ?? '').replace(/[\s:-]/g, '').toUpperCase();
  if (!/^(?:[0-9A-F]{2}){1,32}$/.test(normalized)) {
    throw new NfcReadError('このタグには登録に使えるIDがありません。別のNFCタグをお試しください。', 'invalid');
  }
  return normalized;
}

// Imported only after a user starts scanning, so an old development build can show a rebuild message.
async function loadManager() {
  try {
    return await import('react-native-nfc-manager');
  } catch {
    throw new NfcReadError('NFC対応の開発用アプリを再ビルドしてインストールしてください。', 'unavailable');
  }
}

export async function openNfcSettings(): Promise<void> {
  const { default: manager } = await loadManager();
  await manager.goToNfcSetting();
}

export async function readNfcTag(signal: AbortSignal): Promise<string> {
  if (reading) throw new Error('NFCの読み取りを終了してからお試しください。');
  reading = true;
  const checkCancelled = () => {
    if (signal.aborted) throw new NfcReadError('読み取りを中止しました。', 'cancelled');
  };
  try {
    checkCancelled();
    const { default: manager, NfcEvents, NfcAdapter } = await loadManager();
    if (!await manager.isSupported()) throw new NfcReadError('この端末はNFC読み取りに対応していません。', 'unavailable');
    await manager.start();
    checkCancelled();
    if (!await manager.isEnabled()) throw new NfcReadError('Androidの設定でNFCをオンにしてください。', 'disabled');
    checkCancelled();

    type Outcome = { id: string } | { error: Error };
    let finish!: (outcome: Outcome) => void;
    const discovered = new Promise<Outcome>((resolve) => { finish = resolve; });
    const onAbort = () => finish({ error: new NfcReadError('読み取りを中止しました。', 'cancelled') });
    const timeout = setTimeout(() => finish({ error: new NfcReadError('タグを読み取れませんでした。もう一度お試しください。', 'timeout') }), 60000);
    manager.setEventListener(NfcEvents.DiscoverTag, (tag) => {
      try { finish({ id: normalizeTagId(tag.id) }); }
      catch (error) { finish({ error: error instanceof Error ? error : new Error('タグを読み取れませんでした。') }); }
    });
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      checkCancelled();
      await manager.registerTagEvent({
        isReaderModeEnabled: true,
        readerModeFlags: NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B
          | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V
          | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
      });
      const outcome = await discovered;
      checkCancelled();
      if ('error' in outcome) throw outcome.error;
      return outcome.id;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      manager.setEventListener(NfcEvents.DiscoverTag, null);
      await manager.unregisterTagEvent().catch(() => undefined);
    }
  } finally {
    reading = false;
  }
}
