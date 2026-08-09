import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSupabaseClient } from '@siteweave/core-logic';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform, AppState } from 'react-native';
import {
  registerPushTokenIfPermitted,
  setupNotificationListeners,
  subscribeUserNotificationInserts,
  resolveNotificationRoute,
} from '../utils/notifications';
import { ensureTermsAccepted } from '../utils/ensureTermsAccepted';
import { hasCompletedNotificationsOnboarding } from '../utils/onboarding';

import { resolvePermissionFlags } from '../utils/mobileExperience';
import { clearWidgetSnapshot } from '../utils/widgetBridge';

const AuthContext = createContext();

// Helper function to parse URL hash fragments
function parseHashParams(url) {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};
  
  const hash = url.substring(hashIndex + 1);
  const params = {};
  hash.split('&').forEach(param => {
    const [key, value] = param.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  });
  return params;
}

function getMobileRedirectUrl() {
  // Force deterministic native callback URI so Supabase/provider allowlist can match exactly.
  // Do not use Linking.createURL here because Expo Go/dev environments may produce exp://... values.
  const scheme = Constants.expoConfig?.scheme || 'siteweave';
  return `${scheme}://auth/callback`;
}

const supabaseAuthStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

async function completeOAuthFromCallbackUrl(supabase, url) {
  const parsedUrl = Linking.parse(url);
  const code = parsedUrl.queryParams?.code;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(String(code));
    if (error) throw error;
    return data;
  }

  const hashParams = parseHashParams(url);
  if (hashParams.access_token && hashParams.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: hashParams.access_token,
      refresh_token: hashParams.refresh_token,
    });
    if (error) throw error;
    return data;
  }

  if (parsedUrl.queryParams?.access_token && parsedUrl.queryParams?.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: String(parsedUrl.queryParams.access_token),
      refresh_token: String(parsedUrl.queryParams.refresh_token),
    });
    if (error) throw error;
    return data;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    return { user: session.user, session };
  }

  throw new Error('No valid OAuth tokens or code found in callback URL');
}

