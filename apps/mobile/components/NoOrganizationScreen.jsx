import { View, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PressableWithFade from './PressableWithFade';
import { Text } from './ui/Text';
import Button from './ui/Button';
import { colors, spacing } from '../theme';
import {
  extractProjectInviteTokenFromUrl,
  redeemProjectInvite,
  provisionPersonalWorkspace,
} from '../utils/workspaceClient';
import { sheetBottomPadding } from '../utils/layoutInsets';

export default function NoOrganizationScreen() {
  const { signOut, supabase, loadUserOrganization, user, organizationError } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [inviteUrl, setInviteUrl] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  const isGuestWaiting = organizationError === 'guest_waiting';
  const busy = loading || provisioning;

  const handleCreateWorkspace = async () => {
    if (!user?.id || busy) return;
    setProvisioning(true);
    try {
      await supabase.from('profiles').upsert(
        {
          id: user.id,
          account_intent: 'workspace_owner',
          role: 'Team',
        },
        { onConflict: 'id' },
      );
      const result = await provisionPersonalWorkspace(supabase, { force: true });
      if (result?.success) {
        await loadUserOrganization(user);
        Alert.alert(t('common.success'), t('mobile.guest_workspace_ready'));
      } else {
        Alert.alert(t('common.error'), result?.error || t('mobile.guest_workspace_failed'));
      }
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('mobile.guest_workspace_failed'));
    } finally {
      setProvisioning(false);
    }
  };

  const handleRedeem = async () => {
    const token = extractProjectInviteTokenFromUrl(inviteUrl) || inviteUrl.trim();
    if (!token && !shortCode.trim()) {
      Alert.alert(t('common.error'), t('mobile.guest_invite_required'));
      return;
    }
    setLoading(true);
    try {
      const result = await redeemProjectInvite(supabase, {
        token: token.length > 20 ? token : undefined,
        shortCode: shortCode.trim() || undefined,
      });
      if (result?.success) {
        await loadUserOrganization(user);
      } else {
        Alert.alert(t('common.error'), result?.error || t('mobile.guest_invite_problem'));
      }
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('mobile.guest_invite_problem'));
    } finally {
      setLoading(false);
    }
  };

  if (isGuestWaiting) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: sheetBottomPadding(insets) }]}>
        <KeyboardAwareScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          <View style={styles.iconContainer}>
            <Ionicons name="mail-outline" size={64} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('mobile.guest_waiting_title')}</Text>
          <Text variant="bodyMedium" style={styles.message}>
            {t('mobile.guest_waiting_message')}
          </Text>

          <TextInput
            style={styles.input}
            placeholder={t('mobile.guest_paste_invite')}
            value={inviteUrl}
            onChangeText={setInviteUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            placeholderTextColor={colors.textSubtle}
          />
          <TextInput
            style={styles.input}
            placeholder={t('mobile.guest_invite_code')}
            value={shortCode}
            onChangeText={(value) => setShortCode(value.toUpperCase())}
            autoCapitalize="characters"
            maxLength={8}
            placeholderTextColor={colors.textSubtle}
          />

          <Button
            label={loading ? t('common.loading', { defaultValue: 'Loading…' }) : t('mobile.guest_open_invite')}
            onPress={handleRedeem}
            disabled={busy}
          />

          <PressableWithFade onPress={signOut} disabled={busy} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('common.sign_out')}</Text>
          </PressableWithFade>

          <PressableWithFade
            onPress={handleCreateWorkspace}
            disabled={busy}
            style={styles.pmLinkWrap}
            testID="create-workspace-pm-link"
          >
            {provisioning ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.pmLink}>{t('mobile.guest_i_am_pm')}</Text>
            )}
          </PressableWithFade>
        </KeyboardAwareScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: sheetBottomPadding(insets) }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        </View>
        <Text style={styles.title}>{t('mobile.no_org_title')}</Text>
        <Text variant="bodyMedium" style={styles.message}>
          {t('mobile.no_org_message')}
        </Text>
        <Button
          label={provisioning ? t('mobile.guest_creating_workspace') : t('mobile.no_org_create_workspace')}
          onPress={handleCreateWorkspace}
          disabled={busy}
        />
        <PressableWithFade onPress={signOut} disabled={busy} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('common.sign_out')}</Text>
        </PressableWithFade>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    padding: spacing.xxl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  message: {
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: 24,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  secondaryButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  pmLinkWrap: {
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  pmLink: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
