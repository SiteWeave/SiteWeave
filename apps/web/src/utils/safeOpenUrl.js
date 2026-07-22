/**
 * Open a URL in a new tab only when it is a safe https: absolute URL.
 * Rejects javascript:, data:, and other schemes that scanners flag as open-redirect/XSS risks.
 * @param {string} url
 * @param {string} [target='_blank']
 * @returns {Window|null}
 */
export function safeOpenUrl(url, target = '_blank') {
  if (!isSafeHttpsUrl(url)) return null;
  return window.open(url, target, 'noopener,noreferrer');
}

/**
 * @param {unknown} url
 * @returns {boolean}
 */
export function isSafeHttpsUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
