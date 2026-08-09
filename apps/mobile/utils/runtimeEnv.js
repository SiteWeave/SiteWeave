import Constants from 'expo-constants';

/**
 * True when running inside the App Store / Play Store Expo Go client.
 * Dev clients and store builds return false.
 */
export function isExpoGo() {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient'
  );
}

/**
 * True when Metro was started with EXPO_GO_COMPAT=1 (native modules stubbed).
 * Use for build-time decisions; prefer isExpoGo() at runtime.
 */
export function isExpoGoCompatBuild() {
  return process.env.EXPO_GO_COMPAT === '1' || process.env.EXPO_PUBLIC_EXPO_GO_COMPAT === '1';
}
