import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabaseClient } from '../context/AppContext';
import { useSession } from '../hooks/useSession';
import LoadingSpinner from './LoadingSpinner';
import { ROUTE_PATHS } from '../config/routes';
import {
  consumePendingProjectInviteToken,
  redeemProjectInvite,
  storePendingProjectInviteToken,
} from '../utils/workspaceClient';

export default function ProjectInviteAcceptPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [projectName, setProjectName] = useState('');

  useEffect(() => {
    if (token) {
      storePendingProjectInviteToken(token);
    }
  }, [token]);

  useEffect(() => {
    if (sessionLoading) return;

    if (!session) {
      setStatus('auth_required');
      setMessage('Sign in or create an account to accept this project invite.');
      return;
    }

    const run = async () => {
      const inviteToken = token || consumePendingProjectInviteToken();
      if (!inviteToken) {
        setStatus('error');
        setMessage('Invalid or missing invite link.');
        return;
      }

      const result = await redeemProjectInvite(supabaseClient, { token: inviteToken });
      if (result?.success) {
        setProjectName(result.projectName || 'the project');
        setStatus('success');
        setTimeout(() => {
          if (result.projectId) {
            navigate(`/projects/${result.projectId}/tasks`, { replace: true });
          } else {
            navigate(ROUTE_PATHS.home, { replace: true });
          }
        }, 1500);
      } else {
        setStatus('error');
        setMessage(result?.error || 'Could not accept invite.');
      }
    };

    run();
  }, [session, sessionLoading, token, navigate]);

  const goToLogin = () => {
    navigate(`${ROUTE_PATHS.login}?redirect=project-invite`);
  };

  const goToSignUp = () => {
    navigate(`${ROUTE_PATHS.signup}?intent=guest`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full app-card p-8 text-center shadow-lg">
        {status === 'loading' && (
          <>
            <LoadingSpinner size="lg" text="Accepting invite..." />
          </>
        )}
        {status === 'auth_required' && (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Project invite</h1>
            <p className="text-slate-600 text-sm mb-6">{message}</p>
            <div className="space-y-3">
              <button type="button" onClick={goToLogin} className="w-full app-action-primary py-2 rounded-lg">
                Sign in
              </button>
              <button type="button" onClick={goToSignUp} className="w-full app-action-secondary py-2 rounded-lg">
                Create account
              </button>
            </div>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-xl font-bold text-emerald-700 mb-2">You&apos;re in!</h1>
            <p className="text-slate-600 text-sm">
              Opening {projectName}…
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-xl font-bold text-red-700 mb-2">Invite problem</h1>
            <p className="text-slate-600 text-sm mb-6">{message}</p>
            <button type="button" onClick={() => navigate(ROUTE_PATHS.home)} className="app-action-secondary px-4 py-2 rounded-lg">
              Go home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
