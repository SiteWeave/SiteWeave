import * as Linking from 'expo-linking';
import * as StoreReview from 'expo-store-review';

/**
 * Native store review availability (OS may still suppress the prompt).
 */
export async function isNativeStoreReviewAvailable() {
  try {
    return Boolean(await StoreReview.isAvailableAsync());
  } catch {
    return false;
  }
}

/**
 * Request the native in-app review prompt when available.
 * Does not confirm whether the user actually left a review.
 * @returns {Promise<'native' | 'unavailable'>}
 */
export async function requestNativeStoreReview() {
  const available = await isNativeStoreReviewAvailable();
  if (!available) return 'unavailable';
  try {
    await StoreReview.requestReview();
    return 'native';
  } catch {
    return 'unavailable';
  }
}

/**
 * Convert a store listing URL into a direct "write a review" deep link.
 * iOS App Store supports the `action=write-review` query param; other stores
 * open the listing where the user can tap to review.
 */
export function toWriteReviewUrl(storeUrl) {
  if (!storeUrl) return null;
  if (storeUrl.includes('apps.apple.com')) {
    const separator = storeUrl.includes('?') ? '&' : '?';
    return `${storeUrl}${separator}action=write-review`;
  }
  return storeUrl;
}

/**
 * Open the platform store listing (write-review page when possible).
 * Prefer the remote release-config URL; otherwise try expo-store-review's configured store URL.
 */
export async function openStoreListing(storeUrl) {
  const candidates = [
    toWriteReviewUrl(storeUrl),
    typeof StoreReview.storeUrl === 'function' ? StoreReview.storeUrl() : null,
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      // canOpenURL can be unreliable for https store links, so attempt to open regardless.
      await Linking.openURL(url);
      return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

/**
 * Handle an explicit "Leave a review" button tap.
 *
 * Apple reserves the native in-app prompt (`SKStoreReviewController`) for
 * automatic moments and suppresses it on Simulator/dev and when the user taps
 * a button, so for an explicit CTA we open the App Store write-review page.
 * Falls back to the native prompt only if no store URL can be opened.
 * @returns {Promise<'store_link' | 'native' | 'none'>}
 */
export async function requestReviewOrOpenStore(storeUrl) {
  const opened = await openStoreListing(storeUrl);
  if (opened) return 'store_link';
  const nativeResult = await requestNativeStoreReview();
  return nativeResult === 'native' ? 'native' : 'none';
}
