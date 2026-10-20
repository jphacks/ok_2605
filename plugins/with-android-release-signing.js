const { withAppBuildGradle } = require('expo/config-plugins');

function patchSigning(source) {
  // Read secrets only at build time, never interpolate them into generated code.
  const cleaned = source.replace(/\n\/\/ nomupay-release-signing:start[\s\S]*?\/\/ nomupay-release-signing:end\n?/g, '\n').trimEnd();
  return `${cleaned}
// nomupay-release-signing:start
def nomupayCredentialsPath = System.getenv('NOMUPAY_ANDROID_CREDENTIALS')
def nomupayCredentialsFile = nomupayCredentialsPath ? new File(nomupayCredentialsPath) : rootProject.file('../credentials.json')
if (!nomupayCredentialsFile.exists()) {
    throw new GradleException('The local Android credentials file is missing.')
}
def nomupayKey = new groovy.json.JsonSlurper().parse(nomupayCredentialsFile).android.keystore
def nomupayKeyFile = new File(nomupayKey.keystorePath)
if (!nomupayKeyFile.isAbsolute()) nomupayKeyFile = new File(nomupayCredentialsFile.parentFile, nomupayKey.keystorePath)
if (!nomupayKeyFile.exists()) {
    throw new GradleException('The distribution keystore is missing.')
}
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
// nomupay-release-signing:end
`;
}

module.exports = (config) => withAppBuildGradle(config, (mod) => {
  if (mod.modResults.language !== 'groovy') throw new Error('Android signing requires a Groovy app build.gradle.');
  mod.modResults.contents = patchSigning(mod.modResults.contents);
  return mod;
});
module.exports.patchSigning = patchSigning;
