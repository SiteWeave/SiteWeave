import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { routeAfterAuth } from '../../utils/authNavigation';
import {
  redeemProjectInvite,
  storePendingProjectInviteToken,
} from '../../utils/workspaceClient';
import { colors, spacing } from '../../theme';
import { contentTopInset, sheetBottomPadding } from '../../utils/layoutInsets';

export default function ProjectInviteDeepLinkScreen() {
  const { token } = useLocalSearchParams();
  const { user, supabase, loadUserOrganization } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('Accepting invite…');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const inviteToken = Array.isArray(token) ? token[0] : token;
      if (!inviteToken) {
        setMessage('Invalid invite link');
        return;
      }

      if (!user) {
        await storePendingProjectInviteToken(inviteToken);
        if (!cancelled) {
          router.replace('/(auth)/login');
        }
        return;
      }

      const result = await redeemProjectInvite(supabase, { token: inviteToken });
      if (cancelled) return;

      if (result?.success && result.projectId) {
        await loadUserOrganization(user);
        await routeAfterAuth(router, {
          inviteDestination: `/(tabs)/projects/${result.projectId}`,
          skipWeather: true,
          user,
        });
        return;
      }

      setMessage(result?.error || 'Could not accept invite');
      setTimeout(() => {
        if (!cancelled) router.replace('/(tabs)');
      }, 2500);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [token, user, supabase, router, loadUserOrganization]);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: contentTopInset(insets, spacing.xxl),
          paddingBottom: sheetBottomPadding(insets),
        },
      ]}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xxl,
  },
  text: {
    marginTop: spacing.lg,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
