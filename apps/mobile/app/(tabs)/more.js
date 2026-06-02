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
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import i18n from '../../i18n';
import { useHaptics } from '../../hooks/useHaptics';
import { colors, spacing, touch } from '../../theme';
import { useBranding } from '../../context/BrandingContext';
import { scrollBottomPadding } from '../../components/ui/FloatingTabBar';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, activeOrganization } = useAuth();
  const { primaryColor } = useBranding();
  const haptics = useHaptics();
  const [showProfile, setShowProfile] = useState(false);

  const settingsLinks = [
    { labelKey: 'mobile.privacy_policy', icon: 'shield-checkmark-outline', route: '/privacy-policy', testID: 'more-privacy' },
    { labelKey: 'mobile.terms_of_service', icon: 'document-text-outline', route: '/terms-of-service', testID: 'more-terms' },
  ];

  const initials = (user?.email?.[0] || 'U').toUpperCase();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding(insets, spacing.lg) }]}>
        <AppHeader title={t('mobile.tab_more')} testID="more-header" />

        <PressableWithFade onPress={() => setShowProfile(true)} style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text variant="screenTitle" style={styles.heroTitle}>
            {activeOrganization?.name || 'SiteWeave'}
          </Text>
          <Text variant="bodyMedium" style={{ color: primaryColor }}>
            {t('mobile.view_profile')}
          </Text>
        </PressableWithFade>

        <Card style={styles.card}>
          <PressableWithFade
            style={styles.row}
            onPress={() => router.push('/(tabs)/notifications')}
            testID="more-notifications"
          >
            <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
            <Text variant="body" style={styles.rowLabel}>
              {t('mobile.notifications_title')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          </PressableWithFade>
        </Card>

        <Text variant="sectionTitle" style={styles.sectionTitle}>
          {t('settings.title')}
        </Text>
        <Card style={styles.card}>
          <View style={[styles.row, styles.rowBorder]}>
            <Ionicons name="language-outline" size={24} color={colors.textSecondary} />
            <Text variant="body" style={styles.rowLabel} numberOfLines={1}>
              {t('settings.language')}
            </Text>
            <View style={styles.langChips}>
              <PressableWithFade
                style={[styles.langChip, i18n.language === 'en' && styles.langChipActive]}
                onPress={() => {
                  haptics.selection();
                  i18n.changeLanguage('en');
                }}
                testID="more-lang-en"
              >
                <Text style={[styles.langChipText, i18n.language === 'en' && styles.langChipTextActive]}>EN</Text>
              </PressableWithFade>
              <PressableWithFade
                style={[styles.langChip, i18n.language === 'es' && styles.langChipActive]}
                onPress={() => {
                  haptics.selection();
                  i18n.changeLanguage('es');
                }}
                testID="more-lang-es"
              >
                <Text style={[styles.langChipText, i18n.language === 'es' && styles.langChipTextActive]}>ES</Text>
              </PressableWithFade>
            </View>
          </View>
          {settingsLinks.map((link, i) => (
            <PressableWithFade
              key={link.route}
              style={[styles.row, i < settingsLinks.length - 1 && styles.rowBorder]}
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
        </Card>
      </ScrollView>

      <ProfileDrawer visible={showProfile} onClose={() => setShowProfile(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.lg },
  hero: { alignItems: 'center', marginBottom: spacing.xxl, marginTop: spacing.md },
  sectionTitle: { marginBottom: spacing.md, marginTop: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: colors.white },
  heroTitle: { fontSize: 22, marginBottom: spacing.xs },
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
});
