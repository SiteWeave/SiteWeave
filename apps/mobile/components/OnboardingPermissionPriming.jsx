import { useState } from 'react';
import { View, StyleSheet, Switch, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, radius, shadows } from '../theme';
import { sheetBottomPadding } from '../utils/layoutInsets';

/**
 * Permission priming layout: question headline, value copy, single toggle card.
 * Flipping the switch ON runs onEnable (OS permission dialog), then onComplete.
 */
export default function OnboardingPermissionPriming({
  titleKey,
  subtitleKey,
  cardTitleKey,
  cardSubtitleKey,
  iconName,
  iconColor,
  onEnable,
  onSkip,
  testIDPrefix = 'onboarding-permission',
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleToggle = async (value) => {
    if (!value || busy) return;
    setBusy(true);
    setEnabled(true);
    try {
      await onEnable();
    } catch (error) {
      console.warn('Permission onboarding enable failed:', error?.message || error);
      setEnabled(false);
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSkip();
    } catch (error) {
      console.warn('Permission onboarding skip failed:', error?.message || error);
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: sheetBottomPadding(insets) },
      ]}
    >
      <Text style={styles.title}>{t(titleKey)}</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        {t(subtitleKey)}
      </Text>

      <View style={styles.card} testID={`${testIDPrefix}-card`}>
        <View style={[styles.iconWrap, { backgroundColor: `${iconColor}18` }]}>
          <Ionicons name={iconName} size={22} color={iconColor} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{t(cardTitleKey)}</Text>
          <Text variant="caption" style={styles.cardSubtitle}>
            {t(cardSubtitleKey)}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={busy}
          trackColor={{ false: colors.borderStrong, true: iconColor }}
          thumbColor={Platform.OS === 'android' ? colors.white : undefined}
          ios_backgroundColor={colors.borderStrong}
          testID={`${testIDPrefix}-toggle`}
          accessibilityLabel={t(cardTitleKey)}
        />
      </View>

      <PressableWithFade
        onPress={handleSkip}
        disabled={busy}
        style={styles.skipWrap}
        testID={`${testIDPrefix}-skip`}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.not_now')}
      >
        <Text style={styles.skipText}>{t('mobile.not_now')}</Text>
      </PressableWithFade>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xxl,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 36,
    marginBottom: spacing.md,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.xxxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  skipWrap: {
    alignSelf: 'center',
    marginTop: spacing.xxxl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
