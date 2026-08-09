import {
  CACHE_TTL,
  cacheKey,
  getMemoryCache,
  setMemoryCache,
  isMemoryCacheFresh,
  invalidateMemoryCache,
} from '@siteweave/core-logic';
import {
  getStorageString,
  setStorageString,
  removeStorageKey,
  getAllStorageKeys,
  multiRemoveStorageKeys,
  getFastString,
  setFastString,
  isFastStorageNative,
} from './fastStorage';

const STORAGE_PREFIX = 'siteweave_cache_v1:';

async function readStorage(key) {
  try {
    const storageKey = STORAGE_PREFIX + key;
    // Sync MMKV path for hot reads when available
    let raw = isFastStorageNative ? getFastString(storageKey) : null;
    if (raw == null) {
      raw = await getStorageString(storageKey);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || Date.now() > parsed.expiresAt) {
      await removeStorageKey(storageKey);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

async function writeStorage(key, data, ttlMs) {
  try {
    const storageKey = STORAGE_PREFIX + key;
    const payload = JSON.stringify({ data, expiresAt: Date.now() + ttlMs });
    if (isFastStorageNative) {
      setFastString(storageKey, payload);
      return;
    }
    await setStorageString(storageKey, payload);
  } catch {
    // ignore quota errors
  }
}

/**
 * Read-through cache: memory first, then MMKV/AsyncStorage.
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
    const keys = await getAllStorageKeys();
    const toRemove = keys.filter((k) => k.startsWith(STORAGE_PREFIX + prefix));
    if (toRemove.length) await multiRemoveStorageKeys(toRemove);
  } catch {
    // ignore
  }
}
