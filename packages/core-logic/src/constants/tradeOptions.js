/** @type {readonly string[]} */
export const TRADE_OPTIONS = Object.freeze([
  'Plumbing',
  'Electrical',
  'Framing',
  'Civil',
  'Landscaping',
]);

/**
 * @param {string | null | undefined} trade
 * @returns {boolean}
 */
export function isKnownTradeOption(trade) {
  if (!trade) return false;
  return TRADE_OPTIONS.includes(trade);
}
