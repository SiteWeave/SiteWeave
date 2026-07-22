/**
 * Shared semantic design tokens for SiteWeave.
 * Platform mappings live in web.css (Tailwind/HeroUI) and mobile.js (StyleSheet).
 */

export const colorRoles = {
  accent: '#3B82F6',
  accentDark: '#2563EB',
  accentSoft: '#EFF6FF',
  accentSoftBorder: '#DBEAFE',
  secondary: '#10B981',
  background: '#F8FAFC',
  backgroundMuted: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  error: '#EF4444',
  success: '#00C875',
  warning: '#FDAB3D',
  danger: '#E2445C',
  statusDone: '#00C875',
  statusWorking: '#FDAB3D',
  statusStuck: '#E2445C',
  statusTodo: '#C4C4C4',
  white: '#FFFFFF',
};

export const spacingScale = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radiusScale = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  card: 14,
  button: 12,
  sheet: 20,
  pill: 28,
};

export const typographyRoles = {
  screenTitle: { fontSize: 26, fontWeight: '800', lineHeight: 1.2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', lineHeight: 1.3 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 1.5 },
  bodyMedium: { fontSize: 16, fontWeight: '500', lineHeight: 1.5 },
  caption: { fontSize: 13, fontWeight: '600', lineHeight: 1.4 },
  button: { fontSize: 15, fontWeight: '600', lineHeight: 1.2 },
};

export const motionTokens = {
  durationFast: 150,
  durationNormal: 220,
  durationSlow: 300,
  easingOut: 'cubic-bezier(0.23, 1, 0.32, 1)',
  easingStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  pressScale: 0.96,
};

export const controlStates = [
  'default',
  'hover',
  'focus',
  'active',
  'pressed',
  'disabled',
  'loading',
  'invalid',
  'success',
];

export const zIndexScale = {
  dropdown: 40,
  sticky: 45,
  modalBackdrop: 50,
  modal: 55,
  toast: 60,
  tooltip: 70,
};

export const touchTargets = {
  minSize: 48,
  minRowHeight: 56,
  fabSize: 56,
  sheetButtonHeight: 52,
};

const tokens = {
  colorRoles,
  spacingScale,
  radiusScale,
  typographyRoles,
  motionTokens,
  controlStates,
  zIndexScale,
  touchTargets,
};

export default tokens;
