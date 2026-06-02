import { View, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../../hooks/useHaptics';
import { Text } from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import PasswordInput from '../../components/ui/PasswordInput';
import PressableWithFade from '../../components/PressableWithFade';
import { routeAfterAuth } from '../../utils/authNavigation';
import { colors, spacing, touch } from '../../theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signInWithGoogle, signInWithMicrosoft, signInWithApple, loadUserOrganization } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  const afterAuth = async () => {
    await new Promise((r) => setTimeout(r, 300));
    await loadUserOrganization();
    await new Promise((r) => setTimeout(r, 200));
    haptics.success();
    await routeAfterAuth(router);
  };

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
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
        />

        <Button
          label={loading ? `${t('auth.sign_in')}…` : t('auth.sign_in')}
          onPress={handleLogin}
          disabled={loading}
          testID="login-submit"
        />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text variant="caption">{t('auth.or_continue_with')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialRow}>
          <PressableWithFade style={styles.socialBtn} onPress={() => handleOAuth(signInWithApple)} disabled={loading}>
            <FontAwesome5 name="apple" size={22} color="#000" />
          </PressableWithFade>
          <PressableWithFade style={styles.socialBtn} onPress={() => handleOAuth(signInWithGoogle)} disabled={loading}>
            <FontAwesome5 name="google" size={22} color="#4285F4" />
          </PressableWithFade>
          <PressableWithFade style={styles.socialBtn} onPress={() => handleOAuth(signInWithMicrosoft)} disabled={loading}>
            <FontAwesome5 name="microsoft" size={22} color="#00A4EF" />
          </PressableWithFade>
        </View>
      </ScrollView>
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
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xxl, gap: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  socialBtn: {
    width: touch.fabSize,
    height: touch.fabSize,
    borderRadius: touch.fabSize / 2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
