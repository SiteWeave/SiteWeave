/**
 * Contacts Service
 * Handles all contact-related database operations
 */

import {
  normalizeContactEmail,
  normalizeContactPhoneDigits,
} from '../utils/contactIdentity.js';

/**
 * Find another contact in the org with the same email or phone.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId: string, email?: string|null, phone?: string|null, excludeContactId?: string|null }} params
 * @returns {Promise<{ field: 'email'|'phone', contact: object }|null>}
 */
export async function findContactIdentityConflict(supabase, {
  organizationId,
  email,
  phone,
  excludeContactId = null,
}) {
  if (!organizationId) return null;

  const normalizedEmail = normalizeContactEmail(email);
  const normalizedPhone = normalizeContactPhoneDigits(phone);

  if (normalizedEmail) {
    let query = supabase
      .from('contacts')
      .select('id, name, email, phone, type')
      .eq('organization_id', organizationId)
      .ilike('email', normalizedEmail)
      .limit(1);

    if (excludeContactId) {
      query = query.neq('id', excludeContactId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) return { field: 'email', contact: data };
  }

  if (normalizedPhone) {
    const { data: rows, error } = await supabase
      .from('contacts')
      .select('id, name, email, phone, type')
      .eq('organization_id', organizationId)
      .not('phone', 'is', null);

    if (error) throw error;

    const match = (rows || []).find((row) => {
      if (excludeContactId && row.id === excludeContactId) return false;
      return normalizeContactPhoneDigits(row.phone) === normalizedPhone;
    });

    if (match) return { field: 'phone', contact: match };
  }

  return null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId: string, email?: string|null, phone?: string|null, excludeContactId?: string|null }} params
 * @returns {Promise<{ ok: true }|{ ok: false, field: 'email'|'phone', contact: object }>}
 */
export async function assertContactIdentityUnique(supabase, params) {
  const conflict = await findContactIdentityConflict(supabase, params);
  if (conflict) {
    return { ok: false, field: conflict.field, contact: conflict.contact };
  }
  return { ok: true };
}

/** Map Postgres unique-violation on contact identity to a field hint. */
export function parseContactIdentityDbError(error) {
  if (!error || error.code !== '23505') return null;
  const message = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const combined = `${message} ${details}`;
  if (combined.includes('email')) return 'email';
  if (combined.includes('phone')) return 'phone';
  return 'identity';
}

/**
 * Fetch all contacts
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {Promise<Array>} Array of contacts
 */
export async function fetchContacts(supabase) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('name', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

/**
 * Fetch contacts for a specific project
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Array of contacts assigned to the project
 */
export async function fetchProjectContacts(supabase, projectId) {
  const { data, error } = await supabase
    .from('project_contacts')
    .select('contact_id, contacts!fk_project_contacts_contact_id(*)')
    .eq('project_id', projectId);
  
  if (error) throw error;
  return (data || []).map(item => item.contacts).filter(Boolean);
}

/**
 * Fetch a single contact by ID
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} contactId - Contact ID
 * @returns {Promise<Object>} Contact object
 */
export async function fetchContact(supabase, contactId) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

