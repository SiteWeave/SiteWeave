/**
 * In-memory TTL cache (per session). Keys should include userId prefix.
 */

const store = new Map();

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DETAIL_TTL_MS = 2 * 60 * 1000;

export const CACHE_TTL = {
  list: DEFAULT_TTL_MS,
  detail: DETAIL_TTL_MS,
};

export function cacheKey(userId, resource) {
  return `${userId || 'anon'}:${resource}`;
}

export function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function set(key, data, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function isFresh(key) {
  const entry = store.get(key);
  return Boolean(entry && Date.now() <= entry.expiresAt);
}

export function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

export function clear() {
  store.clear();
}
