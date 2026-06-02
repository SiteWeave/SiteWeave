/**
 * Apply optimistic UI update with rollback on failure.
 * @template T
 * @param {() => T | Promise<T>} optimisticFn - sync state update
 * @param {() => Promise<unknown>} serverFn - async mutation
 * @param {() => void} rollbackFn - restore prior state on error
 */
export async function runOptimistic(optimisticFn, serverFn, rollbackFn) {
  optimisticFn();
  try {
    return await serverFn();
  } catch (error) {
    rollbackFn();
    throw error;
  }
}

export function createOptimisticUpdate(optimisticFn, rollbackFn) {
  return { optimistic: optimisticFn, rollback: rollbackFn };
}
