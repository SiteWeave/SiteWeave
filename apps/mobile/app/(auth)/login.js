import { View, StyleSheet, TextInput, Alert } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
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

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    signIn,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithApple,
    loadUserOrganization,
    supabase,
  } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  const afterAuth = () =>
    finalizeAuthSession({
      supabase,
      loadUserOrganization,
      router,
      haptics,
      fromSignup: false,
    });

  const handleLogin = async () => {
    if (!email || !password) {
      haptics.error();
      Alert.alert(t('common.error'), t('auth.enter_email_first'));
      return;
    }
    haptics.medium();
    setLoading(true);
    try {
      await signIn(email, password);
      await afterAuth();
    } catch (error) {
      haptics.error();
      Alert.alert(t('common.error'), t('auth.login_failed', { message: error.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (fn) => {
    haptics.medium();
    setLoading(true);
    try {
      await fn();
      await afterAuth();
    } catch (error) {
      haptics.error();
      Alert.alert(t('common.error'), t('auth.login_failed', { message: error.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: sheetBottomPadding(insets) }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <PressableWithFade onPress={() => router.back()} style={styles.back} hitSlop={touch.hitSlop}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </PressableWithFade>

        <Text variant="screenTitle" style={styles.title}>
          {t('mobile.sign_in_title')}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.email_address')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoCorrect={false}
          returnKeyType="next"
          placeholderTextColor={colors.textSubtle}
          testID="login-email"
        />

        <PasswordInput
          placeholder={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          showPassword={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          testID="login-password"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <Button
          label={loading ? `${t('auth.sign_in')}…` : t('auth.sign_in')}
          onPress={handleLogin}
          disabled={loading}
          testID="login-submit"
        />

        <AuthOAuthButtons
          onApplePress={() => handleOAuth(signInWithApple)}
          onGooglePress={() => handleOAuth(signInWithGoogle)}
          onMicrosoftPress={() => handleOAuth(signInWithMicrosoft)}
          disabled={loading}
        />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xxl, paddingTop: spacing.lg },
  back: { width: touch.minSize, height: touch.minSize, justifyContent: 'center', marginBottom: spacing.lg },
  title: { marginBottom: spacing.xxl },
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
