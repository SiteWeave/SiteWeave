/**
 * Resolves a list of auth user IDs → { id, name, avatar_url } map
 * by joining profiles → contacts. Used by stream and task-comment services.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} userIds
 * @returns {Promise<Record<string, { id: string, name: string, avatar_url: string|null }>>}
 */
export async function fetchUserInfo(supabase, userIds) {
  if (!userIds?.length) return {};

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, contact_id')
    .in('id', userIds);

  if (profilesError) throw profilesError;
  if (!profiles?.length) return {};

  const contactIds = [...new Set(profiles.map((p) => p.contact_id).filter(Boolean))];
  if (!contactIds.length) return {};

  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, name, avatar_url')
    .in('id', contactIds);

  if (contactsError) throw contactsError;

  const contactMap = {};
  (contacts || []).forEach((c) => {
    contactMap[c.id] = c;
  });

  const userMap = {};
  profiles.forEach((profile) => {
    if (profile.contact_id && contactMap[profile.contact_id]) {
      const contact = contactMap[profile.contact_id];
      userMap[profile.id] = {
        id: profile.id,
        name: contact.name,
        avatar_url: contact.avatar_url,
      };
    }
  });

  return userMap;
}
