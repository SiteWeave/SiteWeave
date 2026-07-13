import { StyleSheet } from 'react-native';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, radius, spacing, touch } from '../../theme';
import { useBranding } from '../../context/BrandingContext';

export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  testID,
  style,
  textStyle,
}) {
  const { primaryColor } = useBranding();
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';

  return (
    <PressableWithFade
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.base,
        isPrimary && { backgroundColor: primaryColor },
        isSecondary && styles.secondary,
        variant === 'ghost' && styles.ghost,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          isPrimary && styles.labelPrimary,
          isSecondary && styles.labelSecondary,
          variant === 'ghost' && styles.labelGhost,
          textStyle,
        ]}
      >
        {label}
      </Text>
    </PressableWithFade>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.sheetButtonHeight,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  secondary: { backgroundColor: colors.secondaryButton },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  label: { fontSize: 17, fontWeight: '700' },
  labelPrimary: { color: colors.white },
  labelSecondary: { color: colors.primary },
  labelGhost: { color: colors.primary },
});
