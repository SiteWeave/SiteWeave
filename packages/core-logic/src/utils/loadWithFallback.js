/**
 * Run an async loader; on failure log and return fallback (never throw to caller).
 * @template T
 * @param {() => Promise<T>} fn
 * @param {T} fallback
 * @param {{ label?: string }} [options]
 * @returns {Promise<T>}
 */
export async function loadWithFallback(fn, fallback, { label } = {}) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[loadWithFallback] ${label ?? 'load'} failed:`, err?.message ?? err);
    return fallback;
  }
}
