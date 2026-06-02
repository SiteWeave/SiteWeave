import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CACHE_TTL,
  cacheKey,
  getMemoryCache,
  setMemoryCache,
  isMemoryCacheFresh,
  invalidateMemoryCache,
} from '@siteweave/core-logic';

const STORAGE_PREFIX = 'siteweave_cache_v1:';

async function readStorage(key) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || Date.now() > parsed.expiresAt) {
      await AsyncStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

async function writeStorage(key, data, ttlMs) {
  try {
    await AsyncStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({ data, expiresAt: Date.now() + ttlMs }),
    );
  } catch {
    // ignore quota errors
  }
}

/**
 * Read-through cache: memory first, then AsyncStorage.
 */
export async function getCached(userId, resource, ttlMs = CACHE_TTL.list) {
  const key = cacheKey(userId, resource);
  if (isMemoryCacheFresh(key)) {
    return getMemoryCache(key);
  }
  const fromDisk = await readStorage(key);
  if (fromDisk != null) {
    setMemoryCache(key, fromDisk, ttlMs);
    return fromDisk;
  }
  return null;
}

export async function setCached(userId, resource, data, ttlMs = CACHE_TTL.list) {
  const key = cacheKey(userId, resource);
  setMemoryCache(key, data, ttlMs);
  await writeStorage(key, data, ttlMs);
}

export async function invalidateCached(userId, resourcePrefix) {
  const prefix = cacheKey(userId, resourcePrefix);
  invalidateMemoryCache(prefix);
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((k) => k.startsWith(STORAGE_PREFIX + prefix));
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // ignore
  }
}
