import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../../hooks/useHaptics';

export default function SignupScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { supabase } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  const handleSignup = async () => {
    if (!email || !password || !confirmPassword) {
      haptics.error();
      Alert.alert(t('common.error'), t('auth.enter_email_first'));
      return;
    }

    if (password !== confirmPassword) {
      haptics.error();
      Alert.alert(t('common.error'), t('toast.new_passwords_do_not_match'));
      return;
    }

    if (password.length < 6) {
      haptics.error();
      Alert.alert(t('common.error'), t('toast.password_min_length'));
      return;
    }

    haptics.medium();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      haptics.success();
      Alert.alert(t('common.success'), t('auth.account_created'));
      router.replace('/(auth)/login');
    } catch (error) {
      haptics.error();
      Alert.alert(t('common.error'), t('auth.signup_failed', { message: error.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('mobile.sign_up_title')}</Text>
      
      <TouchableOpacity 
        onPress={() => {
          haptics.selection();
          router.back();
        }}
        style={styles.loginLink}
      >
        <Text style={styles.loginText}>
          {t('auth.already_have_account')}{' '}
          <Text style={styles.loginLinkText}>{t('auth.sign_in_link')}</Text>
        </Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder={t('auth.email_address')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor="#9CA3AF"
      />

      <TextInput
        style={styles.input}
        placeholder={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry={true}
        placeholderTextColor="#9CA3AF"
      />

      <TextInput
        style={styles.input}
        placeholder={t('mobile.confirm_password')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry={true}
        placeholderTextColor="#9CA3AF"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignup}
        disabled={!!loading}
      >
        <Text style={styles.buttonText}>
          {loading ? `${t('auth.sign_up_link')}...` : t('auth.sign_up_link')}
        </Text>
      </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#1E3A8A',
  },
  loginLink: {
    marginBottom: 32,
    alignItems: 'center',
  },
  loginText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  loginLinkText: {
    color: '#3B82F6',
    fontWeight: '600',
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
});

