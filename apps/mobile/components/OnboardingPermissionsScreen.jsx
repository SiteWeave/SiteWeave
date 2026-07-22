import { useState, useEffect } from 'react';
import { View, StyleSheet, Switch, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './ui/Text';
import Button from './ui/Button';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, radius, shadows } from '../theme';
import { useBranding } from '../context/BrandingContext';
import { useAuth } from '../context/AuthContext';
import { sheetBottomPadding } from '../utils/layoutInsets';
import {
  requestNotificationPermissions,
  registerPushTokenIfPermitted,
} from '../utils/notifications';
import {
  getPendingInviteOnboarding,
  markNotificationsDone,
  markLocationDone,
  clearPendingInviteOnboarding,
} from '../utils/onboarding';

function PermissionToggleCard({
  iconName,
  iconColor,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  testID,
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={[styles.iconWrap, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={iconName} size={22} color={iconColor} />
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text variant="caption" style={styles.cardSubtitle}>
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.borderStrong, true: iconColor }}
        thumbColor={Platform.OS === 'android' ? colors.white : undefined}
        ios_backgroundColor={colors.borderStrong}
      />
    </View>
  );
}

export default function OnboardingPermissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { primaryColor } = useBranding();
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const [skipWeather, setSkipWeather] = useState(false);
  const [notifOn, setNotifOn] = useState(false);
  const [locationOn, setLocationOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const pending = await getPendingInviteOnboarding();
      setSkipWeather(pending.skipWeather);
    })();
  }, []);

  const finish = async () => {
    await markNotificationsDone(user?.id);
    if (!skipWeather) {
      await markLocationDone(user?.id);
    }
    const pending = await getPendingInviteOnboarding();
    const destination = pending.inviteDestination ?? '/(tabs)';
    await clearPendingInviteOnboarding();
    router.replace(destination);
  };

  const handleNotifToggle = async (value) => {
    if (busy) return;
    if (!value) {
      setNotifOn(false);
      return;
    }
    setBusy(true);
    setNotifOn(true);
    try {
      const granted = await requestNotificationPermissions();
      setNotifOn(granted);
      if (granted && supabase && user?.id) {
        await registerPushTokenIfPermitted(supabase, user.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLocationToggle = async (value) => {
    if (busy) return;
    if (!value) {
      setLocationOn(false);
      return;
    }
    setBusy(true);
    setLocationOn(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationOn(status === 'granted');
    } finally {
      setBusy(false);
    }
  };

  const handleContinue = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await finish();
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await finish();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxxl * 2, paddingBottom: sheetBottomPadding(insets) }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('mobile.permissions_onboarding_title')}</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          {t('mobile.permissions_onboarding_subtitle')}
        </Text>

        <View style={styles.cards}>
          <PermissionToggleCard
            iconName="notifications"
            iconColor={primaryColor}
            title={t('mobile.notification_onboarding_card_title')}
            subtitle={t('mobile.notification_onboarding_card_subtitle')}
            value={notifOn}
            onValueChange={handleNotifToggle}
            disabled={busy}
            testID="notification-onboarding-toggle"
          />

          {!skipWeather ? (
            <PermissionToggleCard
              iconName="navigate"
              iconColor={colors.secondary}
              title={t('mobile.weather_onboarding_card_title')}
              subtitle={t('mobile.weather_onboarding_card_subtitle')}
              value={locationOn}
              onValueChange={handleLocationToggle}
              disabled={busy}
              testID="weather-onboarding-toggle"
            />
          ) : null}
        </View>

        <Text variant="caption" style={styles.reassurance}>
          {t('mobile.permissions_onboarding_reassurance')}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={t('mobile.continue')}
          onPress={handleContinue}
          disabled={busy}
          testID="permissions-onboarding-continue"
        />
        <PressableWithFade
          onPress={handleSkip}
          disabled={busy}
          style={styles.skipWrap}
          testID="permissions-onboarding-skip"
        >
          <Text style={styles.skipText}>{t('mobile.not_now')}</Text>
        </PressableWithFade>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xxl,
  },
  scroll: {
    flexGrow: 1,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
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
    marginBottom: spacing.xxl,
  },
  cards: {
    gap: spacing.lg,
    marginBottom: spacing.lg,
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
  reassurance: {
    textAlign: 'center',
    color: colors.textSubtle,
    lineHeight: 18,
  },
  footer: {
    paddingTop: spacing.md,
  },
  skipWrap: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
