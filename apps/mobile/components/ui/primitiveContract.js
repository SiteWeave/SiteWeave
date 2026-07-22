/**
 * Primitive state contract for SiteWeave mobile UI kit.
 * Every shared control should support these states where applicable.
 */

export const PRIMITIVE_STATES = Object.freeze([
  'default',
  'pressed',
  'focused',
  'disabled',
  'loading',
  'invalid',
  'success',
]);

export const BUTTON_VARIANTS = Object.freeze(['primary', 'secondary', 'ghost', 'danger']);

export const TOUCH = Object.freeze({
  minSize: 48,
  sheetButtonHeight: 52,
  minRowHeight: 56,
});