async function syncOAuthDisplayName(supabase, sessionData) {
  const user = sessionData?.user ?? sessionData?.session?.user;
  if (!user?.id) return sessionData;

  const meta = user.user_metadata || {};
  if ((meta.full_name || meta.name || '').trim()) return sessionData;

  const identity = user.identities?.[0]?.identity_data || {};
  const derived = [
    identity.full_name,
    identity.name,
    [identity.given_name, identity.family_name].filter(Boolean).join(' '),
  ].find((value) => value?.trim());

  if (derived?.trim()) {
    await supabase.auth.updateUser({ data: { full_name: derived.trim() } });
  }

  return sessionData;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeOrganization, setActiveOrganization] = useState(null);
  const [organizationError, setOrganizationError] = useState(null);
  const [isProjectCollaborator, setIsProjectCollaborator] = useState(false);
  const [collaborationProjects, setCollaborationProjects] = useState([]);
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState(null);
  const [syncPulse, setSyncPulse] = useState(0);
  const [notificationPulse, setNotificationPulse] = useState(0);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [canCreateProjects, setCanCreateProjects] = useState(false);
  const [canEditProjects, setCanEditProjects] = useState(false);
  const [canCreateTasks, setCanCreateTasks] = useState(false);
  const [canAssignTasks, setCanAssignTasks] = useState(false);
  const [canViewActivityHistory, setCanViewActivityHistory] = useState(false);
  const [canManageProgressReports, setCanManageProgressReports] = useState(false);
  const [hasManagerAccess, setHasManagerAccess] = useState(false);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  // Expo uses EXPO_PUBLIC_ prefix for environment variables
  // Use useMemo to prevent recreating the client on every render
  const supabase = React.useMemo(() => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
      Constants.expoConfig?.extra?.supabaseUrl;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
      Constants.expoConfig?.extra?.supabaseAnonKey;
    return createSupabaseClient(supabaseUrl, supabaseAnonKey, { storage: supabaseAuthStorage });
  }, []);

  // Load org membership or guest collaborator access
  const loadUserOrganization = async (targetUser = user) => {
    if (!targetUser) {
      setActiveOrganization(null);
      setOrganizationError(null);
      setIsProjectCollaborator(false);
      setCollaborationProjects([]);
      setUserRole(null);
      setCanCreateProjects(false);
      setCanEditProjects(false);
      setCanCreateTasks(false);
      setCanAssignTasks(false);
      setCanViewActivityHistory(false);
      setCanManageProgressReports(false);
      setHasManagerAccess(false);
      setPermissionsLoading(false);
      return;
    }

    setPermissionsLoading(true);
    try {
      const { runInviteBootstrap } = await import('../utils/workspaceClient');
      await runInviteBootstrap(supabase);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select(`
          organization_id,
          account_intent,
          roles (
            id,
            name,
            permissions,
            is_system_role
          ),
          organizations (
            id,
            name,
            workspace_type,
            trial_ends_at,
            max_projects,
            lifetime_projects_created,
            max_guest_collaborators_per_project
          )
        `)
        .eq('id', targetUser.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error loading organization:', profileError);
        setOrganizationError('Failed to load organization');
        setActiveOrganization(null);
        setIsProjectCollaborator(false);
        setCollaborationProjects([]);
        setUserRole(null);
        setCanCreateProjects(false);
        setCanEditProjects(false);
        setCanCreateTasks(false);
        setCanAssignTasks(false);
        setCanViewActivityHistory(false);
        setCanManageProgressReports(false);
        setHasManagerAccess(false);
        setPermissionsLoading(false);
        return;
      }

      if (profile?.organization_id && profile?.organizations) {
        const org = {
          id: profile.organizations.id,
          name: profile.organizations.name,
          workspace_type: profile.organizations.workspace_type,
          trial_ends_at: profile.organizations.trial_ends_at,
          max_projects: profile.organizations.max_projects,
          lifetime_projects_created: profile.organizations.lifetime_projects_created,
          max_guest_collaborators_per_project: profile.organizations.max_guest_collaborators_per_project,
        };
        const flags = resolvePermissionFlags(profile.roles);
        setActiveOrganization(org);
        setOrganizationError(null);
        setIsProjectCollaborator(false);
        setCollaborationProjects([]);
        setUserRole(flags.userRole);
        setCanCreateProjects(flags.canCreateProjects);
        setCanEditProjects(flags.canEditProjects);
        setCanCreateTasks(flags.canCreateTasks);
        setCanAssignTasks(flags.canAssignTasks);
        setCanViewActivityHistory(flags.canViewActivityHistory);
        setCanManageProgressReports(flags.canManageProgressReports);
        setHasManagerAccess(flags.hasManagerAccess);
        setPermissionsLoading(false);
        return;
      }

      const { getUserCollaborationProjects } = await import('../utils/projectCollaborationService');
      const collaborations = await getUserCollaborationProjects(supabase, targetUser.id);
      const projects = collaborations.map((c) => c.projects).filter(Boolean);

      if (projects.length > 0) {
        setIsProjectCollaborator(true);
        setCollaborationProjects(projects);
        setActiveOrganization(null);
        setOrganizationError(null);
        setUserRole(null);
        setCanCreateProjects(false);
        setCanEditProjects(false);
        setCanCreateTasks(false);
        setCanAssignTasks(false);
        setCanViewActivityHistory(false);
        setCanManageProgressReports(false);
        setHasManagerAccess(false);
        setPermissionsLoading(false);
        return;
      }

      setIsProjectCollaborator(false);
      setCollaborationProjects([]);
      setActiveOrganization(null);
      setOrganizationError('guest_waiting');
      setUserRole(null);
      setCanCreateProjects(false);
      setCanEditProjects(false);
      setCanCreateTasks(false);
      setCanAssignTasks(false);
      setCanViewActivityHistory(false);
      setCanManageProgressReports(false);
      setHasManagerAccess(false);
      setPermissionsLoading(false);
    } catch (error) {
      console.error('Error in loadUserOrganization:', error);
      setOrganizationError('Failed to load organization');
      setActiveOrganization(null);
      setIsProjectCollaborator(false);
      setCollaborationProjects([]);
      setUserRole(null);
      setCanCreateProjects(false);
      setCanEditProjects(false);
      setCanCreateTasks(false);
      setCanAssignTasks(false);
      setCanViewActivityHistory(false);
      setCanManageProgressReports(false);
      setHasManagerAccess(false);
      setPermissionsLoading(false);
    }
  };

  // Always (re)load organization when authenticated user changes.
  useEffect(() => {
    if (user?.id) {
      loadUserOrganization(user);
    } else {
      setActiveOrganization(null);
      setOrganizationError(null);
      setIsProjectCollaborator(false);
      setCollaborationProjects([]);
    }
  }, [user?.id]);

  const refreshProfileAvatar = async (targetUser = user) => {
    if (!targetUser?.id || !supabase) {
      setProfileAvatarUrl(null);
      return;
    }

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('contact_id')
        .eq('id', targetUser.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error loading profile avatar:', profileError);
        setProfileAvatarUrl(targetUser?.user_metadata?.avatar_url || null);
        return;
      }

      let avatarUrl = targetUser?.user_metadata?.avatar_url || null;
      if (profile?.contact_id) {
        const { data: contact, error: contactError } = await supabase
          .from('contacts')
          .select('avatar_url')
          .eq('id', profile.contact_id)
          .maybeSingle();
        if (!contactError && contact?.avatar_url) {
          avatarUrl = contact.avatar_url;
        }
      }

      setProfileAvatarUrl(avatarUrl);
    } catch (error) {
      console.error('Error loading profile avatar:', error);
      setProfileAvatarUrl(targetUser?.user_metadata?.avatar_url || null);
    }
  };

  useEffect(() => {
    refreshProfileAvatar(user);
  }, [user?.id, user?.user_metadata?.avatar_url]);

  // Deep links: siteweave://project-invite/{token} or https://app.../project-invite/{token}
  useEffect(() => {
    const handleUrl = async (url) => {
      const { extractProjectInviteTokenFromUrl, storePendingProjectInviteToken } = await import('../utils/workspaceClient');
      const inviteToken = extractProjectInviteTokenFromUrl(url);
      if (!inviteToken) return;
      await storePendingProjectInviteToken(inviteToken);
      if (user) {
        await loadUserOrganization(user);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [user?.id]);

  // Record ToS acceptance for new sessions (welcome screen = agree on signup path).
  useEffect(() => {
    if (!user?.id || !supabase) return;
    ensureTermsAccepted(supabase, user.id).catch((err) => {
      console.warn('Could not record Terms of Service acceptance:', err?.message || err);
    });
  }, [user?.id, supabase]);

  // Register push token only after notification onboarding and when permission granted.
  useEffect(() => {
    if (!user) return;

    const registerToken = async () => {
      try {
        const onboardingDone = await hasCompletedNotificationsOnboarding(user.id);
        if (!onboardingDone) return;
        await registerPushTokenIfPermitted(supabase, user.id);
      } catch (error) {
        console.error('Error registering push token:', error);
      }
    };

    const timer = setTimeout(registerToken, 1000);
    return () => clearTimeout(timer);
  }, [user, supabase]);

  // Setup notification listeners
  useEffect(() => {
    const cleanup = setupNotificationListeners(
      (notification) => {
        console.log('Notification received:', notification);
        // Handle foreground notifications if needed
      },
      (response) => {
        console.log('Notification tapped:', response);
        const data = response?.notification?.request?.content?.data || {};
        const route = resolveNotificationRoute(data);
        if (!route) return;
        if (route.startsWith('http://') || route.startsWith('https://')) {
          Linking.openURL(route).catch(() => {});
          return;
        }
        setPendingNotificationRoute(route);
      }
    );

    return cleanup;
  }, []);

  useEffect(() => {
    if (!user?.id || !supabase) return;
    return subscribeUserNotificationInserts(
      supabase,
      user.id,
      user.email || '',
      () => setNotificationPulse((value) => value + 1),
    );
  }, [user?.id, user?.email, supabase]);

  // Lightweight background/foreground sync trigger.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setSyncPulse((value) => value + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change event:', event, 'Has session:', !!session);

        switch (event) {
          case 'INITIAL_SESSION':
            if (session?.user) {
              setUser(session.user);
            } else {
              setUser(null);
              setActiveOrganization(null);
            }
            break;
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
          case 'USER_UPDATED':
            if (session?.user) {
              setUser(session.user);
            }
            break;
          case 'SIGNED_OUT':
            setUser(null);
            setActiveOrganization(null);
            setOrganizationError(null);
            setIsProjectCollaborator(false);
            setCollaborationProjects([]);
            break;
          case 'PASSWORD_RECOVERY':
            break;
          default:
            if (session?.user) {
              setUser(session.user);
            }
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signInWithGoogle = async () => {
    try {
      const redirectUrl = getMobileRedirectUrl();
      console.log('Google OAuth redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl
        );

        if (result.type === 'cancel') {
          throw new Error('OAuth sign-in was cancelled');
        }

        if (result.type === 'success' && result.url) {
          const data = await completeOAuthFromCallbackUrl(supabase, result.url);
          await syncOAuthDisplayName(supabase, data);
          return data;
        }

        throw new Error('OAuth callback was not successful');
      }

      throw new Error('No OAuth URL received');
    } catch (error) {
      console.error('Google OAuth error:', error);
      throw error;
    }
  };

  const signInWithMicrosoft = async () => {
    try {
      const redirectUrl = getMobileRedirectUrl();
      console.log('Microsoft OAuth redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl
        );

        if (result.type === 'cancel') {
          throw new Error('OAuth sign-in was cancelled');
        }

        if (result.type === 'success' && result.url) {
          const data = await completeOAuthFromCallbackUrl(supabase, result.url);
          await syncOAuthDisplayName(supabase, data);
          return data;
        }

        throw new Error('OAuth callback was not successful');
      }

      throw new Error('No OAuth URL received');
    } catch (error) {
      console.error('Microsoft OAuth error:', error);
      throw error;
    }
  };

  const signInWithApple = async () => {
    try {
      // Check if Apple Authentication is available on this device
      if (Platform.OS !== 'ios') {
        throw new Error('Sign in with Apple is only available on iOS');
      }

      // Check if Apple Sign In is available
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Apple Sign In is not available on this device');
      }

      // Check if running in Expo Go (development)
      const isExpoGo = Constants.executionEnvironment === 'storeClient' || 
                       Constants.appOwnership === 'expo';
      
      if (isExpoGo) {
        throw new Error(
          'Apple Sign In is not available in Expo Go. ' +
          'Please use a development build or production build. ' +
          'Run: npx expo run:ios or build with EAS Build.'
        );
      }

      // Generate a secure random nonce
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      // Request Apple authentication with the hashed nonce
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce, // Pass hashed nonce to Apple
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      // Sign in with Supabase using the Apple credential
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) {
        console.error('Supabase Apple sign in error:', error);
        
        // Provide helpful error message for audience mismatch
        if (error.message && error.message.includes('audience')) {
          throw new Error(
            'Apple Sign In configuration error. ' +
            'This usually happens in Expo Go. ' +
            'Please use a development build (npx expo run:ios) or production build.'
          );
        }
        
        throw new Error(error.message || 'Failed to sign in with Apple');
      }

      // If user provided their name, update the user metadata
      if (credential.fullName && (credential.fullName.givenName || credential.fullName.familyName)) {
        const fullName = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ');
        
        if (fullName) {
          await supabase.auth.updateUser({
            data: { full_name: fullName }
          });
        }
      }

      return data;
    } catch (error) {
      if (error.code === 'ERR_REQUEST_CANCELED' || error.code === 'ERR_CANCELED') {
        // User canceled Apple Sign in
        throw new Error('Sign in was cancelled');
      }
      console.error('Apple OAuth error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    await clearWidgetSnapshot();
    setUser(null);
    setProfileAvatarUrl(null);
    setActiveOrganization(null);
    setOrganizationError(null);
  };

  const deleteAccount = async () => {
    try {
      if (!user) {
        throw new Error('No user logged in');
      }

      // Call Supabase Edge Function to delete the account
      // First, get the current session to use the access token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No valid session found');
      }

      // Call the delete-user edge function
      const { data, error } = await supabase.functions.invoke('delete-user', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (data?.error) {
        throw new Error(data.error);
      }

      if (error) {
        console.error('Error deleting account:', error);
        const ctx = error.context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) throw new Error(body.error);
          } catch (parseErr) {
            if (parseErr?.message && parseErr.message !== error.message) throw parseErr;
          }
        }
        throw new Error(error.message || 'Failed to delete account');
      }

      // Sign out after successful deletion
      await signOut();
      
      return { success: true };
    } catch (error) {
      console.error('Error in deleteAccount:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      activeOrganization,
      organizationError,
      isProjectCollaborator,
      collaborationProjects,
      userRole,
      canCreateProjects,
      canEditProjects,
      canCreateTasks,
      canAssignTasks,
      canViewActivityHistory,
      canManageProgressReports,
      hasManagerAccess,
      permissionsLoading,
      loadUserOrganization,
      profileAvatarUrl,
      refreshProfileAvatar,
      signIn, 
      signInWithGoogle, 
      signInWithMicrosoft, 
      signInWithApple,
      signOut,
      deleteAccount,
      supabase,
      pendingNotificationRoute,
      clearPendingNotificationRoute: () => setPendingNotificationRoute(null),
      syncPulse,
      notificationPulse,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

