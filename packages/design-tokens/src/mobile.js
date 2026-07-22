/**
 * Mobile StyleSheet-friendly mapping of shared design tokens.
 * Consumed by apps/mobile/theme.js so branding and tokens stay aligned.
 */

import {
  colorRoles,
  spacingScale,
  radiusScale,
  typographyRoles,
  motionTokens,
  touchTargets,
} from './index.js';

export const colors = {
  primary: colorRoles.accent,
  primaryDark: colorRoles.accentDark,
  primaryLight: colorRoles.accentSoft,
  secondaryButton: '#E8EDFF',
  secondary: colorRoles.secondary,
  background: '#F5F6F8',
  surface: colorRoles.surface,
  surfaceMuted: colorRoles.surfaceMuted,
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  error: colorRoles.error,
  white: colorRoles.white,
  statusDone: colorRoles.statusDone,
  statusWorking: colorRoles.statusWorking,
  statusStuck: colorRoles.statusStuck,
  statusTodo: colorRoles.statusTodo,
};

export const spacing = { ...spacingScale };

export const radius = {
  button: radiusScale.button,
  card: 24,
  pill: radiusScale.pill,
  sheet: radiusScale.sheet,
};

export const typography = {
  screenTitle: {
    fontSize: typographyRoles.screenTitle.fontSize,
    fontWeight: typographyRoles.screenTitle.fontWeight,
    color: colors.text,
  },
  sectionTitle: {
    fontSize: typographyRoles.sectionTitle.fontSize,
    fontWeight: typographyRoles.sectionTitle.fontWeight,
    color: colors.text,
  },
  body: {
    fontSize: 17,
    fontWeight: typographyRoles.body.fontWeight,
    color: colors.text,
  },
  bodyMedium: {
    fontSize: typographyRoles.bodyMedium.fontSize,
    fontWeight: typographyRoles.bodyMedium.fontWeight,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: typographyRoles.caption.fontSize,
    fontWeight: typographyRoles.caption.fontWeight,
    color: colors.textMuted,
  },
  button: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
};

export const motion = {
  durationFast: motionTokens.durationFast,
  durationNormal: motionTokens.durationNormal,
  durationSlow: motionTokens.durationSlow,
  pressScale: motionTokens.pressScale,
};

export const touch = {
  minSize: touchTargets.minSize,
  minRowHeight: touchTargets.minRowHeight,
  fabSize: touchTargets.fabSize,
  sheetButtonHeight: touchTargets.sheetButtonHeight,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
};

export const shadows = {
  card: {
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  cardSelected: {
    shadowColor: colorRoles.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  floatingNav: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
};

/** Build a theme object with optional org brand colors */
export function createTheme(overrides = {}) {
  return {
    colors: { ...colors, ...overrides.colors },
    spacing,
    radius,
    typography,
    shadows,
    touch,
    motion,
  };
}

export const defaultTheme = createTheme();
