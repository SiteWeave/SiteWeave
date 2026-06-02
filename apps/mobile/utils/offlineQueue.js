import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'siteweave_mobile_offline_queue_v1';

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Failed reading offline queue:', error);
    return [];
  }
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue || []));
}

export async function enqueueOfflineAction(action) {
  const queue = await readQueue();
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: action.type,
    payload: action.payload,
    createdAt: new Date().toISOString(),
    retries: 0,
  };
  queue.push(record);
  await writeQueue(queue);
  return record;
}

export async function getOfflineQueueSize() {
  const queue = await readQueue();
  return queue.length;
}

/**
 * Process queued actions with provided handlers.
 * handlers map shape: { [type]: async (payload) => void }
 */
export async function processOfflineQueue(handlers = {}, { onComplete } = {}) {
  const queue = await readQueue();
  if (!queue.length) {
    if (onComplete) await onComplete({ processed: 0, failed: 0, remaining: 0 });
    return { processed: 0, failed: 0, remaining: 0 };
  }

  const remaining = [];
  let processed = 0;
  let failed = 0;

  for (const item of queue) {
    const handler = handlers[item.type];
    if (!handler) {
      remaining.push(item);
      continue;
    }

    try {
      await handler(item.payload);
      processed += 1;
    } catch (error) {
      failed += 1;
      remaining.push({ ...item, retries: (item.retries || 0) + 1, lastError: String(error?.message || error) });
    }
  }

  await writeQueue(remaining);
  const result = { processed, failed, remaining: remaining.length };
  if (onComplete) await onComplete(result);
  return result;
}
