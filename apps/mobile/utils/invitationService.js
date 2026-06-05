/**
 * Mobile Invitation Service
 * Handles accepting invitations on mobile
 */

async function resolveInvitationRoleId(supabase, organizationId, preferredRoleId) {
  if (preferredRoleId) {
    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('id', preferredRoleId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (role?.id) return role.id;
  }

  const { data: memberRole } = await supabase
    .from('roles')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('name', 'Member')
    .maybeSingle();

  if (memberRole?.id) return memberRole.id;

  return preferredRoleId || null;
}

async function assignProfileOrganization(supabase, userId, organizationId, roleId, contactId) {
  const { data, error } = await supabase.functions.invoke('update-profile-organization', {
    body: { userId, organizationId, roleId, contactId },
  });

  if (error) {
    const { error: directError } = await supabase
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
 * Accept an invitation and link user to organization
 * @param {Object} supabase - Supabase client
 * @param {string} invitationToken - Invitation token
 * @param {string} userId - New user ID after signup
 * @returns {Promise<{success: boolean, organizationId?: string, projectId?: string, error?: string}>}
 */
export async function acceptInvitation(supabase, invitationToken, userId) {
  try {
    // Get invitation details
    const { data: invitation, error: invitationError } = await supabase
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
    const { data: { user } } = await supabase.auth.getUser();
    const userEmail = user?.email;

    // Verify email matches
    if (userEmail?.toLowerCase() !== invitation.email.toLowerCase()) {
      return { 
        success: false, 
        error: 'This invitation was sent to a different email address' 
      };
    }

    // Get organization
    const { data: organization } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', invitation.organization_id)
      .single();

    if (!organization) {
      return { success: false, error: 'Organization not found' };
    }

    // Create or update contact record for this user
    let contactId;
    
    const { data: existingProfile, error: profileLookupError } = await supabase
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
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .ilike('email', userEmail)
        .eq('organization_id', invitation.organization_id)
        .maybeSingle();
      
      if (existingContact) {
        contactId = existingContact.id;
      } else {
        // Create new contact in the organization
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            name: user?.user_metadata?.full_name || userEmail,
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
      await supabase
        .from('profiles')
        .update({ contact_id: contactId })
        .eq('id', userId);
    }

    const resolvedRoleId = await resolveInvitationRoleId(
      supabase,
      invitation.organization_id,
      invitation.role_id,
    );

    try {
      await assignProfileOrganization(
        supabase,
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
      const { error: projectContactError } = await supabase
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
      await supabase
        .from('issue_steps')
        .update({
          assigned_to_user_id: userId,
          assigned_to_contact_id: contactId
        })
        .eq('id', invitation.step_id);
    }

    // Mark invitation as accepted
    await supabase
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

