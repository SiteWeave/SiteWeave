import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from './LoadingSpinner';

/**
 * Invitation Acceptance Page
 * Handles the "One-Time Setup Link" flow where new users set their password
 */
function InviteAcceptPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('InviteAcceptPage mounted, token:', token);
    if (!token) {
      console.error('No token found in URL params');
      setError('Invalid invitation link: missing token');
      setLoading(false);
      return;
    }
    loadInvitation();
  }, [token]);

  const loadInvitation = async () => {
    if (!token) {
      console.error('loadInvitation called without token');
      setError('Invalid invitation link: missing token');
      setLoading(false);
      return;
    }
    
    console.log('Loading invitation with token:', token);
    setLoading(true);
    setError(null);
    try {
      // First, get the invitation without joins to avoid RLS issues
      const { data: invitationData, error: invitationError } = await supabaseClient
        .from('invitations')
        .select('*')
        .eq('invitation_token', token)
        .eq('status', 'pending')
        .single();

      if (invitationError) {
        throw invitationError;
      }

      if (!invitationData) {
        setError('Invalid or expired invitation link. Please ask your admin for a new one.');
        setLoading(false);
        return;
      }

      // Then fetch organization and role names separately if needed
      let organizationName = null;
      let roleName = null;

      if (invitationData.organization_id) {
        const { data: orgData } = await supabaseClient
          .from('organizations')
          .select('name')
          .eq('id', invitationData.organization_id)
          .single();
        organizationName = orgData?.name || null;
      }

      if (invitationData.role_id) {
        const { data: roleData } = await supabaseClient
          .from('roles')
          .select('name')
          .eq('id', invitationData.role_id)
          .single();
        roleName = roleData?.name || null;
      }

      // Combine the data
      const data = {
        ...invitationData,
        organizations: organizationName ? { name: organizationName } : null,
        roles: roleName ? { name: roleName } : null
      };
      const error = null;

      console.log('Invitation query result:', { data: !!data, error: error?.message });

      if (error) {
        console.error('Error loading invitation:', error);
        setError(`Failed to load invitation: ${error.message || 'Invalid or expired invitation link. Please ask your admin for a new one.'}`);
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Invalid or expired invitation link. Please ask your admin for a new one.');
        setLoading(false);
        return;
      }

      // Check if invitation is expired
      if (new Date(data.expires_at) < new Date()) {
        setError('This invitation has expired. Please ask your admin for a new one.');
        setLoading(false);
        return;
      }

      setInvitation(data);
    } catch (error) {
      console.error('Error loading invitation:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      setError(`Failed to load invitation: ${error.message || 'An unexpected error occurred. Please try again or contact support.'}`);
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      addToast('Passwords do not match', 'error');
      return;
    }

    if (password.length < 6) {
      addToast('Password must be at least 6 characters', 'error');
      return;
    }

    setAccepting(true);
    try {
      // Step 1: Sign up the user
      const { data: authData, error: signUpError } = await supabaseClient.auth.signUp({
        email: invitation.email,
        password: password,
        options: {
          data: {
            invitation_token: token,
            organization_id: invitation.organization_id,
            role_id: invitation.role_id
          }
        }
      });

      if (signUpError) throw signUpError;

      // Step 2: Update the invitation status
      const { error: updateError } = await supabaseClient
        .from('invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation.id);

      if (updateError) throw updateError;

      // Step 3: Update the user's profile with organization and role
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .update({
          organization_id: invitation.organization_id,
          role_id: invitation.role_id
        })
        .eq('id', authData.user.id);

      if (profileError) throw profileError;

      // First Org Admin to accept claims founding ownership (e.g. super-admin–provisioned orgs with null created_by_user_id)
      const invitedRoleName = invitation.roles?.name;
      if (invitedRoleName === 'Org Admin' && invitation.organization_id) {
        const { data: orgRow } = await supabaseClient
          .from('organizations')
          .select('created_by_user_id')
          .eq('id', invitation.organization_id)
          .single();

        if (orgRow && orgRow.created_by_user_id == null) {
          const { error: claimError } = await supabaseClient
            .from('organizations')
            .update({ created_by_user_id: authData.user.id })
            .eq('id', invitation.organization_id)
            .is('created_by_user_id', null);

          if (claimError) {
            console.warn('Could not claim organization created_by_user_id:', claimError);
          }
        }
      }

      addToast(`Welcome to ${invitation.organizations.name}!`, 'success');
      
      // Step 4: Navigate to the main app
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      addToast(`Failed to accept invitation: ${error.message}`, 'error');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    console.log('InviteAcceptPage: Loading state', { loading, hasToken: !!token });
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && !invitation) {
    console.error('InviteAcceptPage: Error state without invitation', { error, token });
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button type="button"
            onClick={() => navigate('/login')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Final fallback - if we still don't have an invitation and no error is set, show error
  if (!invitation) {
    console.error('InviteAcceptPage: No invitation loaded and no error state', { token, error, loading });
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Invitation</h2>
          <p className="text-gray-600 mb-6">{error || 'Unable to load invitation. Please check the link and try again.'}</p>
          <button type="button"
            onClick={() => navigate('/login')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">You're Invited!</h2>
          <p className="text-gray-600 mt-2">
            Join <strong>{invitation.organizations.name}</strong> as a <strong>{invitation.roles.name}</strong>
          </p>
        </div>

        <form onSubmit={handleAcceptInvitation} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={invitation.email}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Create Password *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
              disabled={accepting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
              disabled={accepting}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>The Power is Yours:</strong><br />
              Your password, your security. Choose a strong one!
            </p>
          </div>

          <button
            type="submit"
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
            disabled={accepting}
          >
            {accepting ? 'Setting up your account...' : 'Join the Team'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <button type="button"
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

export default InviteAcceptPage;
