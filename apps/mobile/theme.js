/**
 * Shared design tokens for SiteWeave mobile (monday-led field app).
 * See MOBILE-DESIGN.md. Org primary/secondary can override via useBranding().
 */

export const colors = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#EFF6FF',
  secondaryButton: '#E8EDFF',
  secondary: '#10B981',
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  error: '#EF4444',
  white: '#FFFFFF',
  statusDone: '#00C875',
  statusWorking: '#FDAB3D',
  statusStuck: '#E2445C',
  statusTodo: '#C4C4C4',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  button: 12,
  card: 24,
  pill: 28,
  sheet: 20,
};

export const typography = {
  screenTitle: { fontSize: 26, fontWeight: '800', color: colors.text },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 17, fontWeight: '400', color: colors.text },
  bodyMedium: { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
  caption: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  button: { fontSize: 17, fontWeight: '700', color: colors.white },
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
    shadowColor: '#3B82F6',
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

export const touch = {
  minSize: 48,
  minRowHeight: 56,
  fabSize: 56,
  sheetButtonHeight: 52,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
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
  };
}

export const defaultTheme = createTheme();
