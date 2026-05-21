import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  extractProjectInviteTokenFromUrl,
  redeemProjectInvite,
} from '../utils/workspaceClient';

export default function NoOrganizationScreen() {
  const { signOut, supabase, loadUserOrganization, user, organizationError } = useAuth();
  const insets = useSafeAreaInsets();
  const [inviteUrl, setInviteUrl] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [loading, setLoading] = useState(false);

  const isGuestWaiting = organizationError === 'guest_waiting';

  const handleRedeem = async () => {
    const token = extractProjectInviteTokenFromUrl(inviteUrl) || inviteUrl.trim();
    if (!token && !shortCode.trim()) {
      Alert.alert('Invite required', 'Paste your invite link or enter the code from your contractor.');
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
        Alert.alert('Invite problem', result?.error || 'Could not accept invite');
      }
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to redeem invite');
    } finally {
      setLoading(false);
    }
  };

  if (isGuestWaiting) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="mail-outline" size={64} color="#3B82F6" />
          </View>
          <Text style={styles.title}>Waiting for a project invite</Text>
          <Text style={styles.message}>
            Open the invite link from your contractor (email or text). You can sign in with any email or Google — the link connects you to the project.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Paste invite link"
            value={inviteUrl}
            onChangeText={setInviteUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={styles.input}
            placeholder="Or 8-character code"
            value={shortCode}
            onChangeText={(t) => setShortCode(t.toUpperCase())}
            autoCapitalize="characters"
            maxLength={8}
            placeholderTextColor="#9CA3AF"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRedeem}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Open invite</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={signOut}>
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
        </View>
        <Text style={styles.title}>No Organization Found</Text>
        <Text style={styles.message}>
          Your account is not associated with an organization. Use a project invite link, or contact your administrator.
        </Text>
        <TouchableOpacity style={styles.button} onPress={signOut}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    color: '#111827',
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 15,
  },
});
