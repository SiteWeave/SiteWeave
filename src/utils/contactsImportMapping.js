/**
 * Contact CSV field mapping, draft building, and validation.
 */

import { normalizeContactEmail, normalizeContactPhoneDigits } from '@siteweave/core-logic';

export const CONTACT_TARGET = {
  NAME: 'name',
  COMPANY: 'company',
  TRADE: 'trade',
  ROLE: 'role',
  EMAIL: 'email',
  PHONE: 'phone',
  IGNORE: 'ignore',
};

/**
 * Default suggestions for common / SiteWeave export headers and sectioned lists.
 * Sectioned "Trade" column = company; section title maps via meta:section → trade.
 */
export const DEFAULT_CONTACT_SUGGESTIONS = {
  name: CONTACT_TARGET.NAME,
  contact: CONTACT_TARGET.NAME,
  full_name: CONTACT_TARGET.NAME,
  contact_name: CONTACT_TARGET.NAME,
  company: CONTACT_TARGET.COMPANY,
  vendor: CONTACT_TARGET.COMPANY,
  business: CONTACT_TARGET.COMPANY,
  trade: CONTACT_TARGET.TRADE,
  email: CONTACT_TARGET.EMAIL,
  e_mail: CONTACT_TARGET.EMAIL,
  phone: CONTACT_TARGET.PHONE,
  phone_number: CONTACT_TARGET.PHONE,
  mobile: CONTACT_TARGET.PHONE,
  cell: CONTACT_TARGET.PHONE,
  role: CONTACT_TARGET.ROLE,
  title: CONTACT_TARGET.ROLE,
  job_title: CONTACT_TARGET.ROLE,
  'meta:section': CONTACT_TARGET.TRADE,
};

/**
 * For sectioned layouts, column "trade" means company (person is under "contact").
 * @param {'flat'|'sectioned'|string|undefined} layout
 * @returns {Record<string, string>}
 */
export function defaultSuggestionsForLayout(layout) {
  const base = { ...DEFAULT_CONTACT_SUGGESTIONS };
  if (layout === 'sectioned') {
    base.trade = CONTACT_TARGET.COMPANY;
  }
  return base;
}

/**
 * @param {Record<string, string>} userMap
 * @param {'flat'|'sectioned'|string|undefined} layout
 * @returns {Record<string, string>}
 */
