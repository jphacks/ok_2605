const { withAppBuildGradle } = require('expo/config-plugins');

// EAS injects its signing configuration. Local CNG builds read the same credentials format.
module.exports = (config) => {
  if (process.env.EAS_BUILD === 'true') return config;
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('Android signing requires a Groovy app build.gradle.');
    const marker = '// nomupay-release-signing';
    const clean = mod.modResults.contents.replace(/\n\/\/ nomupay-release-signing:start[\s\S]*?\/\/ nomupay-release-signing:end\n?/g, '\n');
    mod.modResults.contents = `${clean}\n${marker}:start
def nomupayCredentialsFile = rootProject.file('../credentials.json')
if (!nomupayCredentialsFile.exists()) {
    throw new GradleException('Run npm run apk:credentials before building a distribution APK.')
}
def nomupayKey = new groovy.json.JsonSlurper().parse(nomupayCredentialsFile).android.keystore
def nomupayKeyFile = new File(nomupayKey.keystorePath)
if (!nomupayKeyFile.isAbsolute()) nomupayKeyFile = rootProject.file('../' + nomupayKey.keystorePath)
if (!nomupayKeyFile.exists()) throw new GradleException('The distribution keystore is missing.')
android {
    signingConfigs {
        nomupayRelease {
            storeFile nomupayKeyFile
            storePassword nomupayKey.keystorePassword
            keyAlias nomupayKey.keyAlias
            keyPassword nomupayKey.keyPassword ?: nomupayKey.keystorePassword
        }
    }
    buildTypes {
        release { signingConfig signingConfigs.nomupayRelease }
    }
}
${marker}:end\n`;
    return mod;
  });
};
