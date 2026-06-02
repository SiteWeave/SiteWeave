import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import LoadingSpinner from './LoadingSpinner';

/**
 * Invitation Acceptance Page
 * Handles the "One-Time Setup Link" flow where new users set their password
 */
function InviteAcceptPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Always render something - never return null
  console.log('InviteAcceptPage render:', { token, loading, hasInvitation: !!invitation, error, message });

  useEffect(() => {
    console.log('InviteAcceptPage mounted, token:', token);
    if (!token) {
      console.error('No token found in URL params');
      setError('Invalid invitation link: missing token');
      setLoading(false);
      return;
    }
    // Small delay to ensure component is mounted
    const timer = setTimeout(() => {
      loadInvitation();
    }, 100);
    return () => clearTimeout(timer);
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
      const { data: invitationRows, error: invitationError } = await supabase
        .rpc('get_invitation_by_token', { invitation_token_param: token });
      const invitationData = Array.isArray(invitationRows) ? invitationRows[0] : invitationRows;

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
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', invitationData.organization_id)
          .single();
        organizationName = orgData?.name || null;
      }

      if (invitationData.role_id) {
        const { data: roleData } = await supabase
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
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setAccepting(true);
    try {
      // Step 1: Sign up the user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
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

      if (signUpError) {
        // If user already exists, they should sign in instead
        if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
          setError('An account with this email already exists. Please sign in to claim this invitation.');
          return;
        }
        throw signUpError;
      }

      if (!authData.user) {
        throw new Error('User account creation failed');
      }

      // For invitation flows, auto-confirm the user so they can sign in immediately
      // This bypasses email confirmation requirements
      try {
        const { data: confirmResult, error: confirmError } = await supabase.functions.invoke('auto-confirm-user', {
          body: { userId: authData.user.id }
        });

        if (confirmError) {
          console.warn('Failed to auto-confirm user (may require email confirmation):', confirmError);
          // Continue anyway - user might need to confirm email
        } else if (confirmResult?.success) {
          console.log('User auto-confirmed successfully');
        }
      } catch (confirmErr) {
        console.warn('Error calling auto-confirm-user:', confirmErr);
        // Continue anyway
      }

      // Wait a moment for profile to be created by Supabase trigger
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 2: Ensure contact exists and is linked to profile
      // Wait a bit more for profile trigger to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('contact_id, organization_id')
        .eq('id', authData.user.id)
        .maybeSingle();

      let contactId = profile?.contact_id;

      if (!contactId) {
        // Check if contact exists with this email in the organization
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id, email, name')
          .ilike('email', invitation.email)
          .eq('organization_id', invitation.organization_id)
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
          console.log('Found existing contact:', contactId);
        } else {
          // Create new contact using edge function to bypass RLS
          console.log('Creating new contact via edge function...');
          // Priority: invitation metadata name > user metadata > email prefix
          const invitedName = invitation.metadata?.first_name || invitation.metadata?.name || authData.user.user_metadata?.full_name || invitation.email.split('@')[0] || 'User';
          const { data: contactResult, error: contactError } = await supabase.functions.invoke('create-contact-for-invitation', {
            body: {
              userId: authData.user.id,
              email: invitation.email,
              name: invitedName,
              organizationId: invitation.organization_id
            }
          });

          if (contactError) {
            console.error('Error calling create-contact-for-invitation:', contactError);
            throw new Error(`Failed to create contact: ${contactError.message}`);
          }

          if (!contactResult || !contactResult.success) {
            const errorMsg = contactResult?.error || 'Unknown error';
            console.error('Function returned error:', contactResult);
            throw new Error(`Failed to create contact: ${errorMsg}`);
          }

          if (!contactResult.contactId) {
            throw new Error('Failed to create contact: Invalid response from server (no contactId)');
          }

          contactId = contactResult.contactId;
          console.log('Contact created successfully:', contactId);
        }
      } else {
        console.log('Contact already linked to profile:', contactId);
      }

        // Verify contact exists and has email/name/organization_id
        if (contactId) {
          const { data: contactVerify } = await supabase
            .from('contacts')
            .select('id, email, name, organization_id')
            .eq('id', contactId)
            .single();
          
          if (!contactVerify) {
            console.error('Contact not found after creation:', contactId);
            throw new Error('Contact was created but cannot be found. Please contact support.');
          }
          
          // Ensure contact has email, name, and organization_id
          const updates = {};
          if (!contactVerify.email) {
            updates.email = invitation.email.toLowerCase();
          }
          // Priority: invitation metadata name > existing contact name > user metadata > email prefix
          const invitedName = invitation.metadata?.first_name || invitation.metadata?.name;
          const userName = invitedName || authData.user.user_metadata?.full_name || authData.user.user_metadata?.name || invitation.email.split('@')[0] || 'User';
          // Update name if it's missing, generic, or if we have a better name from the invitation
          const isGenericName = !contactVerify.name || contactVerify.name === 'User' || contactVerify.name === 'Unnamed User' || contactVerify.name === invitation.email.split('@')[0];
          if (isGenericName && invitedName) {
            updates.name = invitedName;
            console.log('Updating contact name from invitation metadata:', invitedName);
          } else if (!contactVerify.name || contactVerify.name === 'User' || contactVerify.name === 'Unnamed User') {
            updates.name = userName;
          }
          // CRITICAL: Ensure contact has organization_id set
          if (!contactVerify.organization_id) {
            updates.organization_id = invitation.organization_id;
            console.log('Contact missing organization_id, setting to:', invitation.organization_id);
          }
          
          if (Object.keys(updates).length > 0) {
            console.log('Updating contact with missing fields:', updates);
            await supabase
              .from('contacts')
              .update(updates)
              .eq('id', contactId);
          }
          
          console.log('Contact verified:', { id: contactVerify.id, email: contactVerify.email || updates.email, name: contactVerify.name || updates.name, organization_id: contactVerify.organization_id || updates.organization_id });
        }

      // Step 3: Update profile with organization and mark invitation as accepted
      // Do this BEFORE sign-in attempt so organization is assigned even if sign-in fails
      let session = authData.session;
      
      // Try to get session if available
      if (!session) {
        const { data: sessionData } = await supabase.auth.getSession();
        session = sessionData?.session;
      }

      // Always use edge function to update profile (bypasses RLS)
      // This is more reliable than direct update, especially for new users
      try {
        console.log('Updating profile via edge function...', {
          userId: authData.user.id,
          organizationId: invitation.organization_id,
          roleId: invitation.role_id,
          contactId: contactId
        });
        
        const { data: updateResult, error: updateError } = await supabase.functions.invoke('update-profile-organization', {
          body: {
            userId: authData.user.id,
            organizationId: invitation.organization_id,
            roleId: invitation.role_id,
            contactId: contactId
          }
        });

        if (updateError) {
          console.error('Error updating profile via edge function:', updateError);
          // Try direct update as fallback if we have a session
          if (session) {
            const { error: directError } = await supabase
              .from('profiles')
              .update({
                organization_id: invitation.organization_id,
                role_id: invitation.role_id,
                contact_id: contactId
              })
              .eq('id', authData.user.id);
            
            if (directError) {
              console.error('Direct update also failed:', directError);
            } else {
              console.log('Profile updated via direct update (fallback)');
            }
          }
        } else if (updateResult?.success) {
          console.log('Profile updated via edge function successfully');
        } else {
          console.warn('Edge function returned unsuccessful result:', updateResult);
        }
      } catch (err) {
        console.warn('Edge function error, trying direct update:', err);
        // Fallback to direct update if edge function fails
        if (session) {
          const { error: directError } = await supabase
            .from('profiles')
            .update({
              organization_id: invitation.organization_id,
              role_id: invitation.role_id,
              contact_id: contactId
            })
            .eq('id', authData.user.id);
          
          if (directError) {
            console.error('Direct update fallback also failed:', directError);
          }
        }
      }

      // Mark invitation as accepted (this should work even without session via RLS)
      const { error: updateError } = await supabase
        .from('invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation.id);

      if (updateError) {
        console.error('Error updating invitation status:', updateError);
        // Continue - we'll try again if sign-in succeeds
      }

      // Step 4: Try to sign in the user to establish a session
      if (!session) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password: password
        });

        if (signInError) {
          // Organization assignment might have failed if no session
          // Store invitation data in user metadata so we can complete it on login
          try {
            await supabase.auth.updateUser({
              data: {
                pending_invitation_id: invitation.id,
                pending_organization_id: invitation.organization_id,
                pending_role_id: invitation.role_id,
                pending_contact_id: contactId
              }
            });
          } catch (metaError) {
            console.warn('Could not store pending invitation data:', metaError);
          }

          console.warn('Failed to sign in after signup:', signInError);
          setMessage('Account created! Please check your email to confirm your account, then sign in to complete the invitation.');
          setTimeout(() => {
            navigate('/login');
          }, 3000);
          return;
        }

        session = signInData?.session;
      }

      // Step 5: Ensure profile is updated with organization (now that we have a session)
      if (session) {
        // Verify contact one more time before updating profile
        if (!contactId) {
          const { data: contactCheck } = await supabase
            .from('contacts')
            .select('id')
            .ilike('email', invitation.email)
            .eq('organization_id', invitation.organization_id)
            .maybeSingle();
          
          if (contactCheck) {
            contactId = contactCheck.id;
            console.log('Found contact on retry:', contactId);
          } else {
            console.error('Contact still not found, creating via edge function...');
            const { data: contactResult } = await supabase.functions.invoke('create-contact-for-invitation', {
              body: {
                userId: authData.user.id,
                email: invitation.email,
                name: authData.user.user_metadata?.full_name || invitation.email.split('@')[0] || 'User',
                organizationId: invitation.organization_id
              }
            });
            
            if (contactResult?.success && contactResult.contactId) {
              contactId = contactResult.contactId;
            }
          }
        }

        // Always use edge function for final profile update (most reliable)
        console.log('Final profile update via edge function...');
        const { data: finalUpdateResult, error: finalUpdateError } = await supabase.functions.invoke('update-profile-organization', {
          body: {
            userId: authData.user.id,
            organizationId: invitation.organization_id,
            roleId: invitation.role_id,
            contactId: contactId
          }
        });

        if (finalUpdateError) {
          console.error('Error updating profile via edge function:', finalUpdateError);
          // Try direct update as last resort
          const { error: directError } = await supabase
            .from('profiles')
            .update({
              organization_id: invitation.organization_id,
              role_id: invitation.role_id,
              contact_id: contactId
            })
            .eq('id', authData.user.id);
          
          if (directError) {
            console.error('Direct update also failed:', directError);
            throw new Error(`Failed to assign organization: ${directError.message}`);
          } else {
            console.log('Profile updated via direct update (fallback)');
          }
        } else if (finalUpdateResult?.success) {
          console.log('Profile updated successfully via edge function');
        } else {
          console.warn('Edge function returned unsuccessful:', finalUpdateResult);
        }
        
        // Verify the update worked
        const { data: profileVerification } = await supabase
          .from('profiles')
          .select('organization_id, role_id, contact_id')
          .eq('id', authData.user.id)
          .maybeSingle();
        
        console.log('Profile verification:', profileVerification);
        
        // Final verification - ensure contact exists and has email, name, and organization_id
        if (profileVerification?.contact_id) {
          const { data: finalContact } = await supabase
            .from('contacts')
            .select('id, email, name, organization_id')
            .eq('id', profileVerification.contact_id)
            .single();
          
          if (finalContact) {
            console.log('Final contact verification:', finalContact);
            // One more update to ensure email, name, and organization_id are set
            const finalUpdates = {};
            if (!finalContact.email) {
              finalUpdates.email = invitation.email.toLowerCase();
            }
            // Priority: invitation metadata name > existing contact name > user metadata > email prefix
            const invitedNameFinal = invitation.metadata?.first_name || invitation.metadata?.name;
            const isGenericNameFinal = !finalContact.name || finalContact.name === 'User' || finalContact.name === 'Unnamed User' || finalContact.name === invitation.email.split('@')[0];
            if (isGenericNameFinal && invitedNameFinal) {
              finalUpdates.name = invitedNameFinal;
              console.log('Updating final contact name from invitation metadata:', invitedNameFinal);
            } else if (!finalContact.name || finalContact.name === 'User' || finalContact.name === 'Unnamed User') {
              finalUpdates.name = authData.user.user_metadata?.full_name || authData.user.user_metadata?.name || invitation.email.split('@')[0] || 'User';
            }
            // CRITICAL: Ensure contact has organization_id set
            if (!finalContact.organization_id) {
              finalUpdates.organization_id = invitation.organization_id;
              console.log('Final contact missing organization_id, setting to:', invitation.organization_id);
            }
            
            if (Object.keys(finalUpdates).length > 0) {
              console.log('Final contact update:', finalUpdates);
              await supabase
                .from('contacts')
                .update(finalUpdates)
                .eq('id', profileVerification.contact_id);
            }
          } else {
            console.error('Contact not found in final verification:', profileVerification.contact_id);
          }
        } else {
          console.error('Profile missing contact_id after update. Profile data:', profileVerification);
          // Last resort: try edge function to set contact_id one more time
          if (contactId) {
            try {
              console.log('Last resort: Setting contact_id via edge function...');
              const { data: lastResort } = await supabase.functions.invoke('update-profile-organization', {
                body: {
                  userId: authData.user.id,
                  organizationId: invitation.organization_id,
                  roleId: invitation.role_id,
                  contactId: contactId
                }
              });
              if (lastResort?.success) {
                console.log('Contact ID set via edge function as last resort');
              } else {
                console.error('Last resort update failed:', lastResort);
              }
            } catch (err) {
              console.error('Last resort contact_id update failed:', err);
            }
          }
        }

        // Ensure invitation is marked as accepted
        const { error: invitationUpdateError } = await supabase
          .from('invitations')
          .update({
            status: 'accepted',
            accepted_at: new Date().toISOString()
          })
          .eq('id', invitation.id);

        if (invitationUpdateError) {
          console.error('Error updating invitation status:', invitationUpdateError);
          // Don't throw - organization assignment succeeded
        }
      } else {
        throw new Error('Failed to establish session. Please try signing in manually.');
      }

      // First Org Admin to accept claims founding ownership (e.g. super-admin–provisioned orgs)
      const invitedRoleName = invitation.roles?.name;
      if (invitedRoleName === 'Org Admin' && invitation.organization_id && authData?.user?.id) {
        const { data: orgRow } = await supabase
          .from('organizations')
          .select('created_by_user_id')
          .eq('id', invitation.organization_id)
          .single();

        if (orgRow && orgRow.created_by_user_id == null) {
          const { error: claimError } = await supabase
            .from('organizations')
            .update({ created_by_user_id: authData.user.id })
            .eq('id', invitation.organization_id)
            .is('created_by_user_id', null);

          if (claimError) {
            console.warn('Could not claim organization created_by_user_id:', claimError);
          }
        }
      }

      setMessage(`Welcome to ${invitation.organizations?.name || 'the organization'}!`);
      
      // Step 5: Navigate to the main app
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setError(error.message || 'Failed to accept invitation. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    console.log('InviteAcceptPage: Loading state', { loading, hasToken: !!token });
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Loading invitation..." />
      </div>
    );
  }

  if (message) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 sm:p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Success!</h2>
          <p className="text-gray-600 mb-6">{message}</p>
          <p className="text-sm text-gray-500">Redirecting...</p>
        </div>
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
  if (!invitation && !loading) {
    console.error('InviteAcceptPage: No invitation loaded and no error state', { token, error, loading });
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 sm:p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Unable to Load Invitation</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-6">{error || 'Unable to load invitation. Please check the link and try again.'}</p>
          <button type="button"
            onClick={() => navigate('/login')}
            className="px-4 sm:px-6 py-2 text-sm sm:text-base bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
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
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Welcome to SiteWeave</h2>
          <p className="text-sm sm:text-base text-gray-600">
            Join <strong>{invitation.organizations?.name || 'the organization'}</strong>
            {invitation.roles?.name && (
              <> as a <strong>{invitation.roles.name}</strong></>
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleAcceptInvitation} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={invitation?.email || ''}
              disabled
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
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
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-gray-900"
              required
              minLength={6}
              disabled={accepting}
              autoComplete="new-password"
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
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-gray-900"
              required
              minLength={6}
              disabled={accepting}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-3 text-sm sm:text-base bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={accepting}
          >
            {accepting ? 'Setting up your account...' : 'Accept Invitation'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default InviteAcceptPage;
