import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../i18n';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { I18nextProvider } from 'react-i18next';
import i18n, { i18nReady } from '../i18n';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { SyncStatusProvider } from '../context/SyncStatusContext';
import { AppUpdateProvider } from '../context/AppUpdateContext';
import { BrandingProvider } from '../context/BrandingContext';
import { MobileExperienceProvider } from '../context/MobileExperienceContext';
import { useEffect, useRef, useState } from 'react';
import NoOrganizationScreen from '../components/NoOrganizationScreen';
import StoreUpdateModal from '../components/StoreUpdateModal';
import ReviewPromptModal from '../components/ReviewPromptModal';
import {
  getNextOnboardingRoute,
  getPendingInviteOnboarding,
  clearPendingInviteOnboarding,
  isOnboardingScreen,
  isAuthSetupScreen,
  clearLegacyDeviceOnboardingFlags,
} from '../utils/onboarding';
import { needsProfileCompletion, hasPendingSignupProfileSetup } from '../utils/authProfile';
import { getLastNotificationRoute } from '../utils/notifications';
import { initSentry, setSentryUser } from '../utils/sentry';

initSentry();

function RootLayoutNav() {
  const {
    user,
    loading,
    activeOrganization,
    organizationError,
    isProjectCollaborator,
    pendingNotificationRoute,
    clearPendingNotificationRoute,
  } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const inAuthGroup = segments[0] === '(auth)';
  const onProjectInvite = segments[0] === 'project-invite';
  const authScreen = segments[1];
  const onOnboardingScreen = inAuthGroup && isOnboardingScreen(authScreen);
  const onCompleteProfile = inAuthGroup && isAuthSetupScreen(authScreen);
  const handledColdStartNav = useRef(false);

  useEffect(() => {
    if (user?.id) {
      setSentryUser({ id: user.id, email: user.email });
    } else {
      setSentryUser(null);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user) {
      handledColdStartNav.current = false;
    }
  }, [user]);

  useEffect(() => {
    clearLegacyDeviceOnboardingFlags().catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;

    const timer = setTimeout(async () => {
      if (!user) {
        if (!inAuthGroup && !onProjectInvite) {
          router.replace('/(auth)');
        }
        return;
      }

      if (onProjectInvite) return;

      if (needsProfileCompletion(user) || (await hasPendingSignupProfileSetup())) {
        if (!onCompleteProfile) {
          const pendingSignup = await hasPendingSignupProfileSetup();
          router.replace(
            pendingSignup ? '/(auth)/complete-profile?fromSignup=1' : '/(auth)/complete-profile',
          );
        }
        return;
      }

      const pending = await getPendingInviteOnboarding();
      const nextRoute = await getNextOnboardingRoute({
        userId: user.id,
        skipWeather: pending.skipWeather,
      });

      if (nextRoute) {
        if (onOnboardingScreen || onCompleteProfile) return;
        router.replace(nextRoute);
        return;
      }

      if (inAuthGroup && !onProjectInvite && !onCompleteProfile) {
        const destination = pending.inviteDestination ?? '/(tabs)';
        if (pending.inviteDestination) {
          await clearPendingInviteOnboarding();
        }
        router.replace(destination);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [user, loading, segments, router]);

  useEffect(() => {
    if (loading || !user || handledColdStartNav.current) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled || handledColdStartNav.current) return;

      const route = pendingNotificationRoute || (await getLastNotificationRoute());
      if (cancelled || handledColdStartNav.current) return;

      if (route) {
        handledColdStartNav.current = true;
        if (route.startsWith('http://') || route.startsWith('https://')) {
          const { default: Linking } = await import('expo-linking');
          Linking.openURL(route).catch(() => {});
        } else {
          router.push(route);
        }
        clearPendingNotificationRoute?.();
        return;
      }

      if (segments[0] === '(tabs)' && segments[1] === 'notifications') {
        handledColdStartNav.current = true;
        router.replace('/(tabs)');
        return;
      }

      if (segments[0] === '(tabs)') {
        handledColdStartNav.current = true;
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    loading,
    user,
    pendingNotificationRoute,
    router,
    clearPendingNotificationRoute,
    segments[0],
    segments[1],
  ]);

  const hasWorkspaceAccess = activeOrganization || isProjectCollaborator;

  if (!loading && user && !hasWorkspaceAccess && organizationError && !inAuthGroup && !onProjectInvite) {
    return <NoOrganizationScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="project-invite/[token]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [i18nLoaded, setI18nLoaded] = useState(i18n.isInitialized);

  useEffect(() => {
    if (i18nLoaded) return;
    i18nReady.then(() => setI18nLoaded(true));
  }, [i18nLoaded]);

  if (!i18nLoaded) return null;

  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            <AppUpdateProvider>
              <SyncStatusProvider>
                <MobileExperienceProvider>
                  <BrandingProvider>
                    <RootLayoutNav />
                  </BrandingProvider>
                </MobileExperienceProvider>
                <StoreUpdateModal />
                <ReviewPromptModal />
              </SyncStatusProvider>
            </AppUpdateProvider>
          </AuthProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    </KeyboardProvider>
  );
}

