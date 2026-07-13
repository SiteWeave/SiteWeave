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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../../hooks/useHaptics';
import { Text } from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import PressableWithFade from '../../components/PressableWithFade';
import Avatar from '../../components/ui/Avatar';
import { useProfileAvatarPicker } from '../../hooks/useProfileAvatarPicker';
import { getAuthDisplayName, syncContactName, setPendingSignupProfileSetup } from '../../utils/authProfile';
import { routeAfterAuth } from '../../utils/authNavigation';
import { provisionPersonalWorkspace } from '../../utils/workspaceClient';
import { colors, spacing, touch } from '../../theme';
import { sheetBottomPadding } from '../../utils/layoutInsets';

export default function CompleteProfileScreen() {
  const { t } = useTranslation();
  const { fromSignup } = useLocalSearchParams();
  const isSignupFlow = fromSignup === '1' || fromSignup === 'true';
  const { user, supabase, loadUserOrganization, profileAvatarUrl, refreshProfileAvatar } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
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

  const displayName = fullName.trim() || getAuthDisplayName(user) || user?.email || '';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: sheetBottomPadding(insets) }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text variant="screenTitle" style={styles.title}>
          {t('mobile.complete_profile_title')}
        </Text>
        <Text variant="body" style={styles.subtitle}>
          {t('mobile.complete_profile_subtitle')}
        </Text>

        <View style={styles.avatarSection}>
          <PressableWithFade
            onPress={pickAvatar}
            disabled={avatarLoading || loading}
            style={styles.avatarButton}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.complete_profile_add_photo')}
            hapticType="light"
          >
            <Avatar name={displayName} avatarUrl={profileAvatarUrl} size="xl" />
            {avatarLoading ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : null}
          </PressableWithFade>
          <PressableWithFade onPress={pickAvatar} disabled={avatarLoading || loading} hapticType="light">
            <Text variant="caption" style={styles.photoLink}>
              {profileAvatarUrl
                ? t('mobile.complete_profile_change_photo')
                : t('mobile.complete_profile_add_photo')}
            </Text>
          </PressableWithFade>
          <Text variant="caption" style={styles.photoHint}>
            {t('mobile.complete_profile_photo_optional')}
          </Text>
        </View>

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
            <Text variant="caption" style={styles.intentLabel}>
              {t('mobile.complete_profile_intent_label')}
            </Text>
            <View style={styles.intentRow}>
              <PressableWithFade
                style={[
                  styles.intentChip,
                  accountIntent === 'workspace_owner' && styles.intentChipActive,
                ]}
                onPress={() => setAccountIntent('workspace_owner')}
                disabled={loading}
                hapticType="selection"
              >
                <Text
                  variant="caption"
                  style={[
                    styles.intentChipText,
                    accountIntent === 'workspace_owner' && styles.intentChipTextActive,
                  ]}
                >
                  {t('auth.manage_projects')}
                </Text>
              </PressableWithFade>
              <PressableWithFade
                style={[
                  styles.intentChip,
                  accountIntent === 'guest_only' && styles.intentChipActive,
                ]}
                onPress={() => setAccountIntent('guest_only')}
                disabled={loading}
                hapticType="selection"
              >
                <Text
                  variant="caption"
                  style={[
                    styles.intentChipText,
                    accountIntent === 'guest_only' && styles.intentChipTextActive,
                  ]}
                >
                  {t('auth.invited_to_project')}
                </Text>
              </PressableWithFade>
            </View>
            {accountIntent === 'guest_only' ? (
              <Text variant="caption" style={styles.intentHint}>
                {t('auth.invite_link_hint')}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Button
          label={loading ? `${t('mobile.continue')}…` : t('mobile.continue')}
          onPress={handleContinue}
          disabled={loading || avatarLoading}
          testID="complete-profile-submit"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xxl, paddingTop: spacing.lg },
  title: { marginBottom: spacing.sm },
  subtitle: { color: colors.textMuted, marginBottom: spacing.xxl, lineHeight: 22 },
  avatarSection: { alignItems: 'center', marginBottom: spacing.xxl, gap: spacing.sm },
  avatarButton: { position: 'relative' },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLink: { color: colors.primary, fontWeight: '700' },
  photoHint: { color: colors.textMuted, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    padding: spacing.lg,
    fontSize: 17,
    minHeight: touch.minSize,
    marginBottom: spacing.lg,
    color: colors.text,
  },
  intentSection: { marginBottom: spacing.xxl },
  intentLabel: { color: colors.textMuted, marginBottom: spacing.sm, fontWeight: '600' },
  intentRow: { flexDirection: 'row', gap: spacing.sm },
  intentChip: {
    flex: 1,
    minHeight: touch.minSize,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  intentChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  intentChipText: { color: colors.text, fontWeight: '600', textAlign: 'center' },
  intentChipTextActive: { color: colors.primary },
  intentHint: { color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
});
