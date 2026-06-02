import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import { colors, spacing, radius } from '../../theme';
import { useBranding } from '../../context/BrandingContext';
import { requestNotificationPermissions, getPushToken, registerPushToken } from '../../utils/notifications';
import { useAuth } from '../../context/AuthContext';

const STORAGE_KEY = 'siteweave_notification_onboarding_done';

export async function hasCompletedNotificationOnboarding() {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markNotificationOnboardingDone() {
  await AsyncStorage.setItem(STORAGE_KEY, '1');
}

export default function NotificationPermissionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { primaryColor } = useBranding();
  const { supabase, user } = useAuth();
  const { t } = useTranslation();

  const finish = async () => {
    await markNotificationOnboardingDone();
    router.replace('/(tabs)');
  };

  const handleContinue = async () => {
    const granted = await requestNotificationPermissions();
    if (granted && supabase && user?.id) {
      const token = await getPushToken();
      if (token) await registerPushToken(supabase, user.id, token);
    }
    await finish();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.illustrationWrap}>
        <View style={[styles.circle, { backgroundColor: colors.primaryLight }]}>
          <View style={styles.notifCard}>
            <Ionicons name="notifications" size={32} color={primaryColor} />
          </View>
        </View>
      </View>

      <Text variant="screenTitle" style={styles.title}>
        {t('mobile.notification_onboarding_title')}
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        {t('mobile.notification_onboarding_subtitle')}
      </Text>

      <View style={styles.footer}>
        <Button label={t('mobile.continue')} onPress={handleContinue} testID="notification-onboarding-continue" />
        <Button label={t('mobile.not_now')} variant="ghost" onPress={finish} testID="notification-onboarding-skip" style={styles.skip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xxl,
  },
  illustrationWrap: { alignItems: 'center', marginVertical: spacing.xxxl },
  circle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { textAlign: 'center', marginBottom: spacing.md },
  subtitle: { textAlign: 'center', color: colors.textMuted, marginBottom: spacing.xxl },
  footer: { marginTop: 'auto' },
  skip: { marginTop: spacing.md },
});
