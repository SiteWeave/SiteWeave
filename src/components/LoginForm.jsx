import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from './LoadingSpinner';
import { ROUTE_PATHS } from '../config/routes';
import {
  autoRedeemProjectInvites,
  provisionPersonalWorkspace,
} from '../utils/workspaceClient';

function LoginForm({ mode = 'signIn', onAuthSuccess }) {
  const isSignUp = mode === 'signUp';
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [accountIntent, setAccountIntent] = useState('workspace_owner');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const oauthTimeoutRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('intent') === 'guest') {
      setAccountIntent('guest_only');
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsLoading(false);
        if (oauthTimeoutRef.current) {
          clearTimeout(oauthTimeoutRef.current);
          oauthTimeoutRef.current = null;
        }
      }
    });
    return () => {
      subscription.unsubscribe();
      if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleOAuthError = (event) => {
      const message = event?.detail?.message || 'OAuth sign-in failed. Please try again.';
      setIsLoading(false);
      if (oauthTimeoutRef.current) {
        clearTimeout(oauthTimeoutRef.current);
        oauthTimeoutRef.current = null;
      }
      addToast(message, 'error');
    };
    window.addEventListener('supabase-oauth-error', handleOAuthError);
    return () => window.removeEventListener('supabase-oauth-error', handleOAuthError);
  }, [addToast]);

  const persistAccountIntent = async (userId, intent) => {
    await supabaseClient.from('profiles').upsert({
      id: userId,
      account_intent: intent,
      role: 'Team',
    }, { onConflict: 'id' });
  };

  const runPostAuthBootstrap = async (user, intent) => {
    await persistAccountIntent(user.id, intent);
    await autoRedeemProjectInvites(supabaseClient);
    if (intent === 'workspace_owner') {
      const result = await provisionPersonalWorkspace(supabaseClient);
      if (!result?.success && !result?.alreadyProvisioned) {
        console.warn('provision-personal-workspace:', result?.error);
      }
    }
    onAuthSuccess?.();
  };

  const startOAuthLoadingGuard = () => {
    setIsLoading(true);
    if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current);
    oauthTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      addToast('OAuth sign-in timed out. Please try again.', 'error');
    }, 30000);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    if (isSignUp) {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, account_intent: accountIntent },
        },
      });
      if (error) {
        addToast('Sign up failed: ' + error.message, 'error');
        setIsLoading(false);
        return;
      }
      if (data?.user) {
        try {
          await runPostAuthBootstrap(data.user, accountIntent);
          addToast('Account created!', 'success');
        } catch (err) {
          addToast(err?.message || 'Setup failed', 'error');
        }
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        addToast('Login failed: ' + error.message, 'error');
      } else if (data?.user) {
        addToast('Login successful!', 'success');
        onAuthSuccess?.();
      }
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      addToast('Enter your email first', 'warning');
      return;
    }
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${ROUTE_PATHS.login}`,
    });
    if (error) addToast(error.message, 'error');
    else addToast('Password reset email sent', 'success');
  };

  const startProviderOAuth = async (provider, extraOptions = {}) => {
    const isElectron = !!window.electronAPI?.isElectron;
    const redirectTo = isElectron
      ? 'http://127.0.0.1:5000/supabase-callback'
      : window.location.origin;

    if (isSignUp) {
      sessionStorage.setItem('pendingAccountIntent', accountIntent);
    }

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider,
      options: {
        ...extraOptions,
        redirectTo,
        skipBrowserRedirect: isElectron,
      },
    });

    if (error) return { error };
    if (isElectron && data?.url) {
      try {
        if (window.electronAPI?.openExternal) {
          window.electronAPI.openExternal(data.url);
        } else {
          window.open(data.url, '_blank');
        }
      } catch (err) {
        return { error: { message: err?.message || 'Failed to open OAuth window' } };
      }
    }
    return { error: null };
  };

  const handleGoogleLogin = async () => {
    startOAuthLoadingGuard();
    const { error } = await startProviderOAuth('google');
    if (error) {
      addToast('Google login failed: ' + error.message, 'error');
      setIsLoading(false);
      if (oauthTimeoutRef.current) {
        clearTimeout(oauthTimeoutRef.current);
        oauthTimeoutRef.current = null;
      }
    }
  };

  const handleMicrosoftLogin = async () => {
    startOAuthLoadingGuard();
    const { error } = await startProviderOAuth('azure', { scopes: 'openid email profile' });
    if (error) {
      addToast('Microsoft login failed: ' + error.message, 'error');
      setIsLoading(false);
      if (oauthTimeoutRef.current) {
        clearTimeout(oauthTimeoutRef.current);
        oauthTimeoutRef.current = null;
      }
    }
  };

  const canSubmit = email && password && (!isSignUp || fullName.trim());

  return (
    <div className="relative min-h-screen bg-white">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-48 sm:h-56"
        aria-hidden
        style={{
          background: [
            'radial-gradient(ellipse 95% 125% at 6% -25%, rgba(251, 146, 60, 0.52) 0%, rgba(251, 191, 36, 0.2) 42%, transparent 65%)',
            'radial-gradient(ellipse 92% 120% at 94% -20%, rgba(56, 189, 248, 0.55) 0%, rgba(125, 211, 252, 0.18) 40%, transparent 65%)',
            'linear-gradient(180deg, rgba(255, 255, 255, 0) 25%, rgba(255, 255, 255, 0.9) 80%, #ffffff 100%)',
          ].join(', '),
        }}
      />
      <div className="relative z-10 flex min-h-screen items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-full max-w-[200px] items-center justify-center sm:h-16">
            <img
              src="/logo.svg"
              alt="SiteWeave"
              className="h-full w-full object-contain"
            />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isSignUp ? 'Welcome to Site Weave!' : 'Welcome back!'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <Link to={ROUTE_PATHS.login} className="font-medium text-blue-600 hover:text-blue-500">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                Don&apos;t have an account?{' '}
                <Link to={ROUTE_PATHS.signup} className="font-medium text-blue-600 hover:text-blue-500">
                  Sign up
                </Link>
              </>
            )}
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
          <button
            type="button"
            onClick={handleMicrosoftLogin}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
              <path fill="#f25022" d="M1 1h10v10H1z" />
              <path fill="#00a4ef" d="M13 1h10v10H13z" />
              <path fill="#7fba00" d="M1 13h10v10H1z" />
              <path fill="#ffb900" d="M13 13h10v10H13z" />
            </svg>
            Continue with Microsoft
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
          {isSignUp && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={`flex min-h-[3.25rem] cursor-pointer items-center justify-center rounded-lg border px-2 py-3 text-center transition-colors ${
                    accountIntent === 'workspace_owner'
                      ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-xs'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="accountIntent"
                    value="workspace_owner"
                    checked={accountIntent === 'workspace_owner'}
                    onChange={() => setAccountIntent('workspace_owner')}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold leading-tight">Manage Projects?</span>
                </label>
                <label
                  className={`flex min-h-[3.25rem] cursor-pointer items-center justify-center rounded-lg border px-2 py-3 text-center transition-colors ${
                    accountIntent === 'guest_only'
                      ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-xs'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="accountIntent"
                    value="guest_only"
                    checked={accountIntent === 'guest_only'}
                    onChange={() => setAccountIntent('guest_only')}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold leading-tight">Invited to a Project?</span>
                </label>
              </div>
              {accountIntent === 'guest_only' && (
                <p className="text-center text-xs leading-tight text-gray-500">
                  Open your project invite link, then sign in with any email.
                </p>
              )}
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </>
          )}

          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Work email"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 px-3 text-gray-400 text-xs"
              tabIndex={-1}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading || !canSubmit}
            className="w-full py-2.5 px-4 rounded-md text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? <LoadingSpinner size="sm" text="" /> : isSignUp ? 'Create account' : 'Log In'}
          </button>

          {!isSignUp && (
            <div className="text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Forgot Password?
              </button>
            </div>
          )}
        </form>
      </div>
      </div>
    </div>
  );
}

export default LoginForm;
