import { StyleSheet } from 'react-native';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, radius, spacing, touch } from '../../theme';
import { useBranding } from '../../context/BrandingContext';

/**
 * SiteWeave mobile Button — states: default, pressed (via PressableWithFade),
 * disabled, loading. Variants: primary | secondary | ghost | danger.
 */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  testID,
  style,
  textStyle,
  accessibilityLabel,
}) {
  const { primaryColor } = useBranding();
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isDanger = variant === 'danger';
  const isDisabled = disabled || loading;

  return (
    <PressableWithFade
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      style={[
        styles.base,
        isPrimary && { backgroundColor: primaryColor },
        isSecondary && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDanger && styles.danger,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          isPrimary && styles.labelPrimary,
          isSecondary && styles.labelSecondary,
          variant === 'ghost' && styles.labelGhost,
          isDanger && styles.labelDanger,
          textStyle,
        ]}
      >
        {loading ? '…' : label}
      </Text>
    </PressableWithFade>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.sheetButtonHeight,
    minWidth: touch.minSize,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  secondary: { backgroundColor: colors.secondaryButton },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.statusStuck },
  disabled: { opacity: 0.5 },
  label: { fontSize: 17, fontWeight: '700' },
  labelPrimary: { color: colors.white },
  labelSecondary: { color: colors.primary },
  labelGhost: { color: colors.primary },
  labelDanger: { color: colors.white },
});
