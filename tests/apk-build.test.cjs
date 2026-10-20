const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { selectWorkspace, validateWorkspace, prepareWorkspace } = require('../scripts/build-android-apk.cjs');
const { loadCredentials, initialize } = require('../scripts/android-credentials.cjs');
const { patchSigning } = require('../plugins/with-android-release-signing');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomupay-apk-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, relative, content = '') {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

test('reuse the latest completed native workspace rather than growing a new directory', (t) => {
  const root = fixture(t);
  assert.equal(selectWorkspace(root), path.join(root, 'build/apk-workspace'));
  const first = write(root, 'build/apk-old/android/app/build/outputs/apk/release/app-release.apk');
  const second = write(root, 'build/apk-current/android/app/build/outputs/apk/release/app-release.apk');
  fs.utimesSync(first, 1, 1); fs.utimesSync(second, 2, 2);
  assert.equal(selectWorkspace(root), path.join(root, 'build/apk-current'));
});

test('copy only current source and local modules, retaining native caches and excluding secrets', (t) => {
  const root = fixture(t);
  const workspace = path.join(root, 'build/apk-workspace');
  write(root, 'node_modules/placeholder');
  write(root, 'src/new.ts', 'new source');
  write(root, 'modules/reminders/expo-module.config.json', '{}');
  write(root, 'modules/reminders/android/build/old-cache', 'do not copy');
  write(root, 'app.json', '{}');
  write(root, 'credentials.json', 'not for copying');
  write(root, 'build/apk-workspace/src/deleted.ts', 'stale');
  write(root, 'build/apk-workspace/modules/reminders/DeadlineSettlement.kt', 'obsolete');
  write(root, 'build/apk-workspace/android/app/build/cache', 'keep');
  prepareWorkspace(root, workspace);
  assert.equal(fs.readFileSync(path.join(workspace, 'src/new.ts'), 'utf8'), 'new source');
  assert.ok(!fs.existsSync(path.join(workspace, 'src/deleted.ts')));
  assert.ok(!fs.existsSync(path.join(workspace, 'modules/reminders/DeadlineSettlement.kt')));
  assert.ok(fs.existsSync(path.join(workspace, 'modules/reminders/expo-module.config.json')));
  assert.ok(!fs.existsSync(path.join(workspace, 'modules/reminders/android/build')));
  assert.ok(!fs.existsSync(path.join(workspace, 'credentials.json')));
  assert.equal(fs.readFileSync(path.join(workspace, 'android/app/build/cache'), 'utf8'), 'keep');
  assert.equal(fs.realpathSync(path.join(workspace, 'node_modules')), fs.realpathSync(path.join(root, 'node_modules')));
});

test('workspace cleanup refuses roots, arbitrary directories and symbolic-link targets', (t) => {
  const root = fixture(t);
  for (const directory of [root, path.join(root, 'build'), path.join(root, 'src'), path.join(root, 'build/other')]) {
    assert.throws(() => validateWorkspace(root, directory), /限定/);
  }
  fs.mkdirSync(path.join(root, 'build'));
  fs.mkdirSync(path.join(root, 'source'));
  fs.symlinkSync(path.join(root, 'source'), path.join(root, 'build/apk-link'), 'dir');
  assert.throws(() => prepareWorkspace(root, path.join(root, 'build/apk-link')), /シンボリックリンク/);
});

test('existing credentials are reused, never regenerated or logged', (t) => {
  const root = fixture(t);
  write(root, '.android-signing/existing.p12', 'existing key');
  const content = JSON.stringify({ android: { keystore: {
    keystorePath: '.android-signing/existing.p12', keystorePassword: 'fixture-secret', keyAlias: 'fixture',
  } } });
  write(root, 'credentials.json', content);
  assert.equal(loadCredentials(root).keyAlias, 'fixture');
  assert.equal(fs.readFileSync(path.join(root, 'credentials.json'), 'utf8'), content);
  fs.unlinkSync(path.join(root, '.android-signing/existing.p12'));
  assert.throws(() => loadCredentials(root), /置き換えは行いません/);
});

test('missing credentials beside an existing key are not silently replaced', (t) => {
  const root = fixture(t);
  write(root, '.android-signing/nomupay-release.p12', 'existing key');
  assert.throws(() => initialize(root), /上書きしません/);
  assert.ok(!fs.existsSync(path.join(root, 'credentials.json')));
});

test('release signing is repeatable and reads private values only at Gradle build time', () => {
  const patched = patchSigning('android { }\n');
  assert.equal(patchSigning(patched), patched);
  assert.equal((patched.match(/nomupay-release-signing:start/g) ?? []).length, 1);
  assert.match(patched, /System.getenv\('NOMUPAY_ANDROID_CREDENTIALS'\)/);
  assert.match(patched, /nomupayCredentialsFile.parentFile/);
  assert.doesNotMatch(patched, /fixture-secret/);
});
