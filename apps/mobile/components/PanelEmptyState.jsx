import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBranding } from '../context/BrandingContext';
import PressableWithFade from './PressableWithFade';
import { Text } from './ui/Text';
import { colors, radius, spacing, touch } from '../theme';

export default function PanelEmptyState({
  icon,
  title,
  hint,
  ctaLabel,
  onCta,
  testID,
  hideCta = false,
}) {
  const { primaryColor } = useBranding();

  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={28} color={colors.textSubtle} />
      </View>
      <Text variant="bodyMedium" style={styles.emptyTitle}>
        {title}
      </Text>
      {hint ? (
        <Text variant="caption" style={styles.emptyHint}>
          {hint}
        </Text>
      ) : null}
      {!hideCta && ctaLabel && onCta ? (
        <PressableWithFade
          style={[styles.emptyCta, { backgroundColor: primaryColor }]}
          onPress={onCta}
          testID={testID}
        >
          <Text variant="bodyMedium" style={styles.emptyCtaText}>
            {ctaLabel}
          </Text>
        </PressableWithFade>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { textAlign: 'center', color: colors.textMuted },
  emptyHint: { textAlign: 'center', color: colors.textSubtle, lineHeight: 18 },
  emptyCta: {
    marginTop: spacing.md,
    borderRadius: radius.button,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: touch.minRowHeight,
    justifyContent: 'center',
  },
  emptyCtaText: { color: colors.white, fontWeight: '700' },
});
