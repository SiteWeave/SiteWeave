/**
 * Sync-first key/value storage: MMKV when native module is available,
 * AsyncStorage fallback otherwise (Expo Go / unsupported runtimes).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isExpoGo } from './runtimeEnv';

let mmkv = null;

function tryInitMmkv() {
  if (mmkv || mmkv === false) return;
  // Never load Nitro/MMKV inside Expo Go — native module is absent.
  if (isExpoGo()) {
    mmkv = false;
    return;
  }
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { createMMKV } = require('react-native-mmkv');
    mmkv = createMMKV({ id: 'siteweave.fast' });
  } catch {
    mmkv = false;
  }
}

tryInitMmkv();

export const isFastStorageNative = Boolean(mmkv);

export function getFastString(key) {
  tryInitMmkv();
  if (mmkv) return mmkv.getString(key) ?? null;
  return null;
}

export function setFastString(key, value) {
  tryInitMmkv();
  if (mmkv) {
    if (value == null) mmkv.remove(key);
    else mmkv.set(key, String(value));
    return true;
  }
  return false;
}

export function removeFastKey(key) {
  tryInitMmkv();
  if (mmkv) {
    mmkv.remove(key);
    return true;
  }
  return false;
}

export function getFastAllKeys(prefix = '') {
  tryInitMmkv();
  if (!mmkv) return [];
  const keys = mmkv.getAllKeys();
  if (!prefix) return keys;
  return keys.filter((k) => k.startsWith(prefix));
}

export async function getStorageString(key) {
  tryInitMmkv();
  if (mmkv) {
    return mmkv.getString(key) ?? null;
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setStorageString(key, value) {
  tryInitMmkv();
  if (mmkv) {
    if (value == null) mmkv.remove(key);
    else mmkv.set(key, String(value));
    return;
  }
  try {
    if (value == null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, String(value));
  } catch {
    // ignore quota errors
  }
}

export async function removeStorageKey(key) {
  tryInitMmkv();
  if (mmkv) {
    mmkv.remove(key);
    return;
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function multiRemoveStorageKeys(keys) {
  if (!keys?.length) return;
  tryInitMmkv();
  if (mmkv) {
    keys.forEach((key) => mmkv.remove(key));
    return;
  }
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore
  }
}

export async function getAllStorageKeys() {
  tryInitMmkv();
  if (mmkv) return mmkv.getAllKeys();
  try {
    return await AsyncStorage.getAllKeys();
  } catch {
    return [];
  }
}
