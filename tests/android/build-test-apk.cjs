// Build a separate instrumentation APK; NEVER ship it in dist or run on a user's phone.
// Usage: node tests/android/build-test-apk.cjs <existing empty build directory>
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createDatabase } = require('../helpers/database.cjs');
const { initializeMedicationDatabase } = require('../../src/features/medications/medication-schema.ts');

async function main() {
  const out = path.resolve(process.argv[2]);
  if (!fs.statSync(out).isDirectory() || fs.readdirSync(out).length) throw Error('Use an existing empty temporary directory');
  const sdk = process.env.ANDROID_HOME;
  const java = process.env.JAVA_HOME;
  if (!sdk || !java) throw Error('Set ANDROID_HOME and JAVA_HOME');
  const tools = path.join(sdk, 'build-tools/36.0.0');
  const android = path.join(sdk, 'platforms/android-36/android.jar');
  const root = path.resolve(__dirname, '../..');
  const credentials = JSON.parse(fs.readFileSync(path.join(root, 'credentials.json'), 'utf8')).android.keystore;
  const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { cwd: out, encoding: 'utf8', ...options });
    if (result.status !== 0) throw Error(`${path.basename(command)} failed\n${result.stdout}\n${result.stderr}`);
  };
  fs.mkdirSync(path.join(out, 'assets')); fs.mkdirSync(path.join(out, 'classes')); fs.mkdirSync(path.join(out, 'dex'));
  const fixture = createDatabase(path.join(out, 'assets/fixture.db'));
  try { await initializeMedicationDatabase(fixture.db); } finally { fixture.close(); }
  run(path.join(java, 'bin/javac'), ['-source', '8', '-target', '8', '-classpath', android, '-d', path.join(out, 'classes'), path.join(__dirname, 'NotificationAlarmTest.java')]);
  run(path.join(tools, 'd8'), ['--lib', android, '--output', path.join(out, 'dex'), path.join(out, 'classes/jp/jphacks/reminders/tests/NotificationAlarmTest.class')], { env: { ...process.env, JAVA_HOME: java } });
  run(path.join(tools, 'aapt'), ['package', '-f', '-M', path.join(__dirname, 'AndroidManifest.xml'), '-I', android, '-A', path.join(out, 'assets'), '-F', path.join(out, 'test.apk')]);
  run(path.join(tools, 'aapt'), ['add', path.join(out, 'test.apk'), 'classes.dex'], { cwd: path.join(out, 'dex') });
  // Secrets stay in environment variables, never in terminal command arguments/output.
  run(path.join(tools, 'apksigner'), ['sign', '--ks', path.resolve(root, credentials.keystorePath), '--ks-key-alias', credentials.keyAlias,
    '--ks-pass', 'env:NOMUPAY_TEST_STORE_PASSWORD', '--key-pass', 'env:NOMUPAY_TEST_KEY_PASSWORD', path.join(out, 'test.apk')], {
    env: { ...process.env, JAVA_HOME: java, NOMUPAY_TEST_STORE_PASSWORD: credentials.keystorePassword, NOMUPAY_TEST_KEY_PASSWORD: credentials.keyPassword },
  });
  process.stdout.write(`${path.join(out, 'test.apk')}\n`);
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
