/**
 * Run an async operation once; on failure, retry once.
 * Used for transient network/storage failures on photo uploads.
 */
export async function withOneRetry(fn) {
  try {
    return await fn();
  } catch (firstError) {
    try {
      return await fn();
    } catch {
      throw firstError;
    }
  }
}
