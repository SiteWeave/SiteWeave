import { useCallback, useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Schedule work after a BottomSheet/Modal fully unmounts.
 * Native camera, library, and share sheets freeze when stacked over an RN Modal.
 *
 * Usage:
 *   const { scheduleAfterDismiss, handleDismissed, clearPending } = useAfterSheetDismiss();
 *   // On action: scheduleAfterDismiss(() => launchCamera(), () => setSuspended(true));
 *   // On BottomSheet: onDismissed={handleDismissed} dismissWithoutAnimation
 */
export function useAfterSheetDismiss() {
  const afterDismissRef = useRef(null);
  const onErrorRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const runGenerationRef = useRef(0);

  const clearPending = useCallback(() => {
    runGenerationRef.current += 1;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    afterDismissRef.current = null;
    onErrorRef.current = null;
  }, []);

  const runPending = useCallback(() => {
    const next = afterDismissRef.current;
    const onError = onErrorRef.current;
    if (!next) return;
    afterDismissRef.current = null;
    onErrorRef.current = null;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const generation = runGenerationRef.current;
    // Wait for the RN Modal native layer to drop before presenting camera/library/share.
    void runAfterInteractionsAsync(async () => {
      if (generation !== runGenerationRef.current) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (generation !== runGenerationRef.current) return;
      return next();
    }).catch((error) => {
      if (generation !== runGenerationRef.current) return;
      if (onError) {
        onError(error);
        return;
      }
      console.error('Post-dismiss action failed:', error);
    });
  }, []);

  const handleDismissed = useCallback(() => {
    runPending();
  }, [runPending]);

  const scheduleAfterDismiss = useCallback((fn, dismissSheet, onError) => {
    // Replace any prior pending action so a failed handoff cannot swallow later taps.
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    afterDismissRef.current = fn;
    onErrorRef.current = onError || null;
    dismissSheet?.();
    // BottomSheet normally confirms dismissal quickly. Recover if onDismissed is lost.
    fallbackTimerRef.current = setTimeout(() => {
      runPending();
    }, 400);
    return true;
  }, [runPending]);

  useEffect(() => clearPending, [clearPending]);

  return {
    scheduleAfterDismiss,
    handleDismissed,
    clearPending,
  };
}

/**
 * Run a callback after interactions settle (e.g. after an Alert closes).
 * Prefer useAfterSheetDismiss when an RN Modal must unmount first.
 */
export function runAfterInteractionsAsync(fn) {
  return new Promise((resolve, reject) => {
    let started = false;
    let fallbackTimer = null;
    const start = () => {
      if (started) return;
      started = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      Promise.resolve()
        .then(fn)
        .then(resolve)
        .catch(reject);
    };
    const interactionTask = InteractionManager.runAfterInteractions(start);
    fallbackTimer = setTimeout(() => {
      interactionTask.cancel?.();
      start();
    }, 600);
  });
}
