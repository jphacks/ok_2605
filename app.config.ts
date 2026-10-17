import type { ConfigContext, ExpoConfig } from 'expo/config';

// Personal Team provisioning may require a unique identifier for each member.
// Keep the override local; signing identities and team IDs stay in Xcode.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'expo-medication-app',
  slug: config.slug ?? 'expo-medication-app',
  ios: {
    ...config.ios,
    bundleIdentifier: process.env.IOS_BUNDLE_IDENTIFIER || config.ios?.bundleIdentifier,
  },
});
