import { View, StyleSheet, Image, ScrollView, Text as RNText } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '../../components/ui/Text';
import PressableWithFade from '../../components/PressableWithFade';
import { colors, spacing } from '../../theme';
import { sheetBottomPadding } from '../../utils/layoutInsets';

const LOGO = require('../../assets/logo-vertical.png');
const HERO = require('../../assets/onboarding-hero.jpg');

/** SiteWeave brand accents for unauthenticated welcome (logo cyan + orange). */
const brand = {
  cta: '#00AEEF',
  signIn: '#F58220',
};

/** Resolve mobile.* key; handles stale Metro bundles that return the key string. */
function tm(t, i18n, key, en, es) {
  const isEs = i18n.language?.startsWith('es');
  const fallback = isEs ? es : en;
  const value = t(key, { defaultValue: fallback });
  return value === key ? fallback : value;
}

export default function AuthWelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();

  const copy = {
    tagline: tm(
      t,
      i18n,
      'mobile.auth_tagline',
      'Keep your job sites on schedule — rain, tasks, and all.',
      'Mantén tus obras a tiempo — lluvia, tareas y más.',
    ),
    getStarted: tm(t, i18n, 'mobile.auth_get_started', 'Get started', 'Comenzar'),
    alreadyHaveAccount: tm(
      t,
      i18n,
      'mobile.auth_already_have_account',
      'Already have an account?',
      '¿Ya tienes una cuenta?',
    ),
    signIn: tm(t, i18n, 'mobile.auth_sign_in', 'Sign in', 'Iniciar sesión'),
    legalPrefix: tm(
      t,
      i18n,
      'mobile.auth_legal_prefix',
      "By clicking 'Get started', you agree to our",
      'Al pulsar «Comenzar», aceptas nuestros',
    ),
    legalAnd: tm(t, i18n, 'mobile.auth_legal_and', 'and acknowledge our', 'y reconoces nuestra'),
    terms: tm(t, i18n, 'mobile.terms_of_service', 'Terms of Service', 'Términos de servicio'),
    privacy: tm(t, i18n, 'mobile.privacy_policy', 'Privacy Policy', 'Política de privacidad'),
  };

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: sheetBottomPadding(insets) }]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Image source={LOGO} style={styles.logo} resizeMode="contain" accessibilityLabel="SiteWeave" />

        <View style={styles.heroWrap}>
          <Image source={HERO} style={styles.hero} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>

        <Text variant="screenTitle" style={styles.headline}>
          {copy.tagline}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <PressableWithFade
          style={styles.ctaButton}
          onPress={() => router.push('/(auth)/signup')}
          testID="auth-welcome-signup"
          accessibilityRole="button"
          accessibilityLabel={copy.getStarted}
        >
          <RNText style={styles.ctaLabel}>{copy.getStarted}</RNText>
        </PressableWithFade>

        <RNText style={styles.signInRow}>
          {copy.alreadyHaveAccount}{' '}
          <RNText
            style={styles.signInLink}
            onPress={() => router.push('/(auth)/login')}
            accessibilityRole="link"
            testID="auth-welcome-login"
          >
            {copy.signIn}
          </RNText>
        </RNText>

        <RNText style={styles.legal}>
          {copy.legalPrefix}{' '}
          <RNText style={styles.legalLink} onPress={() => router.push('/terms-of-service')}>
            {copy.terms}
          </RNText>
          {' '}
          {copy.legalAnd}{' '}
          <RNText style={styles.legalLink} onPress={() => router.push('/privacy-policy')}>
            {copy.privacy}
          </RNText>
          .
        </RNText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xxl,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  logo: {
    width: 200,
    height: 72,
    marginBottom: spacing.xl,
  },
  heroWrap: {
    width: '100%',
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  hero: {
    width: '100%',
    height: '100%',
  },
  headline: {
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    paddingHorizontal: spacing.md,
  },
  footer: {
    paddingTop: spacing.md,
    alignSelf: 'stretch',
    width: '100%',
  },
  ctaButton: {
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: brand.cta,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  ctaLabel: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  signInRow: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
  },
  signInLink: {
    color: brand.signIn,
    fontSize: 16,
    fontWeight: '600',
  },
  legal: {
    marginTop: spacing.xxxl + spacing.lg,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
  },
  legalLink: {
    fontSize: 13,
    lineHeight: 20,
    color: brand.cta,
    fontWeight: '600',
  },
});
