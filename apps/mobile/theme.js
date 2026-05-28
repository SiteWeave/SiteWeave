/**
 * Shared design tokens for SiteWeave mobile.
 * See MOBILE-DESIGN.md. Org primary/secondary can override via useBranding().
 */

export const colors = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#EFF6FF',
  secondary: '#10B981',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  error: '#EF4444',
  white: '#FFFFFF',
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

export const typography = {
  screenTitle: { fontSize: 26, fontWeight: '800', color: colors.text },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, fontWeight: '400', color: colors.text },
  bodyMedium: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  caption: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  button: { fontSize: 16, fontWeight: '700', color: colors.white },
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
};

export const touch = {
  minSize: 44,
};

/** Build a theme object with optional org brand colors */
export function createTheme(overrides = {}) {
  return {
    colors: { ...colors, ...overrides.colors },
    spacing,
    typography,
    shadows,
    touch,
  };
}

export const defaultTheme = createTheme();
