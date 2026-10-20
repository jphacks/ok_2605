import type { ConfigContext, ExpoConfig } from 'expo/config';

// Personal Team provisioning may require a unique identifier for each member.
// Keep the override local; signing identities and team IDs stay in Xcode.
export default ({ config }: ConfigContext): ExpoConfig => {
  const preview = process.env.APP_VARIANT === 'preview' && process.env.EAS_BUILD_PLATFORM !== 'ios';
  return {
    ...config,
    name: preview ? 'のむペイ（配布版）' : 'のむペイ',
    slug: config.slug ?? 'expo-medication-app',
    scheme: preview ? 'nomupay-preview' : config.scheme,
    android: {
      ...config.android,
      package: preview ? 'jp.jphacks.ok2605.preview' : config.android?.package,
      versionCode: preview ? 11 : config.android?.versionCode,
    },
    plugins: [
      ...(config.plugins ?? []).map((plugin) => preview && Array.isArray(plugin) && plugin[0] === 'expo-dev-client'
        ? ['expo-dev-client', { ...plugin[1], addGeneratedScheme: false }] as [string, Record<string, unknown>]
        : plugin),
      ...(preview ? ['./plugins/with-android-release-signing'] : []),
    ],
    ios: {
      ...config.ios,
      bundleIdentifier: process.env.IOS_BUNDLE_IDENTIFIER || config.ios?.bundleIdentifier,
    },
  };
};
