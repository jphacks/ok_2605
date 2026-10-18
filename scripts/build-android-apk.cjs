const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadCredentials } = require('./android-credentials.cjs');

const root = path.resolve(__dirname, '..');
const workspace = path.join(root, 'build', 'apk-workspace');
const output = path.join(root, 'dist', 'nomupay-android.apk');
function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: workspace, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('APKビルドに失敗しました。直前のログを確認してください。');
}

try {
  loadCredentials();
  const architectures = process.env.ANDROID_ABIS || 'arm64-v8a';
  if (!architectures.split(',').every((abi) => ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(abi))) throw new Error('ANDROID_ABIS のCPU形式を確認してください。');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Library', 'Android', 'sdk');
  if (!fs.existsSync(sdk)) throw new Error('Android SDKがありません。ANDROID_HOMEを設定してください。');
  fs.mkdirSync(workspace, { recursive: true });
  // Generate only in this isolated directory, preserving the developer's android/ and ios/ projects.
  for (const directory of ['src', 'assets', 'plugins', 'scripts']) {
    fs.rmSync(path.join(workspace, directory), { recursive: true, force: true });
    fs.cpSync(path.join(root, directory), path.join(workspace, directory), { recursive: true });
  }
  for (const file of ['app.json', 'app.config.ts', 'eas.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'babel.config.js', 'babel.config.cjs', 'expo-env.d.ts']) {
    if (fs.existsSync(path.join(root, file))) fs.copyFileSync(path.join(root, file), path.join(workspace, file));
  }
  for (const directory of ['node_modules', '.android-signing']) {
    const target = path.join(workspace, directory);
    if (!fs.existsSync(target)) fs.symlinkSync(path.join(root, directory), target, 'dir');
  }
  fs.writeFileSync(path.join(workspace, 'credentials.json'), fs.readFileSync(path.join(root, 'credentials.json')), { mode: 0o600 });
  fs.chmodSync(path.join(workspace, 'credentials.json'), 0o600);
  const modules = JSON.stringify(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(workspace, 'metro.config.js'), `const { getDefaultConfig } = require('expo/metro-config');\nconst config = getDefaultConfig(__dirname);\nconfig.watchFolders = [${modules}];\nconfig.resolver.nodeModulesPaths = [${modules}];\nmodule.exports = config;\n`);
  const env = { ...process.env, APP_VARIANT: 'preview', EAS_BUILD: 'false', EAS_BUILD_PLATFORM: 'android', ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk, GRADLE_USER_HOME: path.join(root, 'build', 'gradle-cache'), CI: '1' };
  run(process.execPath, [path.join(root, 'node_modules', 'expo', 'bin', 'cli'), 'prebuild', '--platform', 'android', '--no-install'], env);
  run(path.join(workspace, 'android', 'gradlew'), ['--project-dir', path.join(workspace, 'android'),
    'app:assembleRelease', '-x', 'test', '-x', 'lint', '--console=plain', '--build-cache', '--max-workers=2',
    `-PreactNativeArchitectures=${architectures}`,
    '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m'], env);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(path.join(workspace, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), output);
  process.stdout.write(`\n配布用APK: ${output}\nこのAPKだけを配布してください。署名鍵・credentials.jsonは配布しません。\n`);
} catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
