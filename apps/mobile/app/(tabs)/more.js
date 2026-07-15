import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/Text';
import Card from '../../components/ui/Card';
import AppHeader from '../../components/ui/AppHeader';
import PressableWithFade from '../../components/PressableWithFade';
import ProfileDrawer from '../../components/ProfileDrawer';
import FeedbackModal from '../../components/FeedbackModal';
import ChangePasswordSheet from '../../components/ChangePasswordSheet';
import Avatar from '../../components/ui/Avatar';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSyncStatus } from '../../context/SyncStatusContext';
import { useAppUpdate } from '../../context/AppUpdateContext';
import i18n from '../../i18n';
import { useHaptics } from '../../hooks/useHaptics';
import { usePlatformDeveloper } from '../../hooks/usePlatformDeveloper';
import { useBranding } from '../../context/BrandingContext';
import { colors, spacing, touch } from '../../theme';
import { scrollBottomPadding, contentTopInset } from '../../utils/layoutInsets';
import { ensureLocaleLoaded, normalizeLng } from '@siteweave/i18n';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, i18n: i18nFromHook } = useTranslation();
  const { user, activeOrganization, profileAvatarUrl } = useAuth();
  const { isOnline, queueSize, isSyncing, flushQueue } = useSyncStatus();
  const { nativeVersion, otaStatusLabelKey } = useAppUpdate();
  const { isPlatformDeveloper } = usePlatformDeveloper();
  const { primaryColor } = useBranding();
  const haptics = useHaptics();
  const [showProfile, setShowProfile] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const displayName =
    user?.user_metadata?.full_name?.trim() ||
    user?.email?.split('@')[0] ||
    'User';

  const legalLinks = [
    { labelKey: 'mobile.privacy_policy', icon: 'shield-checkmark-outline', route: '/privacy-policy', testID: 'more-privacy' },
    { labelKey: 'mobile.terms_of_service', icon: 'document-text-outline', route: '/terms-of-service', testID: 'more-terms' },
  ];

  const activeLng = normalizeLng(i18nFromHook.language || i18n.language);

  const handleLanguageChange = async (lng) => {
    haptics.selection();
    await ensureLocaleLoaded(i18n, lng);
    await i18n.changeLanguage(lng);
  };

  return (
    <View style={[styles.screen, { paddingTop: contentTopInset(insets) }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding(insets, spacing.xxl) }]}>
        <AppHeader title={t('mobile.tab_more')} testID="more-header" dense />

        <PressableWithFade onPress={() => setShowProfile(true)} style={styles.hero} testID="more-profile-hero">
          <Avatar name={displayName} avatarUrl={profileAvatarUrl} size="xl" />
          <Text variant="screenTitle" style={styles.heroTitle}>
            {displayName}
          </Text>
          {activeOrganization?.name ? (
            <Text variant="bodyMedium" style={styles.orgName}>
              {activeOrganization.name}
            </Text>
          ) : null}
          <Text variant="bodyMedium" style={[styles.viewProfileLink, { color: primaryColor }]}>
            {t('mobile.view_profile')}
          </Text>
        </PressableWithFade>

        {(queueSize > 0 || !isOnline) ? (
        <Card style={styles.card}>
            <PressableWithFade
              style={styles.row}
              onPress={flushQueue}
              disabled={isSyncing}
              testID="more-sync-status"
            >
              <Ionicons
                name={isOnline ? 'cloud-upload-outline' : 'cloud-offline-outline'}
                size={24}
                color={isOnline ? colors.primary : colors.error}
              />
              <Text variant="body" style={styles.rowLabel}>
                {isSyncing
                  ? t('mobile.sync_syncing')
                  : !isOnline
                    ? t('mobile.sync_offline', { count: queueSize })
                    : t('mobile.sync_pending', { count: queueSize })}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
            </PressableWithFade>
        </Card>
        ) : null}

        <Text variant="sectionTitle" style={styles.sectionTitle}>
          {t('settings.title')}
        </Text>
        <Card style={styles.card}>
          <PressableWithFade
            style={[styles.row, styles.rowBorder]}
            onPress={() => {
              haptics.light();
              setShowChangePassword(true);
            }}
            testID="more-change-password"
          >
            <Ionicons name="lock-closed-outline" size={24} color={colors.textSecondary} />
            <Text variant="body" style={styles.rowLabel}>
              {t('settings.change_password')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          </PressableWithFade>

          <PressableWithFade
            style={[styles.row, styles.rowBorder]}
            onPress={() => router.push('/blocked-users')}
            testID="more-blocked-users"
          >
            <Ionicons name="ban-outline" size={24} color={colors.textSecondary} />
            <Text variant="body" style={styles.rowLabel}>
              {t('mobile.blocked_users_menu')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          </PressableWithFade>

          <PressableWithFade
            style={[styles.row, styles.rowBorder]}
            onPress={() => setShowFeedback(true)}
            testID="more-feedback"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.textSecondary} />
            <Text variant="body" style={styles.rowLabel}>
              {t('mobile.send_feedback')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          </PressableWithFade>

          {isPlatformDeveloper ? (
            <PressableWithFade
              style={[styles.row, styles.rowBorder]}
              onPress={() => router.push('/admin-reports')}
              testID="more-content-reports"
            >
              <Ionicons name="shield-checkmark-outline" size={24} color={colors.textSecondary} />
              <Text variant="body" style={styles.rowLabel}>
                {t('mobile.content_reports')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
            </PressableWithFade>
          ) : null}

          <View style={[styles.row, styles.rowBorder]}>
            <Ionicons name="language-outline" size={24} color={colors.textSecondary} />
            <Text variant="body" style={styles.rowLabel} numberOfLines={1}>
              {t('settings.language')}
            </Text>
            <View style={styles.langChips}>
              <PressableWithFade
                style={[styles.langChip, activeLng === 'en' && styles.langChipActive]}
                onPress={() => handleLanguageChange('en')}
                testID="more-lang-en"
              >
                <Text style={[styles.langChipText, activeLng === 'en' && styles.langChipTextActive]}>EN</Text>
              </PressableWithFade>
              <PressableWithFade
                style={[styles.langChip, activeLng === 'es' && styles.langChipActive]}
                onPress={() => handleLanguageChange('es')}
                testID="more-lang-es"
              >
                <Text style={[styles.langChipText, activeLng === 'es' && styles.langChipTextActive]}>ES</Text>
              </PressableWithFade>
            </View>
          </View>

          {legalLinks.map((link) => (
            <PressableWithFade
              key={link.route}
              style={[styles.row, styles.rowBorder]}
              onPress={() => router.push(link.route)}
              testID={link.testID}
            >
              <Ionicons name={link.icon} size={24} color={colors.textSecondary} />
              <Text variant="body" style={styles.rowLabel}>
                {t(link.labelKey)}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
            </PressableWithFade>
          ))}

          <View style={[styles.row, styles.rowBorder]}>
            <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />
            <Text variant="body" style={styles.rowLabel}>
              {t('mobile.update_version_label')}
            </Text>
            <Text variant="bodyMedium" style={styles.metaValue}>
              {nativeVersion}
            </Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="refresh-circle-outline" size={24} color={colors.textSecondary} />
            <Text variant="body" style={styles.rowLabel}>
              {t('mobile.update_status_label')}
            </Text>
            <Text variant="bodyMedium" style={styles.metaValue} numberOfLines={2}>
              {t(otaStatusLabelKey)}
            </Text>
          </View>
        </Card>
      </ScrollView>

      <ProfileDrawer visible={showProfile} onClose={() => setShowProfile(false)} />
      <FeedbackModal visible={showFeedback} onClose={() => setShowFeedback(false)} />
      <ChangePasswordSheet
        visible={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.lg },
  hero: { alignItems: 'center', marginBottom: spacing.lg, marginTop: 0 },
  heroTitle: { fontSize: 22, marginTop: spacing.sm, marginBottom: 2, textAlign: 'center' },
  orgName: { color: colors.textMuted, textAlign: 'center', marginBottom: 2 },
  viewProfileLink: { fontWeight: '600', textAlign: 'center', marginTop: 2 },
  sectionTitle: { marginBottom: spacing.md, marginTop: spacing.sm },
  card: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touch.minRowHeight,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 24,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  langChips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: spacing.sm,
  },
  langChip: {
    minWidth: 48,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  langChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  langChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    includeFontPadding: false,
    lineHeight: 18,
  },
  langChipTextActive: { color: colors.primary },
  metaValue: {
    flexShrink: 1,
    maxWidth: '46%',
    color: colors.textMuted,
    textAlign: 'right',
    fontSize: 15,
    lineHeight: 20,
  },
});
