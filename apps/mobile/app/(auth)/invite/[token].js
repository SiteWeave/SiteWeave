import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useAuth } from '../../../context/AuthContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../../../hooks/useHaptics';
import { acceptInvitation } from '../../../utils/invitationService';
import { routeAfterAuth } from '../../../utils/authNavigation';
import { sheetBottomPadding } from '../../../utils/layoutInsets';

export default function InviteScreen() {
  const { token } = useLocalSearchParams();
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAccepting, setIsAccepting] = useState(false);
  
  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(true);
  
  const { supabase, loadUserOrganization } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  useEffect(() => {
    loadInvitation();
  }, [token]);

  const loadInvitation = async () => {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select(`
          *,
          organizations!inner(name),
          projects:project_id(name, address)
        `)
        .eq('invitation_token', token)
        .maybeSingle();

      if (error || !data) {
        setError('Invalid invitation link');
        setLoading(false);
        return;
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        setError('This invitation has expired');
        setLoading(false);
        return;
      }

      // Check if already accepted
      if (data.status === 'accepted') {
        setError('This invitation has already been accepted');
        setLoading(false);
        return;
      }

      setInvitation(data);
      setEmail(data.email);
      setLoading(false);
    } catch (err) {
      console.error('Error loading invitation:', err);
      setError('Failed to load invitation');
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!fullName || !email || !password) {
      haptics.error();
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      haptics.error();
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    haptics.medium();
    setIsAccepting(true);

    try {
      // Sign up the user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (signUpError) {
        throw new Error(signUpError.message);
      }

      if (!authData?.user) {
        throw new Error('Account created but user data is missing');
      }

      // Accept the invitation
      const result = await acceptInvitation(supabase, token, authData.user.id);

      if (!result.success) {
        throw new Error(result.error || 'Failed to accept invitation');
      }

      await loadUserOrganization(authData.user);
      haptics.success();
      Alert.alert('Success', 'Welcome to ' + (invitation?.organizations?.name || 'SiteWeave') + '!');
      const projectId = invitation?.project_id;
      const inviteDestination = projectId
        ? `/(tabs)/projects/${projectId}`
        : '/(tabs)/projects';
      await routeAfterAuth(router, {
        inviteDestination,
        skipWeather: true,
        user: authData.user,
      });
    } catch (err) {
      haptics.error();
      Alert.alert('Error', err.message);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      haptics.error();
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    haptics.medium();
    setIsAccepting(true);

    try {
      // Sign in the user
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      if (!authData?.user) {
        throw new Error('Sign in failed');
      }

      // Verify email matches invitation
      if (authData.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new Error('This invitation was sent to a different email address');
      }

      // Accept the invitation
      const result = await acceptInvitation(supabase, token, authData.user.id);

      if (!result.success) {
        throw new Error(result.error || 'Failed to accept invitation');
      }

      await loadUserOrganization(authData.user);
      haptics.success();
      Alert.alert('Success', 'Welcome back!');
      const projectId = invitation?.project_id;
      const inviteDestination = projectId
        ? `/(tabs)/projects/${projectId}`
        : '/(tabs)/projects';
      await routeAfterAuth(router, {
        inviteDestination,
        skipWeather: true,
        user: authData.user,
      });
    } catch (err) {
      haptics.error();
      Alert.alert('Error', err.message);
    } finally {
      setIsAccepting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading invitation...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: sheetBottomPadding(insets) }]}>
        <View style={styles.centerContent}>
          <Text style={styles.errorTitle}>Invalid Invitation</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            onPress={() => {
              haptics.selection();
              router.replace('/(auth)/login');
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: sheetBottomPadding(insets) }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <View style={styles.content}>
        <Text style={styles.title}>You're Invited!</Text>
        <Text style={styles.subtitle}>
          Join {invitation?.organizations?.name || 'an organization'} on SiteWeave
        </Text>

        {invitation?.projects && (
          <View style={styles.projectInfo}>
            <Text style={styles.projectLabel}>Project:</Text>
            <Text style={styles.projectName}>{invitation.projects.name}</Text>
          </View>
        )}

        <View style={styles.toggleContainer}>
          <TouchableOpacity 
            onPress={() => {
              haptics.selection();
              setIsSignUp(true);
            }}
            style={[styles.toggleButton, isSignUp && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, isSignUp && styles.toggleTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => {
              haptics.selection();
              setIsSignUp(false);
            }}
            style={[styles.toggleButton, !isSignUp && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, !isSignUp && styles.toggleTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>
        </View>

        {isSignUp && (
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            placeholderTextColor="#9CA3AF"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoCorrect={false}
          placeholderTextColor="#9CA3AF"
          editable={!isSignUp} // Email is locked to invitation email for sign-up
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={true}
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          placeholderTextColor="#9CA3AF"
        />

        <TouchableOpacity
          style={[styles.button, isAccepting && styles.buttonDisabled]}
          onPress={isSignUp ? handleSignUp : handleSignIn}
          disabled={isAccepting}
        >
          <Text style={styles.buttonText}>
            {isAccepting ? 'Processing...' : isSignUp ? 'Create Account & Join' : 'Sign In & Join'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#1E3A8A',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  projectInfo: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  projectLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  toggleTextActive: {
    color: '#3B82F6',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
    color: '#111827',
  },
  button: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#DC2626',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
});

