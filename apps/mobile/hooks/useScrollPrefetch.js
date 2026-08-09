import { useCallback, useRef } from 'react';
import { shouldPrefetchFromScroll } from '../utils/prefetchIntent';

/**
 * Returns an onScroll handler that fires `onPrefetch` once per stretch past 75% depth.
 */
export function useScrollPrefetch(onPrefetch, { threshold = 0.75, minIntervalMs = 400 } = {}) {
  const lastFireRef = useRef(0);
  const pendingRef = useRef(false);

  return useCallback(
    (event) => {
      if (!onPrefetch || pendingRef.current) return;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent || {};
      const now = Date.now();
      if (now - lastFireRef.current < minIntervalMs) return;
      if (
        !shouldPrefetchFromScroll({
          contentOffsetY: contentOffset?.y || 0,
          contentHeight: contentSize?.height || 0,
          layoutHeight: layoutMeasurement?.height || 0,
          threshold,
        })
      ) {
        return;
      }
      lastFireRef.current = now;
      pendingRef.current = true;
      Promise.resolve()
        .then(() => onPrefetch())
        .finally(() => {
          pendingRef.current = false;
        });
    },
    [onPrefetch, threshold, minIntervalMs],
  );
}
