/**
 * Normalize email for duplicate checks within an organization.
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
export function normalizeContactEmail(email) {
  const trimmed = String(email ?? '').trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) return null;
  return trimmed;
}

/**
 * Normalize phone to comparable digits (US 11-digit numbers collapse to 10).
 * @param {string|null|undefined} phone
 * @returns {string|null}
 */
export function normalizeContactPhoneDigits(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length >= 7 && digits.length <= 15) return digits;
  return null;
}

/**
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {boolean}
 */
export function contactPhonesMatch(a, b) {
  const da = normalizeContactPhoneDigits(a);
  const db = normalizeContactPhoneDigits(b);
  if (!da || !db) return false;
  return da === db;
}
