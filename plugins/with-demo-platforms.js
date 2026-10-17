const {
  AndroidConfig,
  withEntitlementsPlist,
  withInfoPlist,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// Register this before notification plugins: SDK 57 executes each mod chain in reverse order.
// Android owns NFC. iOS uses QR and local notifications with Personal Team signing.
module.exports = function withDemoPlatforms(config) {
  config = withDangerousMod(config, ['ios', async (mod) => {
    const target = path.join(mod.modRequest.platformProjectRoot, '.xcode.env.local');
    // Xcode does not inherit npm's Node 24 PATH. Preserve an existing developer override.
    if (!fs.existsSync(target)) {
      const nodePath = process.execPath.replaceAll("'", "'\"'\"'");
      fs.writeFileSync(target, `# Local Node runtime used to generate this project.\nexport NODE_BINARY='${nodePath}'\n`);
    }
    return mod;
  }]);
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.NFC',
    'android.permission.SCHEDULE_EXACT_ALARM',
  ]);
  config = withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    for (const key of Object.keys(mod.modResults)) {
      if (key.startsWith('com.apple.developer.nfc.')) delete mod.modResults[key];
    }
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    delete mod.modResults.NFCReaderUsageDescription;
    for (const key of Object.keys(mod.modResults)) {
      if (key.startsWith('com.apple.developer.nfc.')) delete mod.modResults[key];
    }
    if (Array.isArray(mod.modResults.UIBackgroundModes)) {
      mod.modResults.UIBackgroundModes = mod.modResults.UIBackgroundModes.filter(
        (mode) => mode !== 'remote-notification',
      );
      if (mod.modResults.UIBackgroundModes.length === 0) delete mod.modResults.UIBackgroundModes;
    }
    return mod;
  });
};
