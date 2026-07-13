import { normalizeAssigneePhone } from '@siteweave/core-logic';

const fnBase = (name) => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('VITE_SUPABASE_URL is not set');
  return `${url.replace(/\/$/, '')}/functions/v1/${name}`;
};

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

  const { data, error } = await supabaseClient
    .from('sms_phone_consent')
    .select('phone_e164, status')
    .in('phone_e164', [...phones]);

  if (error) {
    console.warn('loadSmsConsentByPhones:', error.message);
    return new Map();
  }
  const map = new Map((data || []).map((row) => [row.phone_e164, row.status]));

  if (organizationId) {
    const now = Date.now();
    const { data: pendingRows, error: pendingErr } = await supabaseClient
      .from('sms_consent_requests')
      .select('phone_e164, status, expires_at')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .in('phone_e164', [...phones]);

    if (!pendingErr) {
      for (const row of pendingRows || []) {
        const expires = new Date(row.expires_at).getTime();
        if (Number.isNaN(expires) || expires <= now) continue;
        const current = map.get(row.phone_e164);
        if (!current || current === 'none') {
          map.set(row.phone_e164, 'pending');
        }
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