export function mergeWithSuggestedContactMappings(userMap = {}, layout = 'flat') {
  const out = defaultSuggestionsForLayout(layout);
  for (const [k, v] of Object.entries(userMap)) {
    if (v === '' || v == null) {
      delete out[k];
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param {Record<string, string>} lookup
 * @param {Record<string, string>} sourceFieldMappings
 * @param {string} target
 * @returns {string | undefined}
 */
function valueForTarget(lookup, sourceFieldMappings, target) {
  for (const [srcKey, tgt] of Object.entries(sourceFieldMappings)) {
    if (tgt === target && lookup[srcKey] != null && String(lookup[srcKey]).trim() !== '') {
      return String(lookup[srcKey]).trim();
    }
  }
  return undefined;
}

/**
 * Extract first email from a messy cell (may contain multiple separated by ; or ,).
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function extractPrimaryEmail(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!match) return null;
  return normalizeContactEmail(match[0]);
}

/**
 * Extract a displayable primary phone from messy Office/Cell blobs.
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function extractPrimaryPhone(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  // Prefer explicit "Cell:" segments when present
  const cellMatch = text.match(/cell\s*:?\s*([+\d().\s-]{7,})/i);
  const officeMatch = text.match(/office\s*:?\s*([+\d().\s-]{7,})/i);
  const candidates = [];
  if (cellMatch?.[1]) candidates.push(cellMatch[1]);
  if (officeMatch?.[1]) candidates.push(officeMatch[1]);

  // Fallback: first run of phone-like digits
  const loose = text.match(/(\+?1?[\s\-.]*)?(\(?\d{3}\)?[\s\-.]*)?\d{3}[\s\-.]*\d{4}/);
  if (loose?.[0]) candidates.push(loose[0]);

  for (const candidate of candidates) {
    const digits = normalizeContactPhoneDigits(candidate);
    if (digits) {
      // Keep a readable trimmed original-ish value (first line)
      const display = String(candidate).replace(/\s+/g, ' ').trim();
      return display.slice(0, 40) || digits;
    }
  }

  // Last resort: if normalized digits exist anywhere
  const allDigits = normalizeContactPhoneDigits(text);
  return allDigits || null;
}

/**
 * @param {{
 *   rows: Array<{ fields: Record<string, string>, sectionTrade?: string|null }>,
 *   sourceFieldMappings: Record<string, string>,
 *   layout?: string,
 * }} opts
 */
export function buildContactsFromMappedRows(opts) {
  const { rows, sourceFieldMappings } = opts;
  /** @type {Array<{ name: string, company: string|null, trade: string|null, role: string|null, email: string|null, phone: string|null, sourceRowIndex?: number }>} */
  const contacts = [];
  /** @type {Array<string|{ key: string, params?: object }>} */
  const warnings = [];
  let skippedIncomplete = 0;
  let messyPhoneCount = 0;
  let multiEmailCount = 0;
  let missingEmailCount = 0;

  for (const row of rows || []) {
    const lookup = { ...(row.fields || {}) };
    if (row.sectionTrade && !lookup['meta:section']) {
      lookup['meta:section'] = row.sectionTrade;
    }

    let name = valueForTarget(lookup, sourceFieldMappings, CONTACT_TARGET.NAME) || '';
    let company = valueForTarget(lookup, sourceFieldMappings, CONTACT_TARGET.COMPANY) || null;
    let trade = valueForTarget(lookup, sourceFieldMappings, CONTACT_TARGET.TRADE) || null;
    let role = valueForTarget(lookup, sourceFieldMappings, CONTACT_TARGET.ROLE) || null;
    const rawEmail = valueForTarget(lookup, sourceFieldMappings, CONTACT_TARGET.EMAIL);
    const rawPhone = valueForTarget(lookup, sourceFieldMappings, CONTACT_TARGET.PHONE);

    if (rawEmail && /[;,]/.test(rawEmail) && (rawEmail.match(/@/g) || []).length > 1) {
      multiEmailCount += 1;
    }
    if (rawPhone && (/cell/i.test(rawPhone) || /office/i.test(rawPhone) || rawPhone.includes('\n'))) {
      messyPhoneCount += 1;
    }

    const email = extractPrimaryEmail(rawEmail);
    const phone = extractPrimaryPhone(rawPhone);

    if (rawEmail && !email) {
      // invalid email text — keep going; may still have name/phone
    }

    name = name.trim();
    company = company?.trim() || null;
    trade = trade?.trim() || null;
    role = role?.trim() || null;

    if (!name && company) {
      name = company;
    }

    if (!name && !company && !email && !phone) {
      skippedIncomplete += 1;
      continue;
    }

    if (!name) {
      // Need a display name; invent from email local-part if needed
      if (email) {
        name = email.split('@')[0];
      } else {
        skippedIncomplete += 1;
        continue;
      }
    }

    if (!email) missingEmailCount += 1;

    contacts.push({
      name,
      company,
      trade,
      role,
      email,
      phone,
      sourceRowIndex: row.sourceRowIndex,
    });
  }

  if (messyPhoneCount > 0) {
    warnings.push({ key: 'contacts_import.warn_messy_phones', params: { count: messyPhoneCount } });
  }
  if (multiEmailCount > 0) {
    warnings.push({ key: 'contacts_import.warn_multi_emails', params: { count: multiEmailCount } });
  }
  if (missingEmailCount > 0 && contacts.length > 0) {
    warnings.push({ key: 'contacts_import.warn_missing_emails', params: { count: missingEmailCount } });
  }
  if (skippedIncomplete > 0) {
    warnings.push({ key: 'contacts_import.warn_skipped_incomplete', params: { count: skippedIncomplete } });
  }

  const samples = contacts.slice(0, 8).map((c) => {
    if (c.company && c.name && c.company !== c.name) return `${c.company} — ${c.name}`;
    return c.name;
  });

  return {
    contacts,
    skippedIncomplete,
    warnings,
    samples,
    createCount: contacts.length,
  };
}

/**
 * @param {Record<string, string>} sourceFieldMappings
 * @returns {Array<string|{ key: string, params?: object }>}
 */
export function getContactImportBlockingIssues(sourceFieldMappings, preview) {
  const issues = [];
  const targets = Object.values(sourceFieldMappings || {});
  const hasName = targets.includes(CONTACT_TARGET.NAME);
  const hasCompany = targets.includes(CONTACT_TARGET.COMPANY);
  const hasEmail = targets.includes(CONTACT_TARGET.EMAIL);
  const hasPhone = targets.includes(CONTACT_TARGET.PHONE);

  if (!hasName && !hasCompany) {
    issues.push('contacts_import.block_need_name_or_company');
  }
  if (!hasName && !hasEmail && !hasPhone && !hasCompany) {
    issues.push('contacts_import.block_nothing_mapped');
  }
  if (preview && preview.createCount === 0) {
    issues.push('contacts_import.block_no_contacts');
  }
  return issues;
}

/**
 * @param {Record<string, string>} sourceFieldMappings
 * @returns {Array<string|{ key: string, params?: object }>}
 */
export function getContactImportWarnings(sourceFieldMappings) {
  const warnings = [];
  const targets = Object.values(sourceFieldMappings || {});
  if (!targets.includes(CONTACT_TARGET.EMAIL)) {
    warnings.push('contacts_import.warn_no_email_mapped');
  }
  if (!targets.includes(CONTACT_TARGET.PHONE)) {
    warnings.push('contacts_import.warn_no_phone_mapped');
  }
  return warnings;
}
