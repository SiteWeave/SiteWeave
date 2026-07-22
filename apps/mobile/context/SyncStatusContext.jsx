import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from './AuthContext';
import {
  clearOfflineQueue,
  getOfflineQueueSize,
  processOfflineQueue,
  readOfflineQueue,
  subscribeOfflineQueue,
} from '../utils/offlineQueue';
import { buildOfflineHandlers } from '../utils/offlineHandlers';

const SyncStatusContext = createContext({
  isOnline: true,
  queueSize: 0,
  isSyncing: false,
  lastSyncResult: null,
  refreshQueueSize: async () => {},
  flushQueue: async () => ({ processed: 0, failed: 0, dropped: 0, remaining: 0, errors: [] }),
  clearQueue: async () => {},
});

function formatSyncErrorSummary(errors = []) {
  if (!errors.length) return '';
  return errors
    .slice(0, 3)
    .map((item) => `${item.type}: ${item.lastError || 'Unknown error'}`)
    .join('\n');
}

function isSilentFlushOptions(options) {
  // Pressable may pass a native event as the first arg — never treat that as { silent: true }.
  return Boolean(
    options
    && typeof options === 'object'
    && !options.nativeEvent
    && options.silent === true,
  );
}

export function SyncStatusProvider({ children }) {
  const { supabase, syncPulse } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const inFlightFlushRef = useRef(null);

  const refreshQueueSize = useCallback(async () => {
    const size = await getOfflineQueueSize();
    setQueueSize(size);
    return size;
  }, []);

  const flushQueue = useCallback(async (options) => {
    const silent = isSilentFlushOptions(options);

    if (!supabase) {
      const empty = {
        processed: 0,
        failed: 0,
        dropped: 0,
        remaining: await getOfflineQueueSize(),
        errors: [],
        flushError: silent ? undefined : 'Not signed in — cannot sync yet.',
      };
      if (!silent) {
        console.warn('[SyncStatus] flush skipped — no supabase client');
        setLastSyncResult(empty);
      }
      return empty;
    }

    // Coalesce concurrent flushes so auto-sync + tap don't double-process the queue.
    if (inFlightFlushRef.current) {
      if (!silent) console.warn('[SyncStatus] joining in-flight flush');
      return inFlightFlushRef.current;
    }

    setIsSyncing(true);
    const run = (async () => {
      try {
        const pending = await readOfflineQueue();
        if (!silent && pending.length) {
          console.warn('[SyncStatus] flushing queue:', pending.map((item) => item.type));
        }

        const result = await processOfflineQueue(buildOfflineHandlers(supabase));
        await refreshQueueSize();
        setLastSyncResult(result);
        return result;
      } catch (error) {
        console.error('[SyncStatus] flush failed:', error);
        const fallback = {
          processed: 0,
          failed: 0,
          dropped: 0,
          remaining: await getOfflineQueueSize(),
          errors: [],
          flushError: String(error?.message || error),
        };
        setLastSyncResult(fallback);
        return fallback;
      } finally {
        inFlightFlushRef.current = null;
        setIsSyncing(false);
      }
    })();

    inFlightFlushRef.current = run;
    return run;
  }, [supabase, refreshQueueSize]);

  const clearQueue = useCallback(async () => {
    await clearOfflineQueue();
    await refreshQueueSize();
    setLastSyncResult(null);
  }, [refreshQueueSize]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    NetInfo.fetch().then((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    refreshQueueSize();
  }, [refreshQueueSize, syncPulse]);

  useEffect(() => subscribeOfflineQueue(refreshQueueSize), [refreshQueueSize]);

  useEffect(() => {
    if (!isOnline || !supabase) return;
    flushQueue({ silent: true });
  }, [isOnline, supabase, syncPulse, flushQueue]);

  return (
    <SyncStatusContext.Provider
      value={{
        isOnline,
        queueSize,
        isSyncing,
        lastSyncResult,
        refreshQueueSize,
        flushQueue,
        clearQueue,
        formatSyncErrorSummary,
      }}
    >
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus() {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) {
    throw new Error('useSyncStatus must be used within SyncStatusProvider');
  }
  return ctx;
}
