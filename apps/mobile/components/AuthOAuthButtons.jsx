import { View, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FontAwesome5 } from '@expo/vector-icons';
import GoogleIcon from './icons/GoogleIcon';
import MicrosoftIcon from './icons/MicrosoftIcon';
import PressableWithFade from './PressableWithFade';
import { Text } from './ui/Text';
import { colors, spacing, touch } from '../theme';

export default function AuthOAuthButtons({
  onApplePress,
  onGooglePress,
  onMicrosoftPress,
  disabled = false,
  showDivider = true,
}) {
  const { t } = useTranslation();
  const showApple = Platform.OS === 'ios';

  return (
    <>
      {showDivider ? (
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text variant="caption">{t('auth.or_continue_with')}</Text>
          <View style={styles.dividerLine} />
        </View>
      ) : null}

      <View style={styles.socialRow}>
        {showApple ? (
          <PressableWithFade
            style={styles.socialBtn}
            onPress={onApplePress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.auth_continue_apple', { defaultValue: 'Continue with Apple' })}
            hapticType="light"
            testID="auth-oauth-apple"
          >
            <FontAwesome5 name="apple" size={22} color="#000" />
          </PressableWithFade>
        ) : null}
        <PressableWithFade
          style={styles.socialBtn}
          onPress={onGooglePress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('auth.continue_with_google')}
          hapticType="light"
          testID="auth-oauth-google"
        >
          <GoogleIcon size={22} />
        </PressableWithFade>
        <PressableWithFade
          style={styles.socialBtn}
          onPress={onMicrosoftPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('auth.continue_with_microsoft')}
          hapticType="light"
          testID="auth-oauth-microsoft"
        >
          <MicrosoftIcon size={22} />
        </PressableWithFade>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
