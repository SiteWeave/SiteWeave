import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import {
  redeemProjectInvite,
  storePendingProjectInviteToken,
} from '../../utils/workspaceClient';

export default function ProjectInviteDeepLinkScreen() {
  const { token } = useLocalSearchParams();
  const { user, supabase, loadUserOrganization } = useAuth();
  const router = useRouter();
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
        router.replace(`/(tabs)/projects/${result.projectId}`);
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
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 24,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
  },
});
