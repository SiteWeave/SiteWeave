import { View, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../../hooks/useHaptics';
import { Text } from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import PasswordInput from '../../components/ui/PasswordInput';
import PressableWithFade from '../../components/PressableWithFade';
import AuthOAuthButtons from '../../components/AuthOAuthButtons';
import { finalizeAuthSession } from '../../utils/completeAuthSession';
import { colors, spacing, touch } from '../../theme';
import { sheetBottomPadding } from '../../utils/layoutInsets';

export default function SignupScreen() {
  const { t } = useTranslation();
  const { fullName: fullNameParam } = useLocalSearchParams();
  const initialName = typeof fullNameParam === 'string' ? fullNameParam : '';
  const [fullName, setFullName] = useState(initialName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    supabase,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithApple,
    loadUserOrganization,
  } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  const afterOAuth = () =>
    finalizeAuthSession({
      supabase,
      loadUserOrganization,
      router,
      haptics,
      fromSignup: true,
    });

  const handleSignup = async () => {
    if (!fullName.trim()) {
      haptics.error();
      Alert.alert(t('common.error'), t('mobile.auth_name_required'));
      return;
    }
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
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
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

  const handleOAuth = async (fn) => {
    haptics.medium();
    setLoading(true);
    try {
      await fn();
      await afterOAuth();
    } catch (error) {
      haptics.error();
      Alert.alert(t('common.error'), t('auth.signup_failed', { message: error.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: sheetBottomPadding(insets) }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <PressableWithFade onPress={() => router.back()} style={styles.back} hitSlop={touch.hitSlop}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </PressableWithFade>

        <Text variant="screenTitle" style={styles.title}>
          {t('mobile.sign_up_title')}
        </Text>

        <AuthOAuthButtons
          onApplePress={() => handleOAuth(signInWithApple)}
          onGooglePress={() => handleOAuth(signInWithGoogle)}
          onMicrosoftPress={() => handleOAuth(signInWithMicrosoft)}
          disabled={loading}
          showDivider={false}
        />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text variant="caption">{t('auth.or')}</Text>
          <View style={styles.dividerLine} />
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
          testID="signup-name"
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.email_address')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor={colors.textSubtle}
        />
        <PasswordInput
          placeholder={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          showPassword={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          testID="signup-password"
        />
        <PasswordInput
          placeholder={t('mobile.confirm_password')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          showPassword={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          testID="signup-confirm-password"
          autoComplete="password-new"
        />

        <Button
          label={loading ? `${t('auth.sign_up_link')}…` : t('auth.sign_up_link')}
          onPress={handleSignup}
          disabled={loading}
          testID="signup-submit"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xxl, paddingTop: spacing.lg },
  back: { width: touch.minSize, height: touch.minSize, justifyContent: 'center', marginBottom: spacing.lg },
  title: { marginBottom: spacing.xl },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xxl, gap: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
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
});
