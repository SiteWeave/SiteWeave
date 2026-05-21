import React, { useState } from 'react';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';
import {
  extractProjectInviteTokenFromUrl,
  provisionPersonalWorkspace,
  redeemProjectInvite,
} from '../utils/workspaceClient';

function NoOrganizationView() {
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const [inviteUrl, setInviteUrl] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);

  const handleSignOut = async () => {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        addToast('Error signing out: ' + error.message, 'error');
      } else {
        dispatch({ type: 'SET_USER', payload: null });
        addToast('Signed out successfully', 'success');
      }
    } catch (error) {
      console.error('Sign out error:', error);
      addToast('Error signing out', 'error');
    }
  };

  const handleRedeemInvite = async () => {
    setIsRedeeming(true);
    try {
      const token = extractProjectInviteTokenFromUrl(inviteUrl) || inviteUrl.trim();
      const result = await redeemProjectInvite(supabaseClient, {
        token: token.length > 20 ? token : undefined,
        shortCode: shortCode.trim() || undefined,
      });
      if (result?.success) {
        addToast('Project access granted!', 'success');
        window.location.reload();
      } else {
        addToast(result?.error || 'Invalid invite', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Failed to redeem invite', 'error');
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleCreateWorkspace = async () => {
    setIsProvisioning(true);
    try {
      await supabaseClient.from('profiles').upsert({
        id: state.user.id,
        account_intent: 'workspace_owner',
        role: 'Team',
      }, { onConflict: 'id' });
      dispatch({ type: 'SET_ACCOUNT_INTENT', payload: 'workspace_owner' });
      const result = await provisionPersonalWorkspace(supabaseClient, { force: true });
      if (result?.success) {
        addToast('Your workspace is ready!', 'success');
        window.location.reload();
      } else {
        addToast(result?.error || 'Could not create workspace', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Failed to create workspace', 'error');
    } finally {
      setIsProvisioning(false);
    }
  };

  if (state.isProjectCollaborator && state.collaborationProjects.length > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full app-card p-8 text-center shadow-lg">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <Icon 
                path="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" 
                className="w-8 h-8 text-purple-600"
              />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Guest Access</h1>
            <p className="text-slate-600">
              You have access to {state.collaborationProjects.length} project{state.collaborationProjects.length !== 1 ? 's' : ''} as a collaborator.
            </p>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Open your shared projects from the dashboard.
            </p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'Dashboard' })}
              className="w-full px-4 py-2 app-action-primary rounded-lg transition-colors"
            >
              Go to Dashboard
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full px-4 py-2 app-action-secondary rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isGuestWaiting = state.organizationError === 'guest_waiting' || state.accountIntent === 'guest_only';

  if (isGuestWaiting) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full app-card p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Waiting for a project invite</h1>
          <p className="text-slate-600 text-sm text-center mb-6">
            If your contractor added the wrong email, ask them to copy the invite link from the project team page and send it to you. You can sign in with any email or Google.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Paste invite link</label>
              <input
                type="url"
                value={inviteUrl}
                onChange={(e) => setInviteUrl(e.target.value)}
                placeholder="https://app.siteweave.org/project-invite/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Or enter invite code</label>
              <input
                type="text"
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                placeholder="8-character code"
                maxLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase tracking-widest"
              />
            </div>
            <button
              type="button"
              disabled={isRedeeming || (!inviteUrl.trim() && !shortCode.trim())}
              onClick={handleRedeemInvite}
              className="w-full app-action-primary py-2 rounded-lg disabled:opacity-50"
            >
              {isRedeeming ? 'Opening project…' : 'Open invite'}
            </button>
            <button
              type="button"
              disabled={isProvisioning}
              onClick={handleCreateWorkspace}
              className="w-full app-action-secondary py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {isProvisioning ? 'Creating…' : 'I want to run my own projects'}
            </button>
            <button type="button" onClick={handleSignOut} className="w-full text-sm text-gray-500 hover:text-gray-700 py-2">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full app-card p-8 text-center shadow-lg">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <Icon 
              path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" 
              className="w-8 h-8 text-red-600"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">No Organization Found</h1>
          <p className="text-slate-600">
            Your account is not associated with an organization or any projects.
          </p>
        </div>
        <div className="space-y-4">
          <ul className="text-sm text-gray-600 text-left space-y-2 mb-6">
            <li className="flex items-start">
              <span className="text-blue-600 mr-2">•</span>
              <span>Invited to join an organization by an admin</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-600 mr-2">•</span>
              <span>Added as a project collaborator with an invite link</span>
            </li>
          </ul>
          <button
            type="button"
            onClick={handleCreateWorkspace}
            disabled={isProvisioning}
            className="w-full px-4 py-2 app-action-primary rounded-lg transition-colors disabled:opacity-50"
          >
            {isProvisioning ? 'Creating workspace…' : 'Create my workspace'}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full px-4 py-2 app-action-secondary rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoOrganizationView;
