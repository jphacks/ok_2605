const { withEntitlementsPlist } = require('expo/config-plugins');

// Register before expo-notifications so this mod runs after its entitlement mod.
// This app schedules local notifications only;
// APNs entitlement would unnecessarily require paid-team push provisioning.
module.exports = (config) => withEntitlementsPlist(config, (result) => {
  delete result.modResults['aps-environment'];
  return result;
});
