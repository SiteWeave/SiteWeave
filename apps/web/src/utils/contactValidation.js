import {
  assertContactIdentityUnique,
  normalizeContactEmail,
  parseContactIdentityDbError,
} from '@siteweave/core-logic';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @param {{ email?: string|null, phone?: string|null, id?: string }} contactData
 * @param {(key: string, vars?: object) => string} t
 * @returns {Promise<{ field: 'email'|'phone'|null, message: string }|null>}
 */
export async function getContactIdentityError(supabase, organizationId, contactData, t) {
  if (!organizationId) return null;

  const result = await assertContactIdentityUnique(supabase, {
    organizationId,
    email: contactData.email,
    phone: contactData.phone,
    excludeContactId: contactData.id || null,
  });

  if (!result.ok) {
    const key = result.field === 'email' ? 'contacts.duplicate_email' : 'contacts.duplicate_phone';
    return { field: result.field, message: t(key, { name: result.contact.name }) };
  }

  return null;
}

/**
 * @param {unknown} error
 * @param {(key: string) => string} t
 * @returns {{ field: 'email'|'phone'|'identity'|null, message: string }|null}
 */
export function getContactIdentityDbError(error, t) {
  const field = parseContactIdentityDbError(error);
  if (!field) return null;

  const key = field === 'email'
    ? 'contacts.duplicate_email_generic'
    : field === 'phone'
      ? 'contacts.duplicate_phone_generic'
      : 'contacts.duplicate_identity';

  return { field, message: t(key) };
}

/**
 * @param {{ email?: string|null, phone?: string|null }} contactData
 * @returns {{ email: string|null, phone: string|null }}
 */
export function normalizeContactFields(contactData) {
  const email = normalizeContactEmail(contactData.email);
  const phone = String(contactData.phone ?? '').trim() || null;
  return { email, phone };
}
