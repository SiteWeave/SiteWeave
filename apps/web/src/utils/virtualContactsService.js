/**
 * Virtual Contacts Service
 * Implements the "Corporate Directory" model:
 * - Group A (Internal): All users where organization_id matches current_user.organization_id
 * - Group B (External/Guests): All users who are project_collaborators on the same projects as the current user
 * - Group C (Project Contacts): All contacts directly assigned to projects via project_contacts table
 * 
 * Privacy Guard: Guest users can only see Group B (people on their projects), not Group A
 */

/**
 * Check if a user is a guest (not an organization member)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if user is a guest
 */
export async function isGuestUser(supabase, userId) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();
    
    // User is a guest if they have no organization_id
    return !profile?.organization_id;
  } catch (error) {
    console.error('Error checking if user is guest:', error);
    return false;
  }
}

/**
 * Get virtual contacts (Organization Directory + Project Collaborators + Project Contacts)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - Current user ID
 * @param {string} organizationId - Current user's organization ID (null for guests)
 * @param {Array<string>} userProjectIds - Array of project IDs the user has access to
 * @returns {Promise<Array>} Array of virtual contacts
 */
export async function getVirtualContacts(supabase, userId, organizationId, userProjectIds = []) {
  try {
    const isGuest = !organizationId;
    const contactMap = new Map(); // Use Map to deduplicate by contact ID

    // Group A: Organization Members (only if user is NOT a guest)
    if (!isGuest && organizationId) {
      const { data: orgMembers, error: orgError } = await supabase
        .from('profiles')
        .select(`
          id,
          created_at,
          organization_id,
          contacts!fk_profiles_contact (
            id,
            name,
            email,
            role,
            phone,
            avatar_url,
            status,
            type,
            company,
            trade
          ),
          roles (
            id,
            name,
            permissions
          )
        `)
        .eq('organization_id', organizationId);

      if (orgError) {
        console.error('Error fetching organization members:', orgError);
      } else if (orgMembers) {
        orgMembers.forEach(member => {
          if (member.contacts) {
            const contact = {
              id: member.contacts.id,
              name: member.contacts.name,
              email: member.contacts.email,
              role: member.contacts.role,
              phone: member.contacts.phone,
              avatar_url: member.contacts.avatar_url,
              status: member.contacts.status || 'Available',
              type: member.contacts.type || 'Team',
              company: member.contacts.company,
              trade: member.contacts.trade,
              profile_id: member.id,
              organization_id: member.organization_id,
              role_id: member.roles?.id,
              role_name: member.roles?.name,
              is_internal: true,
              project_contacts: [] // Will be populated separately if needed
            };
            contactMap.set(member.contacts.id, contact);
          }
        });
      }
    }

    // Group B: Project Collaborators (users on same projects as current user)
    if (userProjectIds.length > 0) {
      // Query project_collaborators and then fetch profiles separately
      // This avoids the foreign key relationship issue since project_collaborators.user_id
      // references auth.users(id), not profiles directly
      const { data: collaboratorsData, error: collabError } = await supabase
        .from('project_collaborators')
        .select('user_id, project_id, access_level')
        .in('project_id', userProjectIds);
      
      if (collabError) {
        console.error('Error fetching project collaborators:', collabError);
      } else if (collaboratorsData && collaboratorsData.length > 0) {
        // Get unique user IDs
        const userIds = [...new Set(collaboratorsData.map(c => c.user_id))];
        
        // Fetch profiles with contacts and roles for these users
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select(`
            id,
            organization_id,
            contacts!fk_profiles_contact (
              id,
              name,
              email,
              role,
              phone,
              avatar_url,
              status,
              type,
              company,
              trade
            ),
            roles (
              id,
              name,
              permissions
            )
          `)
          .in('id', userIds);
        
        if (profilesError) {
          console.error('Error fetching collaborator profiles:', profilesError);
        } else if (profilesData) {
          // Create a map of user_id to profile
          const profileMap = new Map(profilesData.map(p => [p.id, p]));
          
          // Combine collaborators with their profiles
          const collaborators = collaboratorsData.map(collab => ({
            ...collab,
            profiles: profileMap.get(collab.user_id)
          }));

          // Process collaborators
          collaborators.forEach(collab => {
            const profile = collab.profiles;
            if (profile && profile.contacts) {
            const existingContact = contactMap.get(profile.contacts.id);
              
              if (existingContact) {
                // User already in map (internal member), just add project_contact
                if (!existingContact.project_contacts) {
                  existingContact.project_contacts = [];
                }
                existingContact.project_contacts.push({
                  project_id: collab.project_id,
                  access_level: collab.access_level
                });
              } else {
                // New external/guest contact
                const contact = {
                  id: profile.contacts.id,
                  name: profile.contacts.name,
                  email: profile.contacts.email,
                  role: profile.contacts.role,
                  phone: profile.contacts.phone,
                  avatar_url: profile.contacts.avatar_url,
                  status: profile.contacts.status || 'Available',
                  type: profile.contacts.type || 'Subcontractor',
                  company: profile.contacts.company,
                  trade: profile.contacts.trade,
                  profile_id: profile.id,
                  organization_id: profile.organization_id,
                  role_id: profile.roles?.id,
                  role_name: profile.roles?.name,
                  is_internal: false,
                  is_guest: !profile.organization_id || profile.organization_id !== organizationId,
                  project_contacts: [{
                    project_id: collab.project_id,
                    access_level: collab.access_level
                  }]
                };
                contactMap.set(profile.contacts.id, contact);
              }
            }
          });
        }
      }
    }

    // Group C: Contacts from project_contacts table (critical for invite/add-member flows)
    // Ensures contacts assigned to projects are loaded even if they don't have profiles.
    if (organizationId) {
      const { data: projectContactsData, error: pcError } = await supabase
        .from('project_contacts')
        .select(`
          project_id,
          contact_id,
          role,
          contacts!fk_project_contacts_contact_id (
            id,
            name,
            email,
            role,
            phone,
            avatar_url,
            status,
            type,
            company,
            trade,
            organization_id
          )
        `)
        .eq('organization_id', organizationId);

      if (pcError) {
        console.error('Error fetching project_contacts:', pcError);
      } else if (projectContactsData) {
        projectContactsData.forEach(pc => {
          if (pc.contacts) {
            const existingContact = contactMap.get(pc.contacts.id);

            if (existingContact) {
              if (!existingContact.project_contacts) {
                existingContact.project_contacts = [];
              }
              const hasProject = existingContact.project_contacts.some(
                p => String(p.project_id) === String(pc.project_id)
              );
              if (!hasProject) {
                existingContact.project_contacts.push({
                  project_id: pc.project_id,
                  role: pc.role
                });
              }
            } else {
              const contact = {
                id: pc.contacts.id,
                name: pc.contacts.name,
                email: pc.contacts.email,
                role: pc.contacts.role,
                phone: pc.contacts.phone,
                avatar_url: pc.contacts.avatar_url,
                status: pc.contacts.status || 'Available',
                type: pc.contacts.type || 'Team',
                company: pc.contacts.company,
                trade: pc.contacts.trade,
                organization_id: pc.contacts.organization_id,
                is_internal: pc.contacts.organization_id === organizationId,
                project_contacts: [{
                  project_id: pc.project_id,
                  role: pc.role
                }]
              };
              contactMap.set(pc.contacts.id, contact);
            }
          }
        });
      }
    }

    // Convert Map to Array
    return Array.from(contactMap.values());
  } catch (error) {
    console.error('Error fetching virtual contacts:', error);
    return [];
  }
}

/**
 * Get project_contacts relationships for virtual contacts
 * This is a helper to populate project_contacts for internal members
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Array<string>} contactIds - Array of contact IDs
 * @returns {Promise<Array>} Array of project_contacts relationships
 */
export async function getProjectContactsForContacts(supabase, contactIds) {
  if (!contactIds || contactIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from('project_contacts')
      .select('contact_id, project_id')
      .in('contact_id', contactIds);

    if (error) {
      console.error('Error fetching project_contacts:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching project_contacts:', error);
    return [];
  }
}
