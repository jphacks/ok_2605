const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function loadCredentials(root = path.resolve(__dirname, '..')) {
  const file = path.join(root, 'credentials.json');
  if (!fs.existsSync(file)) throw new Error('署名情報がありません。既存の配布版を更新する場合は署名情報を復元してください。新規作成時のみ npm run apk:credentials を実行してください。');
  let key;
  try { key = JSON.parse(fs.readFileSync(file, 'utf8')).android?.keystore; }
  catch { throw new Error('credentials.json を読み込めません。署名情報のバックアップを確認してください。'); }
  if (!key || !['keystorePath', 'keystorePassword', 'keyAlias'].every((field) => typeof key[field] === 'string' && key[field])) {
    throw new Error('credentials.json のAndroid署名設定を確認してください。');
  }
  if (!fs.existsSync(path.resolve(root, key.keystorePath))) throw new Error('署名鍵が見つかりません。バックアップから復元してください。新しい鍵への置き換えは行いません。');
  return key;
}

function initialize(root = path.resolve(__dirname, '..')) {
  const credentialsFile = path.join(root, 'credentials.json');
  const directory = path.join(root, '.android-signing');
  const keyFile = path.join(directory, 'nomupay-release.p12');
  if (fs.existsSync(credentialsFile)) { loadCredentials(root); process.stdout.write('既存の配布用署名鍵を使用します。\n'); return; }
  if (fs.existsSync(keyFile)) throw new Error('既存の署名鍵があります。credentials.json をバックアップから復元してください。上書きしません。');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const password = crypto.randomBytes(32).toString('hex');
  const command = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'keytool') : 'keytool';
  const result = spawnSync(command, ['-genkeypair', '-noprompt', '-storetype', 'PKCS12', '-keystore', keyFile,
    '-alias', 'nomupay-release', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
    '-dname', 'CN=Nomupay Android Distribution', '-storepass:env', 'NOMUPAY_KEY_PASSWORD', '-keypass:env', 'NOMUPAY_KEY_PASSWORD'],
  { env: { ...process.env, NOMUPAY_KEY_PASSWORD: password }, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('署名鍵を作成できませんでした。JDK 17とkeytoolを確認してください。');
  fs.chmodSync(keyFile, 0o600);
  fs.writeFileSync(credentialsFile, JSON.stringify({ android: { keystore: {
    keystorePath: '.android-signing/nomupay-release.p12', keystorePassword: password,
    keyAlias: 'nomupay-release', keyPassword: password,
  } } }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  process.stdout.write('配布用署名鍵を作成しました。credentials.json と .android-signing/ を非公開でバックアップしてください。\n');
}

module.exports = { loadCredentials, initialize };
if (require.main === module) {
  try { initialize(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
