import { supabaseClient } from '../context/AppContext';

/**
 * Resolve org role id for invitation accept (invitation role or Member default).
 */
async function resolveInvitationRoleId(organizationId, preferredRoleId) {
    if (preferredRoleId) {
        const { data: role } = await supabaseClient
            .from('roles')
            .select('id')
            .eq('id', preferredRoleId)
            .eq('organization_id', organizationId)
            .maybeSingle();
        if (role?.id) return role.id;
    }

    const { data: memberRole } = await supabaseClient
        .from('roles')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('name', 'Member')
        .maybeSingle();

    if (memberRole?.id) return memberRole.id;

    return preferredRoleId || null;
}

/**
 * Assign organization + role via service-role edge function (bypasses RLS for new users).
 */
async function assignProfileOrganization(userId, organizationId, roleId, contactId) {
    const { data, error } = await supabaseClient.functions.invoke('update-profile-organization', {
        body: { userId, organizationId, roleId, contactId },
    });

    if (error) {
        console.warn('update-profile-organization failed, trying direct update:', error);
        const { error: directError } = await supabaseClient
            .from('profiles')
            .update({
                organization_id: organizationId,
                role_id: roleId,
                ...(contactId ? { contact_id: contactId } : {}),
            })
            .eq('id', userId);

        if (directError) throw directError;
        return { success: true };
    }

    if (data?.error) throw new Error(data.error);
    return data;
}

/**
 * Generate a unique invitation token
 * @returns {string}
 */
function generateInvitationToken() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Send an invitation to join an organization
 * @param {string} email - Email address to invite
 * @param {string} organizationId - Organization ID
 * @param {string} roleId - Role ID to assign (optional)
 * @param {string} invitedByUserId - User ID of inviter
 * @param {string} projectId - Optional project ID (for project-specific context)
 * @param {number} issueId - Optional issue ID
 * @param {number} stepId - Optional step ID
 * @returns {Promise<{success: boolean, invitationId?: string, error?: string}>}
 */
