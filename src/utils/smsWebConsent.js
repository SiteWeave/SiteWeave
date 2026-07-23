import { normalizeAssigneePhone } from '@siteweave/core-logic';

const PHONE_QUERY_CHUNK = 80;

const fnBase = (name) => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('VITE_SUPABASE_URL is not set');
  return `${url.replace(/\/$/, '')}/functions/v1/${name}`;
};

async function queryConsentRowsInChunks(supabaseClient, table, columns, phoneList, extraFilter) {
  const rows = [];
  for (let i = 0; i < phoneList.length; i += PHONE_QUERY_CHUNK) {
    const chunk = phoneList.slice(i, i + PHONE_QUERY_CHUNK);
    let query = supabaseClient.from(table).select(columns).in('phone_e164', chunk);
    if (extraFilter) query = extraFilter(query);
    const { data, error } = await query;
    if (error) {
      console.warn(`loadSmsConsentByPhones(${table}):`, error.message);
      continue;
    }
    rows.push(...(data || []));
  }
  return rows;
}

export async function fetchSmsConsentRequest(token) {
  const res = await fetch(`${fnBase('sms-consent-request')}?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || 'Failed to load consent request');
    err.code = data?.error || 'request_failed';
    throw err;
  }
  return data;
}

export async function confirmSmsWebConsent(token) {
  const res = await fetch(fnBase('confirm-sms-web-consent'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify({ token, agreed: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.reason || data?.error || 'Failed to confirm consent');
    err.code = data?.reason || data?.error || 'confirm_failed';
    throw err;
  }
  return data;
}

export async function createSmsConsentLink({
  supabaseClient,
  organizationId,
  recipientPhone,
  contactId,
  pmAttestation,
}) {
  const { data, error } = await supabaseClient.functions.invoke('create-sms-consent-link', {
    body: {
      organizationId,
      recipientPhone,
      contactId: contactId || null,
      pmAttestation: Boolean(pmAttestation),
    },
  });
  if (error) throw error;
  return data;
}

/** Batch-load sms_phone_consent status for contacts with phones. */
export async function loadSmsConsentByPhones(supabaseClient, contacts, organizationId = null) {
  const phones = new Set();
  for (const contact of contacts || []) {
    const normalized = normalizeAssigneePhone(contact?.phone, { defaultRegion: 'US' });
    if (normalized.isValid && normalized.e164) phones.add(normalized.e164);
  }
  if (phones.size === 0) return new Map();

  const phoneList = [...phones];
  const consentRows = await queryConsentRowsInChunks(
    supabaseClient,
    'sms_phone_consent',
    'phone_e164, status',
    phoneList,
  );
  const map = new Map(consentRows.map((row) => [row.phone_e164, row.status]));

  if (organizationId) {
    const now = Date.now();
    const pendingRows = await queryConsentRowsInChunks(
      supabaseClient,
      'sms_consent_requests',
      'phone_e164, status, expires_at',
      phoneList,
      (query) => query.eq('organization_id', organizationId).eq('status', 'pending'),
    );

    for (const row of pendingRows) {
      const expires = new Date(row.expires_at).getTime();
      if (Number.isNaN(expires) || expires <= now) continue;
      const current = map.get(row.phone_e164);
      if (!current || current === 'none') {
        map.set(row.phone_e164, 'pending');
      }
    }
  }

  return map;
}

export function resolveContactSmsConsent(contact, consentMap) {
  const normalized = normalizeAssigneePhone(contact?.phone, { defaultRegion: 'US' });
  if (!normalized.isValid || !normalized.e164) return null;
  return consentMap.get(normalized.e164) || 'none';
}

/**
 * Attach sms_phone_consent status onto task rows as `assignee_sms_consent`.
 * Uses the nested `contacts.phone` from the task assignee join.
 */
export async function attachAssigneeSmsConsent(supabaseClient, tasks, organizationId = null) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (list.length === 0) return list;

  const phoneContacts = list
    .map((task) => task?.contacts)
    .filter((contact) => contact && contact.phone);
  const map = await loadSmsConsentByPhones(supabaseClient, phoneContacts, organizationId);

  return list.map((task) => ({
    ...task,
    assignee_sms_consent: resolveContactSmsConsent(task?.contacts, map),
  }));
}

