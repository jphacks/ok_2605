import { Platform, StyleSheet, View } from 'react-native';
import type { PropsWithChildren } from 'react';

export function AppFrame({ children }: PropsWithChildren) {
  return (
    <View style={styles.viewport}>
      <View style={[styles.app, Platform.OS === 'web' && styles.webApp]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#ece7e6',
  },
  app: {
    flex: 1,
    width: '100%',
    backgroundColor: '#fff9f6',
  },
  webApp: {
    maxWidth: 390,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e4d9d8',
    overflow: 'hidden',
  },
});