export async function sendInvitation(email, organizationId, roleId = null, invitedByUserId, projectId = null, issueId = null, stepId = null) {
    try {
        // Validate email
        if (!email || !email.includes('@')) {
            return { success: false, error: 'Invalid email address' };
        }

        // Note: We can't directly query auth.users from client
        // Instead, we'll check profiles table which links to auth.users
        // If a profile exists with this email (via contact record), user likely exists
        const { data: existingProfile } = await supabaseClient
            .from('profiles')
            .select('*, contacts!inner(email)')
            .eq('contacts.email', email.toLowerCase())
            .maybeSingle();

        if (existingProfile) {
            return { 
                success: false, 
                error: 'User with this email already exists. Please assign them directly to the project.' 
            };
        }

        // Check if there's already a pending invitation for this organization
        const { data: existingInvitation } = await supabaseClient
            .from('invitations')
            .select('*')
            .eq('email', email.toLowerCase())
            .eq('organization_id', organizationId)
            .eq('status', 'pending')
            .maybeSingle();

        if (existingInvitation) {
            return { 
                success: false, 
                error: 'An invitation has already been sent to this email for this organization.' 
            };
        }

        // Generate invitation token
        const invitationToken = generateInvitationToken();

        // Create invitation record
        const { data: invitation, error: invitationError } = await supabaseClient
            .from('invitations')
            .insert({
                email: email.toLowerCase(),
                organization_id: organizationId,
                project_id: projectId,
                issue_id: issueId,
                step_id: stepId,
                invited_by_user_id: invitedByUserId,
                invitation_token: invitationToken,
                role_id: roleId || null,
                status: 'pending',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .select()
            .single();

        if (invitationError) {
            console.error('Error creating invitation:', invitationError);
            return { success: false, error: invitationError.message };
        }

        // Get organization details
        const { data: organization } = await supabaseClient
            .from('organizations')
            .select('name')
            .eq('id', organizationId)
            .single();

        // Get project details for email (if project-specific)
        let project = null;
        if (projectId) {
            const { data: projectData } = await supabaseClient
                .from('projects')
                .select('name, address')
                .eq('id', projectId)
                .single();
            project = projectData;
        }

        // Get inviter details
        const { data: inviter } = await supabaseClient
            .from('profiles')
            .select('*, contacts(*)')
            .eq('id', invitedByUserId)
            .single();

        const inviterName = inviter?.contacts?.name || 'A team member';

        // Construct invitation URLs (web and mobile deep link)
        const appUrl = window.location.origin;
        const webInvitationUrl = `${appUrl}/invite/${invitationToken}`;
        const mobileInvitationUrl = `siteweave://invite/${invitationToken}`;

        // Send invitation email
        let emailSent = false;
        let emailError = null;
        
        try {
            const emailResult = await supabaseClient.functions.invoke('send-invitation-email', {
                body: {
                    to: email,
                    inviterName: inviterName,
                    organizationName: organization?.name || 'an organization',
                    projectName: project?.name || null,
                    webInvitationUrl: webInvitationUrl,
                    mobileInvitationUrl: mobileInvitationUrl,
                    issueId: issueId,
                    stepId: stepId
                }
            });

            if (emailResult.error) {
                console.error('Error sending invitation email:', emailResult.error);
                emailError = emailResult.error.message || 'Failed to send email';
            } else if (emailResult.data?.error) {
                console.error('Email service error:', emailResult.data.error);
                emailError = emailResult.data.error;
            } else {
                emailSent = true;
            }
        } catch (err) {
            console.error('Exception sending invitation email:', err);
            emailError = err.message || 'Failed to send email';
        }

        return { 
            success: true, 
            invitationId: invitation.id,
            invitationToken: invitationToken,
            emailSent: emailSent,
            emailError: emailError
        };

    } catch (error) {
        console.error('Error in sendInvitation:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Accept an invitation and link user to project
 * @param {string} invitationToken - Invitation token
 * @param {string} userId - New user ID after signup
 * @returns {Promise<{success: boolean, projectId?: string, error?: string}>}
 */
export async function acceptInvitation(invitationToken, userId) {
    try {
        // Get invitation details
        const { data: invitation, error: invitationError } = await supabaseClient
            .from('invitations')
            .select('*')
            .eq('invitation_token', invitationToken)
            .single();

        if (invitationError || !invitation) {
            return { success: false, error: 'Invalid invitation token' };
        }

        // Check if invitation is expired
        if (new Date(invitation.expires_at) < new Date()) {
            return { success: false, error: 'This invitation has expired' };
        }

        // Check if invitation is already accepted
        if (invitation.status === 'accepted') {
            return { success: false, error: 'This invitation has already been accepted' };
        }

        // Get user email
        const { data: user } = await supabaseClient.auth.getUser();
        const userEmail = user?.user?.email;

        // Verify email matches
        if (userEmail?.toLowerCase() !== invitation.email.toLowerCase()) {
            return { 
                success: false, 
                error: 'This invitation was sent to a different email address' 
            };
        }

        // Get organization and role info
        const { data: organization } = await supabaseClient
            .from('organizations')
            .select('id, name')
            .eq('id', invitation.organization_id)
            .single();

        if (!organization) {
            return { success: false, error: 'Organization not found' };
        }

        // Get default role for organization (if no role specified in invitation)
        // For now, we'll need to get a default role or create one
        // This should be handled by the invitation creation process

        // Create or update contact record for this user
        let contactId;
        
        const { data: existingProfile, error: profileLookupError } = await supabaseClient
            .from('profiles')
            .select('contact_id, organization_id')
            .eq('id', userId)
            .maybeSingle();

        if (profileLookupError) {
            console.error('Error loading profile for invitation accept:', profileLookupError);
            return { success: false, error: 'Failed to load user profile' };
        }

        // Check if user already belongs to an organization
        if (existingProfile?.organization_id && existingProfile.organization_id !== invitation.organization_id) {
            return { 
                success: false, 
                error: 'User already belongs to a different organization' 
            };
        }

        if (existingProfile?.contact_id) {
            contactId = existingProfile.contact_id;
        } else {
            // Check if a contact already exists with this email in this organization
            const { data: existingContact } = await supabaseClient
                .from('contacts')
                .select('id')
                .ilike('email', userEmail)
                .eq('organization_id', invitation.organization_id)
                .maybeSingle();
            
            if (existingContact) {
                contactId = existingContact.id;
            } else {
                // Create new contact in the organization
                const { data: newContact, error: contactError } = await supabaseClient
                    .from('contacts')
                    .insert({
                        name: user?.user?.user_metadata?.full_name || userEmail,
                        role: 'Team Member',
                        type: 'Team',
                        email: userEmail,
                        organization_id: invitation.organization_id,
                        status: 'Available',
                        created_by_user_id: userId
                    })
                    .select()
                    .single();

                if (contactError) {
                    console.error('Error creating contact:', contactError);
                    return { success: false, error: 'Failed to create contact record' };
                }

                contactId = newContact.id;
            }

            // Link contact to profile
            await supabaseClient
                .from('profiles')
                .update({ contact_id: contactId })
                .eq('id', userId);
        }

        const resolvedRoleId = await resolveInvitationRoleId(
            invitation.organization_id,
            invitation.role_id,
        );

        try {
            await assignProfileOrganization(
                userId,
                invitation.organization_id,
                resolvedRoleId,
                contactId,
            );
        } catch (profileError) {
            console.error('Error updating profile:', profileError);
            return { success: false, error: 'Failed to assign user to organization' };
        }

        // If there's a specific project, add user to project via project_contacts
        if (invitation.project_id) {
            const { error: projectContactError } = await supabaseClient
                .from('project_contacts')
                .insert({
                    project_id: invitation.project_id,
                    contact_id: contactId,
                    organization_id: invitation.organization_id
                });

            if (projectContactError && !projectContactError.message.includes('duplicate')) {
                console.error('Error adding to project:', projectContactError);
                // Don't fail the invitation if project contact fails
            }
        }

        // If there's a specific step, update it to assign to this user
        if (invitation.step_id) {
            await supabaseClient
                .from('issue_steps')
                .update({
                    assigned_to_user_id: userId,
                    assigned_to_contact_id: contactId
                })
                .eq('id', invitation.step_id);
        }

        // Mark invitation as accepted
        await supabaseClient
            .from('invitations')
            .update({
                status: 'accepted',
                accepted_at: new Date().toISOString()
            })
            .eq('id', invitation.id);

        return { 
            success: true, 
            organizationId: invitation.organization_id,
            projectId: invitation.project_id,
            issueId: invitation.issue_id
        };

    } catch (error) {
        console.error('Error in acceptInvitation:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get pending invitations for an organization
 * @param {string} organizationId - Organization ID
 * @returns {Promise<{success: boolean, invitations?: array, error?: string}>}
 */
export async function getOrganizationInvitations(organizationId) {
    try {
        const { data, error } = await supabaseClient
            .from('invitations')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, invitations: data };
    } catch (error) {
        console.error('Error in getOrganizationInvitations:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Cancel an invitation
 * @param {string} invitationId - Invitation UUID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function cancelInvitation(invitationId) {
    try {
        const { error } = await supabaseClient
            .from('invitations')
            .update({ status: 'cancelled' })
            .eq('id', invitationId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Error in cancelInvitation:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Resend an invitation email
 * @param {string} invitationId - Invitation UUID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function resendInvitation(invitationId) {
    try {
        const { data: invitation, error } = await supabaseClient
            .from('invitations')
            .select('*')
            .eq('id', invitationId)
            .single();

        if (error || !invitation) {
            return { success: false, error: 'Invitation not found' };
        }

        if (invitation.status !== 'pending') {
            return { success: false, error: 'Can only resend pending invitations' };
        }

        // Get project and inviter details
        const { data: project } = await supabaseClient
            .from('projects')
            .select('name')
            .eq('id', invitation.project_id)
            .single();

        const { data: inviter } = await supabaseClient
            .from('profiles')
            .select('*, contacts(*)')
            .eq('id', invitation.invited_by_user_id)
            .single();

        // Get organization details
        const { data: organization } = await supabaseClient
            .from('organizations')
            .select('name')
            .eq('id', invitation.organization_id)
            .single();

        const inviterName = inviter?.contacts?.name || 'A team member';
        const appUrl = window.location.origin;
        const webInvitationUrl = `${appUrl}/invite/${invitation.invitation_token}`;
        const mobileInvitationUrl = `siteweave://invite/${invitation.invitation_token}`;

        // Resend email
        let emailSent = false;
        let emailError = null;
        
        try {
            const emailResult = await supabaseClient.functions.invoke('send-invitation-email', {
                body: {
                    to: invitation.email,
                    inviterName: inviterName,
                    organizationName: organization?.name || 'an organization',
                    projectName: project?.name || null,
                    webInvitationUrl: webInvitationUrl,
                    mobileInvitationUrl: mobileInvitationUrl,
                    issueId: invitation.issue_id,
                    stepId: invitation.step_id
                }
            });

            if (emailResult.error) {
                emailError = emailResult.error.message || 'Failed to send email';
            } else if (emailResult.data?.error) {
                emailError = emailResult.data.error;
            } else {
                emailSent = true;
            }
        } catch (err) {
            emailError = err.message || 'Failed to send email';
        }

        if (!emailSent) {
            return { success: false, error: emailError || 'Failed to send email' };
        }

        return { success: true, emailSent: true };
    } catch (error) {
        console.error('Error in resendInvitation:', error);
        return { success: false, error: error.message };
    }
}




