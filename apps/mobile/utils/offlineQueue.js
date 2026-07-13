import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'siteweave_mobile_offline_queue_v1';
const MAX_RETRIES = 12;

const queueListeners = new Set();

function isTerminalAccessError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42501'
    || message.includes('row-level security')
    || message.includes('permission denied')
    || message.includes('project not found')
    || message.includes('not authorized')
  );
}

function notifyQueueChanged() {
  queueListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Offline queue listener failed:', error);
    }
  });
}

export function subscribeOfflineQueue(listener) {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}

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
  notifyQueueChanged();
}

export async function readOfflineQueue() {
  return readQueue();
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
function summarizeQueueItem(item) {
  return {
    id: item.id,
    type: item.type,
    lastError: item.lastError || null,
    retries: item.retries || 0,
    createdAt: item.createdAt || null,
  };
}

export async function processOfflineQueue(handlers = {}, { onComplete } = {}) {
  const queue = await readQueue();
  if (!queue.length) {
    const empty = { processed: 0, failed: 0, dropped: 0, remaining: 0, errors: [] };
    if (onComplete) await onComplete(empty);
    return empty;
  }

  console.warn('[offlineQueue] Processing', queue.length, 'queued action(s)');

  const remaining = [];
  let processed = 0;
  let failed = 0;
  let dropped = 0;
  const droppedErrors = [];

  for (const item of queue) {
    const handler = handlers[item.type];
    const retries = item.retries || 0;

    if (!handler) {
      const message = `Unsupported action type: ${item.type}`;
      console.error('[offlineQueue]', message, item.id);
      if (retries + 1 >= MAX_RETRIES) {
        dropped += 1;
        continue;
      }
      failed += 1;
      remaining.push({ ...item, retries: retries + 1, lastError: message });
      continue;
    }

    try {
      await handler(item.payload);
      processed += 1;
      console.warn('[offlineQueue] Synced', item.type, item.id);
    } catch (error) {
      const message = String(error?.message || error);
      console.error('[offlineQueue] Failed', item.type, item.id, message);
      if (isTerminalAccessError(error) || retries + 1 >= MAX_RETRIES) {
        dropped += 1;
        droppedErrors.push({
          ...summarizeQueueItem({ ...item, lastError: message }),
          terminal: isTerminalAccessError(error),
        });
        continue;
      }
      failed += 1;
      remaining.push({ ...item, retries: retries + 1, lastError: message });
    }
  }

  await writeQueue(remaining);
  const result = {
    processed,
    failed,
    dropped,
    remaining: remaining.length,
    errors: [...remaining.map(summarizeQueueItem), ...droppedErrors],
  };
  console.warn('[offlineQueue] Result', result);
  if (onComplete) await onComplete(result);
  return result;
}

export async function clearOfflineQueue() {
  await writeQueue([]);
}
