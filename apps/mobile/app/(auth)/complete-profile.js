import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../../hooks/useHaptics';
import { Text } from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import PressableWithFade from '../../components/PressableWithFade';
import Avatar from '../../components/ui/Avatar';
import OnboardingProgressBar from '../../components/OnboardingProgressBar';
import { useProfileAvatarPicker } from '../../hooks/useProfileAvatarPicker';
import { getAuthDisplayName, syncContactName, setPendingSignupProfileSetup } from '../../utils/authProfile';
import { routeAfterAuth } from '../../utils/authNavigation';
import { provisionPersonalWorkspace } from '../../utils/workspaceClient';
import { colors, spacing, touch, radius } from '../../theme';
import { sheetBottomPadding } from '../../utils/layoutInsets';
import { useBranding } from '../../context/BrandingContext';

const AVATAR_SIZE = 112;

export default function CompleteProfileScreen() {
  const { t } = useTranslation();
  const { fromSignup } = useLocalSearchParams();
  const isSignupFlow = fromSignup === '1' || fromSignup === 'true';
  const { user, supabase, loadUserOrganization, profileAvatarUrl, refreshProfileAvatar } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { primaryColor } = useBranding();
  const { avatarLoading, pickAvatar } = useProfileAvatarPicker();

  const [fullName, setFullName] = useState('');
  const [accountIntent, setAccountIntent] = useState('workspace_owner');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(getAuthDisplayName(user));
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user || isSignupFlow) return;
    if (!getAuthDisplayName(user)) return;

    routeAfterAuth(router, { user, fromSignup: false }).catch((error) => {
      console.warn('Profile already complete, routing failed:', error?.message || error);
    });
  }, [user?.id, isSignupFlow, router]);

  const handleContinue = async () => {
    if (!user || !supabase) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      haptics.error();
      Alert.alert(t('common.error'), t('mobile.auth_name_required'));
      return;
    }

    haptics.medium();
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { full_name: trimmedName },
      });
      if (updateError) throw updateError;

      await syncContactName(supabase, user.id, trimmedName);

      if (isSignupFlow) {
        await supabase.from('profiles').upsert(
          {
            id: user.id,
            account_intent: accountIntent,
            role: 'Team',
          },
          { onConflict: 'id' },
        );

        if (accountIntent === 'workspace_owner') {
          const result = await provisionPersonalWorkspace(supabase);
          if (!result?.success && !result?.alreadyProvisioned) {
            console.warn('Workspace provision after signup:', result?.error);
          }
        }
      }

      await refreshProfileAvatar();
      await loadUserOrganization(user);
      await setPendingSignupProfileSetup(false);

      const { data: { user: updatedUser } } = await supabase.auth.getUser();
      haptics.success();
      await routeAfterAuth(router, { user: updatedUser, fromSignup: false });
    } catch (error) {
      haptics.error();
      Alert.alert(
        t('common.error'),
        t('mobile.complete_profile_failed', { message: error?.message || String(error) }),
      );
    } finally {
      setLoading(false);
    }
  };

  const displayName = fullName.trim() || getAuthDisplayName(user) || '';
  const hasPhoto = Boolean(profileAvatarUrl);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <OnboardingProgressBar currentStep={3} totalSteps={4} style={styles.progress} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: sheetBottomPadding(insets, spacing.xxl) },
          ]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <PressableWithFade
            onPress={() => router.back()}
            style={styles.back}
            hitSlop={touch.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            testID="complete-profile-back"
          >
            <Ionicons name="chevron-back" size={28} color={colors.textMuted} />
          </PressableWithFade>

          <Text style={styles.title} testID="complete-profile-title">
            {t('mobile.complete_profile_title')}
          </Text>

          <View style={styles.avatarSection}>
            <PressableWithFade
              onPress={pickAvatar}
              disabled={avatarLoading || loading}
              style={styles.avatarButton}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.complete_profile_add_photo')}
              hapticType="light"
              testID="complete-profile-avatar"
            >
              {hasPhoto ? (
                <Avatar
                  name={displayName || user?.email || '?'}
                  avatarUrl={profileAvatarUrl}
                  size="xl"
                  style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    borderRadius: AVATAR_SIZE / 2,
                  }}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={52} color={colors.white} />
                </View>
              )}
              {avatarLoading ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={colors.white} />
                </View>
              ) : null}
            </PressableWithFade>
            <PressableWithFade
              onPress={pickAvatar}
              disabled={avatarLoading || loading}
              hapticType="light"
              testID="complete-profile-add-photo"
            >
              <Text style={[styles.photoLink, { color: primaryColor }]}>
                {hasPhoto
                  ? t('mobile.complete_profile_change_photo')
                  : t('mobile.complete_profile_add_photo')}
              </Text>
            </PressableWithFade>
          </View>

          <Text style={styles.fieldLabel}>{t('mobile.complete_profile_name_label')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('mobile.auth_name_placeholder')}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            placeholderTextColor={colors.textSubtle}
            editable={!loading}
            testID="complete-profile-name"
          />

          {isSignupFlow ? (
            <View style={styles.intentSection}>
              <Text style={styles.intentLabel}>
                {t('mobile.complete_profile_intent_label')}
              </Text>
              <View style={styles.intentRow}>
                <PressableWithFade
                  style={[
                    styles.intentChip,
                    accountIntent === 'workspace_owner' && {
                      borderColor: primaryColor,
                      backgroundColor: `${primaryColor}14`,
                    },
                  ]}
                  onPress={() => setAccountIntent('workspace_owner')}
                  disabled={loading}
                  hapticType="selection"
                >
                  <Text
                    style={[
                      styles.intentChipText,
                      accountIntent === 'workspace_owner' && { color: primaryColor },
                    ]}
                  >
                    {t('auth.manage_projects')}
                  </Text>
                </PressableWithFade>
                <PressableWithFade
                  style={[
                    styles.intentChip,
                    accountIntent === 'guest_only' && {
                      borderColor: primaryColor,
                      backgroundColor: `${primaryColor}14`,
                    },
                  ]}
                  onPress={() => setAccountIntent('guest_only')}
                  disabled={loading}
                  hapticType="selection"
                >
                  <Text
                    style={[
                      styles.intentChipText,
                      accountIntent === 'guest_only' && { color: primaryColor },
                    ]}
                  >
                    {t('auth.invited_to_project')}
                  </Text>
                </PressableWithFade>
              </View>
              {accountIntent === 'guest_only' ? (
                <Text style={styles.intentHint}>{t('auth.invite_link_hint')}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.footerSpacer} />

          <Button
            label={loading ? `${t('mobile.continue')}…` : t('mobile.continue')}
            onPress={handleContinue}
            disabled={loading || avatarLoading}
            testID="complete-profile-submit"
            style={styles.continueButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  progress: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
  },
  back: {
    width: touch.minSize,
    height: touch.minSize,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 38,
    marginBottom: spacing.xxxl,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
    gap: spacing.md,
  },
  avatarButton: {
    position: 'relative',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLink: {
    fontSize: 16,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: 17,
    minHeight: touch.minSize,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  intentSection: {
    marginTop: spacing.xxl,
  },
  intentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  intentRow: { flexDirection: 'row', gap: spacing.sm },
  intentChip: {
    flex: 1,
    minHeight: touch.minSize,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  intentChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 18,
  },
  intentHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  footerSpacer: {
    flexGrow: 1,
    minHeight: spacing.xxxl,
  },
  continueButton: {
    borderRadius: radius.pill,
  },
});
