import { spacing } from '../theme';

/**
 * Tab screens live in the flex area above the tab bar (not under it).
 * Bottom padding only needs breathing room, not tab-bar clearance.
 */
export function scrollBottomPadding(_insets, extra = 0) {
  return spacing.lg + extra;
}

/** Screen-level FABs sit above the tab bar inside the screen flex area. */
export function fabBottomOffset(_insets, extra = 0) {
  return spacing.md + extra;
}

/** Top safe area + optional extra spacing below status bar. */
export function contentTopInset(insets, extra = 0) {
  return (insets?.top ?? 0) + extra;
}

/** Modal / sheet shell padding: system inset plus intentional breathing room. */
export function sheetBottomPadding(insets, extra = 0) {
  return (insets?.bottom ?? 0) + spacing.xl + extra;
}

/** Scroll content breathing room at the end of bottom sheets. */
export function sheetScrollEndPadding(_insets, extra = 0) {
  return spacing.xxl + extra;
}

/** Static list/action groups inside bottom sheets. */
export function sheetListEndPadding(_insets, extra = 0) {
  return spacing.lg + extra;
}

/** @deprecated Tab bar is in normal document flow; use scrollBottomPadding instead. */
export const TAB_BAR_CLEARANCE = 72;

/** @deprecated */
export const TAB_BAR_BODY_HEIGHT = 56;

/** @deprecated */
export function tabBarOccupiedHeight(insets) {
  return (insets?.bottom ?? 0) + TAB_BAR_CLEARANCE;
}
