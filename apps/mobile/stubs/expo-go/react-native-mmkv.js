/**
 * Expo Go stub for react-native-mmkv.
 * Production/dev-client uses the real package via Metro (when EXPO_GO_COMPAT is unset).
 */
export function createMMKV() {
  return {
    getString: () => undefined,
    getNumber: () => undefined,
    getBoolean: () => undefined,
    set: () => {},
    remove: () => {},
    contains: () => false,
    getAllKeys: () => [],
    clearAll: () => {},
  };
}

export const MMKV = function MMKV() {
  return createMMKV();
};

export default { createMMKV, MMKV };
