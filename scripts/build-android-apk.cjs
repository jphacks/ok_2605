const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { loadCredentials } = require('./android-credentials.cjs');

function validateWorkspace(root, workspace) {
  const build = path.join(root, 'build');
  if (path.dirname(workspace) !== build || !path.basename(workspace).startsWith('apk-')) throw new Error('APK作業フォルダーはプロジェクトの build/apk-* 内に限定してください。');
  for (const directory of [build, workspace]) {
    if (fs.lstatSync(directory, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('APK作業フォルダーのシンボリックリンクは使用できません。');
  }
}

function selectWorkspace(root) {
  const build = path.join(root, 'build');
  const candidates = fs.existsSync(build) ? fs.readdirSync(build, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('apk-'))
    .map((entry) => path.join(build, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, 'android/app/build/outputs/apk/release/app-release.apk'))) : [];
  candidates.sort((a, b) => fs.statSync(path.join(b, 'android/app/build/outputs/apk/release/app-release.apk')).mtimeMs
    - fs.statSync(path.join(a, 'android/app/build/outputs/apk/release/app-release.apk')).mtimeMs);
  const selected = candidates[0] ?? path.join(build, 'apk-workspace');
  validateWorkspace(root, selected);
  return selected;
}

function prepareWorkspace(root, workspace) {
  validateWorkspace(root, workspace);
  fs.mkdirSync(workspace, { recursive: true });
  for (const directory of ['src', 'assets', 'plugins', 'modules']) {
    const target = path.join(workspace, directory);
    if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`作業コピーの ${directory} がリンクになっています。上書きしません。`);
    // Replace only these owned source copies. Never copy dependencies, recursive
    // build directories, credentials, or root android/ios projects.
    fs.rmSync(target, { recursive: true, force: true });
    if (fs.existsSync(path.join(root, directory))) fs.cpSync(path.join(root, directory), target, {
      recursive: true, filter: (source) => !['build', '.gradle', '.cxx', 'node_modules'].includes(path.basename(source)),
    });
  }
  for (const file of ['app.json', 'app.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'babel.config.js', 'babel.config.cjs', 'expo-env.d.ts']) {
    const source = path.join(root, file);
    const target = path.join(workspace, file);
    if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('作業コピーの設定ファイルがリンクになっています。上書きしません。');
    if (fs.existsSync(source)) fs.copyFileSync(source, target);
    else if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  const dependencyLink = path.join(workspace, 'node_modules');
  if (!fs.existsSync(dependencyLink)) fs.symlinkSync(path.join(root, 'node_modules'), dependencyLink, 'dir');
  if (fs.realpathSync(dependencyLink) !== fs.realpathSync(path.join(root, 'node_modules'))) throw new Error('作業フォルダーのnode_modulesがプロジェクトと異なります。');
  const dependencies = JSON.stringify(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(workspace, 'metro.config.js'), `const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.maxWorkers = 1;
config.watchFolders = [${dependencies}];
config.resolver.nodeModulesPaths = [${dependencies}];
module.exports = config;
`);
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('APKビルドに失敗しました。既存のdistのAPKは更新していません。直前のログを確認してください。');
}

function main() {
  const root = path.resolve(__dirname, '..');
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('npm run apk:build でNode.js 24を使用してください。');
  loadCredentials(root); // Never generate/replace an update-signing key implicitly.
  const architectures = process.env.ANDROID_ABIS || 'arm64-v8a';
  if (!architectures.split(',').every((abi) => ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(abi))) throw new Error('ANDROID_ABIS のCPU形式を確認してください。');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Library/Android/sdk');
  if (!fs.existsSync(sdk)) throw new Error('Android SDKがありません。ANDROID_HOMEを設定してください。');
  const javaHome = process.env.JAVA_HOME || (process.platform === 'darwin'
    ? spawnSync('/usr/libexec/java_home', ['-v', '17'], { encoding: 'utf8' }).stdout?.trim() : '');
  if (!javaHome || !fs.existsSync(path.join(javaHome, 'bin/java'))) throw new Error('JDK 17をインストールし、JAVA_HOMEを設定してください。');
  const disk = fs.statfsSync(root, { bigint: true });
  const available = Number(disk.bavail * disk.bsize) / 1024 ** 3;
  if (available < 6) throw new Error(`空き容量が約${available.toFixed(1)}GBです。ローカルビルドには少なくとも6GB確保してください。ファイルは自動削除しません。`);
  const workspace = selectWorkspace(root);
  process.stdout.write(`作業フォルダーを再利用: ${path.relative(root, workspace)}\n空き容量: 約${available.toFixed(1)}GB / 並列数: 1 / CPU: ${architectures}\n`);
  prepareWorkspace(root, workspace);
  const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`,
    NOMUPAY_ANDROID_CREDENTIALS: path.join(root, 'credentials.json'), APP_VARIANT: 'preview',
    EAS_BUILD: 'false', EAS_BUILD_PLATFORM: 'android', GRADLE_USER_HOME: path.join(root, 'build/gradle-cache'),
    CI: '1', NODE_ENV: 'production', NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=1024', CMAKE_BUILD_PARALLEL_LEVEL: '1' };
  if (process.env.NOMUPAY_BUILD_OFFLINE === '1') env.EXPO_OFFLINE = '1';
  run(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-clean', '--no-install'], { cwd: workspace, env });
  run(path.join(workspace, 'android/gradlew'), ['--project-dir', path.join(workspace, 'android'),
    'app:assembleRelease', '-x', 'test', '-x', 'lint', '--no-daemon', '--console=plain', '--build-cache', '--max-workers=1',
    `-PreactNativeArchitectures=${architectures}`, '-Pkotlin.compiler.execution.strategy=in-process', '-Dorg.gradle.parallel=false',
    '-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=512m',
    ...(process.env.NOMUPAY_BUILD_OFFLINE === '1' ? ['--offline'] : [])], { cwd: workspace, env });

  const apk = path.join(workspace, 'android/app/build/outputs/apk/release/app-release.apk');
  const tools = fs.readdirSync(path.join(sdk, 'build-tools')).filter((name) => /^\d+(\.\d+)+$/.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (!tools || !fs.existsSync(apk)) throw new Error('ビルド成果物またはAndroid build-toolsを確認できません。既存APKは更新していません。');
  run(path.join(sdk, 'build-tools', tools, 'apksigner'), ['verify', apk], { cwd: workspace, env });
  const manifest = spawnSync(path.join(sdk, 'build-tools', tools, 'aapt'), ['dump', 'badging', apk], { env, encoding: 'utf8' });
  const identity = manifest.stdout?.match(/^package: name='([^']+)' versionCode='(\d+)'/m);
  if (manifest.status !== 0 || identity?.[1] !== 'jp.jphacks.ok2605.preview' || Number(identity[2]) < 10) {
    throw new Error('配布版のアプリID・バージョンを確認できません。既存APKは更新していません。');
  }
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const output = path.join(dist, 'nomupay-android.apk');
  const staging = path.join(dist, '.nomupay-android.apk.tmp');
  fs.copyFileSync(apk, staging);
  fs.copyFileSync(staging, path.join(dist, `nomupay-android-v${identity[2]}.apk`));
  fs.renameSync(staging, output);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
  process.stdout.write(`\n配布用APK: ${output}\nアプリID: ${identity[1]} / versionCode: ${identity[2]}\nSHA-256: ${digest}\n署名鍵・credentials.jsonは配布しないでください。\n`);
}

module.exports = { selectWorkspace, validateWorkspace, prepareWorkspace };
if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
