/** @type {readonly string[]} */
export const TRADE_OPTIONS = Object.freeze([
  'Plumbing',
  'Electrical',
  'Framing',
  'Civil',
  'Landscaping',
]);

/** Sentinel for the "Custom trade…" select option in contact forms. */
export const CUSTOM_TRADE_VALUE = '__custom__';

/**
 * @param {string | null | undefined} trade
 * @returns {boolean}
 */
export function isKnownTradeOption(trade) {
  if (!trade) return false;
  return TRADE_OPTIONS.includes(trade);
}

/**
 * @param {string | null | undefined} trade
 * @returns {boolean}
 */
export function isCustomTradeOption(trade) {
  const value = typeof trade === 'string' ? trade.trim() : '';
  if (!value || value === 'Internal') return false;
  return !TRADE_OPTIONS.includes(value);
}

/**
 * Distinct custom (non-built-in) trade names from a contact list.
 * @param {Array<{ trade?: string | null } | string | null | undefined>} tradesOrContacts
 * @returns {string[]}
 */
export function listCustomTradeNames(tradesOrContacts = []) {
  const seen = new Set();
  const names = [];
  for (const item of tradesOrContacts) {
    const trade = typeof item === 'string' ? item : item?.trade;
    if (!isCustomTradeOption(trade)) continue;
    const name = trade.trim();
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return names;
}

/**
 * Merge built-in trades with org-specific / current values for a contact form select.
 * Excludes the staff sentinel "Internal".
 * @param {{ existingTrades?: Array<string | null | undefined>, currentTrade?: string | null }} [options]
 * @returns {string[]}
 */
export function buildTradeSelectOptions({ existingTrades = [], currentTrade = '' } = {}) {
  const seen = new Set();
  const extras = [];

  const consider = (value) => {
    const trade = typeof value === 'string' ? value.trim() : '';
    if (!trade || trade === 'Internal' || TRADE_OPTIONS.includes(trade) || seen.has(trade)) {
      return;
    }
    seen.add(trade);
    extras.push(trade);
  };

  for (const trade of existingTrades) {
    consider(trade);
  }
  consider(currentTrade);

  extras.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return [...TRADE_OPTIONS, ...extras];
}
