import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../../hooks/useHaptics';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signInWithGoogle, signInWithMicrosoft, signInWithApple, loadUserOrganization } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  const handleLogin = async () => {
    if (!email || !password) {
      haptics.error();
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    haptics.medium();
    setLoading(true);
    try {
      const result = await signIn(email, password);
      // Wait a moment for session to be fully established and persisted
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Load organization after login
      await loadUserOrganization();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      haptics.success();
      router.replace('/(tabs)');
    } catch (error) {
      haptics.error();
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    haptics.medium();
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      // Wait a moment for session to be fully established and persisted
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Load organization after login
      await loadUserOrganization();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      haptics.success();
      router.replace('/(tabs)');
    } catch (error) {
      haptics.error();
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    haptics.medium();
    setLoading(true);
    try {
      const result = await signInWithMicrosoft();
      // Wait a moment for session to be fully established and persisted
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Load organization after login
      await loadUserOrganization();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      haptics.success();
      router.replace('/(tabs)');
    } catch (error) {
      haptics.error();
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    haptics.medium();
    setLoading(true);
    try {
      const result = await signInWithApple();
      // Wait a moment for session to be fully established and persisted
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Load organization after login
      await loadUserOrganization();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      haptics.success();
      router.replace('/(tabs)');
    } catch (error) {
      haptics.error();
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.content}>
        <Text style={styles.title}>Sign in to SiteWeave</Text>
      
      <TouchableOpacity 
        onPress={() => {
          haptics.selection();
          router.push('/(auth)/signup');
        }}
        style={styles.signupLink}
      >
        <Text style={styles.signupText}>
          Don't have an account? <Text style={styles.signupLinkText}>Sign up</Text>
        </Text>
      </TouchableOpacity>

      <Text style={styles.inviteHint}>
        Invited to a project? Sign in with any email — then open the invite link from your contractor.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor="#9CA3AF"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={true}
        placeholderTextColor="#9CA3AF"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={!!loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Text>
      </TouchableOpacity>

      <View style={styles.dividerContainer}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>Or continue with</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.socialButtonsContainer}>
        <TouchableOpacity
          style={[styles.socialButton, loading && styles.buttonDisabled]}
          onPress={handleAppleSignIn}
          disabled={!!loading}
        >
          <FontAwesome5 name="apple" size={20} color="#000000" style={{ marginRight: 8 }} />
          <Text style={styles.socialButtonText}>Apple</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.socialButton, loading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={!!loading}
        >
          <FontAwesome5 name="google" size={20} color="#4285F4" style={{ marginRight: 8 }} />
          <Text style={styles.socialButtonText}>Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.socialButton, loading && styles.buttonDisabled]}
          onPress={handleMicrosoftSignIn}
          disabled={!!loading}
        >
          <FontAwesome5 name="microsoft" size={20} color="#00A4EF" style={{ marginRight: 8 }} />
          <Text style={styles.socialButtonText}>Microsoft</Text>
        </TouchableOpacity>
      </View>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#1E3A8A',
  },
  signupLink: {
    marginBottom: 32,
    alignItems: 'center',
  },
  signupText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  signupLinkText: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  inviteHint: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
    paddingHorizontal: 8,
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#6B7280',
  },
  socialButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  socialButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
});

