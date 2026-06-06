const PROFILE_PREFIX = 'profile:';

export function isPersistedContactId(contactId) {
  if (!contactId) return false;
  return !String(contactId).startsWith(PROFILE_PREFIX);
}

export function profileIdFromContactRef(contactId) {
  if (!contactId) return null;
  const value = String(contactId);
  if (!value.startsWith(PROFILE_PREFIX)) return null;
  return value.slice(PROFILE_PREFIX.length) || null;
}

/**
 * Resolve a contacts.id suitable for project_contacts FK.
 * Creates or links a contact row when an org member only has a profile reference.
 */
export async function ensureContactIdForProjectAssignment(supabase, {
  contactId,
  profileId,
  organizationId,
  name,
  email,
  phone,
  type = 'Team',
  userId,
}) {
  if (!organizationId) {
    throw new Error('Organization is required to assign someone to a project');
  }

  if (contactId && isPersistedContactId(contactId)) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (existing?.id) return existing.id;
  }

  const resolvedProfileId = profileId || profileIdFromContactRef(contactId);
  let resolvedEmail = email?.trim() || null;
  let resolvedName = name?.trim() || null;
  let resolvedPhone = phone?.trim() || null;

  if (resolvedProfileId) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, contact_id, contacts!fk_profiles_contact (id, email, name, phone)')
      .eq('id', resolvedProfileId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (profile?.contact_id && isPersistedContactId(profile.contact_id)) {
      return profile.contact_id;
    }

    const linked = profile?.contacts;
    resolvedEmail = resolvedEmail || linked?.email || null;
    resolvedName = resolvedName || linked?.name || null;
    resolvedPhone = resolvedPhone || linked?.phone || null;
  }

  if (resolvedEmail) {
    const { data: byEmail } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', resolvedEmail)
      .maybeSingle();

    if (byEmail?.id) {
      if (resolvedProfileId) {
        await supabase
          .from('profiles')
          .update({ contact_id: byEmail.id })
          .eq('id', resolvedProfileId);
      }
      return byEmail.id;
    }
  }

  if (!resolvedEmail && !resolvedName) {
    throw new Error('Contact record required before assigning to a project');
  }

  const { data: created, error: createError } = await supabase
    .from('contacts')
    .insert({
      name: resolvedName || resolvedEmail?.split('@')[0] || 'Team member',
      email: resolvedEmail,
      phone: resolvedPhone || null,
      type,
      status: 'Available',
      organization_id: organizationId,
      ...(userId ? { created_by_user_id: userId } : {}),
    })
    .select('id')
    .single();

  if (createError) throw createError;

  if (resolvedProfileId) {
    await supabase
      .from('profiles')
      .update({ contact_id: created.id })
      .eq('id', resolvedProfileId);
  }

  return created.id;
}
