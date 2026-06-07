/**
 * Deferred boot work — contacts, activity, preferences, avatar, invite bootstrap.
 * Used after the returning-user fast path unblocks the shell.
 */

import { loadWithFallback } from '@siteweave/core-logic';

export function needsImmediateBootstrap(user) {
  return Boolean(
    sessionStorage.getItem('pendingAccountIntent')
    || sessionStorage.getItem('pendingProjectInviteToken')
    || user?.user_metadata?.pending_organization_id,
  );
}

export function isReturningUserFastPath(existingProfile, finalProfile, user) {
  return Boolean(
    existingProfile
    && finalProfile?.organization_id
    && !needsImmediateBootstrap(user),
  );
}

export async function loadContactsDirectory(supabaseClient, userId, organizationId, projectIds) {
  const { getVirtualContacts, getProjectContactsForContacts } = await import('./virtualContactsService');

  let finalContacts = await getVirtualContacts(
    supabaseClient,
    userId,
    organizationId,
    projectIds,
  );

  const internalContactIds = finalContacts
    .filter((c) => c.is_internal && c.id)
    .map((c) => c.id);

  if (internalContactIds.length > 0) {
    const projectContacts = await getProjectContactsForContacts(supabaseClient, internalContactIds);
    finalContacts = finalContacts.map((contact) => {
      if (!contact.is_internal) return contact;
      const existingProjectContacts = contact.project_contacts || [];
      const mergedProjectContacts = [...existingProjectContacts];
      projectContacts
        .filter((pc) => pc.contact_id === contact.id)
        .forEach((pc) => {
          if (!mergedProjectContacts.some((epc) => epc.project_id === pc.project_id)) {
            mergedProjectContacts.push({ project_id: pc.project_id });
          }
        });
      return { ...contact, project_contacts: mergedProjectContacts };
    });
  }

  return finalContacts;
}

export async function runBackgroundBoot({
  supabaseClient,
  dispatch,
  user,
  organization,
  finalProjects,
  finalProfile,
  profileWithOrg,
  currentActiveView,
}) {
  const organizationId = organization?.id ?? null;
  const userProjectIds = (finalProjects || []).map((p) => p.id);

  try {
    if (profileWithOrg?.account_intent) {
      dispatch({ type: 'SET_ACCOUNT_INTENT', payload: profileWithOrg.account_intent });
    }

    try {
      const { data: profileCheck } = await supabaseClient
        .from('profiles')
        .select('must_change_password')
        .eq('id', user.id)
        .single();
      if (profileCheck?.must_change_password) {
        dispatch({ type: 'SET_MUST_CHANGE_PASSWORD', payload: true });
      }
    } catch {
      // column may not exist on older schemas
    }

    if (user?.id) {
      try {
        const { resolveUserAvatarUrl } = await import('@siteweave/core-logic');
        const avatarUrl = await resolveUserAvatarUrl(supabaseClient, user.id);
        dispatch({ type: 'SET_PROFILE_AVATAR_URL', payload: avatarUrl });
      } catch (avatarErr) {
        console.warn('Could not load profile avatar:', avatarErr);
      }
    }

    try {
      const workspaceClient = await import('./workspaceClient');
      await workspaceClient.runInviteBootstrap(supabaseClient);
    } catch (bootstrapErr) {
      console.warn('Account bootstrap (invites/provision):', bootstrapErr);
    }

    if (user?.id && (profileWithOrg?.account_intent || 'workspace_owner') === 'workspace_owner') {
      try {
        const { ensureOrganizationForWrites } = await import('./organizationContext');
        await ensureOrganizationForWrites(supabaseClient, {
          userId: user.id,
          accountIntent: profileWithOrg?.account_intent || 'workspace_owner',
          currentOrganization: organization,
          dispatch,
        });
      } catch (repairErr) {
        console.warn('ensureOrganizationForWrites on boot:', repairErr);
      }
    }

    const fetchActivityLog = async () => {
      let q = supabaseClient
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (organizationId) {
        q = q.eq('organization_id', organizationId);
      }
      const { data, error: alErr } = await q;
      if (alErr) console.warn('activity_log fetch:', alErr.message);
      return data || [];
    };

    const [userPreferences, activityLog] = await Promise.all([
      loadWithFallback(
        async () => {
          const { data, error } = await supabaseClient
            .from('user_preferences')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        null,
        { label: 'user_preferences' },
      ),
      loadWithFallback(fetchActivityLog, [], { label: 'activity_log' }),
    ]);

    dispatch({
      type: 'SET_DATA',
      payload: {
        activityLog: activityLog || [],
        activeView: currentActiveView,
      },
    });
    dispatch({ type: 'SET_USER_PREFERENCES', payload: userPreferences });

    try {
      const finalContacts = await loadContactsDirectory(
        supabaseClient,
        user.id,
        organizationId,
        userProjectIds,
      );
      dispatch({ type: 'SET_CONTACTS', payload: finalContacts });
    } catch (error) {
      console.error('Error fetching virtual contacts (background):', error);
    }
  } catch (error) {
    console.error('Background boot error:', error);
  }
}

export function scheduleDeferredContactsLoad({
  supabaseClient,
  dispatch,
  userId,
  organizationId,
  projectIds,
}) {
  loadContactsDirectory(supabaseClient, userId, organizationId, projectIds)
    .then((finalContacts) => {
      dispatch({ type: 'SET_CONTACTS', payload: finalContacts });
    })
    .catch((error) => {
      console.error('Error fetching virtual contacts (deferred):', error);
    });
}
