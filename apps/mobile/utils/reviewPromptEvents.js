/**
 * Lightweight pub/sub so successful product moments can request a review prompt
 * without coupling screens to the modal coordinator.
 */

const listeners = new Set();

export function signalReviewPromptOpportunity() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('reviewPromptEvents listener failed:', error);
    }
  });
}

export function subscribeReviewPromptOpportunity(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
