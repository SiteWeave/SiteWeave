import 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../i18n';
import { Stack, useRouter, useSegments } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { BrandingProvider } from '../context/BrandingContext';
import { useEffect } from 'react';
import NoOrganizationScreen from '../components/NoOrganizationScreen';

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

  useEffect(() => {
    // Wait for auth to finish loading before making navigation decisions
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onProjectInvite = segments[0] === 'project-invite';

    // Only redirect if we're certain about the auth state
    // Add a small delay to prevent race conditions with session checks
    const timer = setTimeout(() => {
      if (!user && !inAuthGroup && !onProjectInvite) {
        router.replace('/(auth)');
      } else if (user && inAuthGroup && !onProjectInvite) {
        router.replace('/(tabs)');
      }
    }, 100); // Small delay to ensure session is fully checked

    return () => clearTimeout(timer);
  }, [user, loading, segments, router]);

  useEffect(() => {
    if (!loading && user && pendingNotificationRoute) {
      router.push(pendingNotificationRoute);
      clearPendingNotificationRoute?.();
    }
  }, [loading, user, pendingNotificationRoute, router, clearPendingNotificationRoute]);

  const hasWorkspaceAccess = activeOrganization || isProjectCollaborator;

  if (!loading && user && !hasWorkspaceAccess && organizationError) {
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
  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <BrandingProvider>
          <RootLayoutNav />
        </BrandingProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}

