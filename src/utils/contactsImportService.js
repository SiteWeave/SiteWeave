/**
 * Persist mapped contact drafts as trade partners.
 */

import {
  normalizeContactEmail,
  normalizeContactPhoneDigits,
  parseContactIdentityDbError,
} from '@siteweave/core-logic';
import {
  buildContactsFromMappedRows,
  mergeWithSuggestedContactMappings,
} from './contactsImportMapping.js';
import { parseContactsCsv } from './contactsCsvParser.js';

const INSERT_CHUNK = 50;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   csvText: string,
 *   organizationId: string,
 *   userId: string,
 *   sourceFieldMappings?: Record<string, string>,
 *   layoutOverride?: 'flat'|'sectioned'|null,
 * }} opts
 */
export async function importContactsFromCsv(supabase, opts) {
  const {
    csvText,
    organizationId,
    userId,
    sourceFieldMappings = {},
  } = opts;

  if (!organizationId || !userId) {
    return { success: false, error: 'contacts_import.missing_org_user' };
  }

  const parsed = parseContactsCsv(csvText, {
    forceLayout: opts.layoutOverride || null,
  });
  if (parsed.error) {
    return { success: false, error: parsed.error };
  }

  const layout = parsed.layout || 'flat';
  const merged = mergeWithSuggestedContactMappings(sourceFieldMappings, layout);
  const built = buildContactsFromMappedRows({
    rows: parsed.rows || [],
    sourceFieldMappings: merged,
    layout,
  });

  if (!built.contacts.length) {
    return {
      success: false,
      error: 'contacts_import.block_no_contacts',
      warnings: built.warnings,
      metrics: {
        imported: 0,
        skippedDuplicates: 0,
        skippedIncomplete: built.skippedIncomplete,
      },
    };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('contacts')
    .select('id, name, email, phone')
    .eq('organization_id', organizationId);

  if (existingError) {
    return { success: false, error: existingError.message };
  }

  const existingEmails = new Set();
  const existingPhones = new Set();
  for (const row of existingRows || []) {
    const e = normalizeContactEmail(row.email);
    const p = normalizeContactPhoneDigits(row.phone);
    if (e) existingEmails.add(e);
    if (p) existingPhones.add(p);
  }

  const seenEmails = new Set();
  const seenPhones = new Set();
  /** @type {Array<object>} */
  const toInsert = [];
  let skippedDuplicates = 0;

  for (const draft of built.contacts) {
    const email = normalizeContactEmail(draft.email);
    const phoneDigits = normalizeContactPhoneDigits(draft.phone);

    if (email && (existingEmails.has(email) || seenEmails.has(email))) {
      skippedDuplicates += 1;
      continue;
    }
    if (phoneDigits && (existingPhones.has(phoneDigits) || seenPhones.has(phoneDigits))) {
      skippedDuplicates += 1;
      continue;
    }

    if (email) seenEmails.add(email);
    if (phoneDigits) seenPhones.add(phoneDigits);

    toInsert.push({
      name: draft.name,
      company: draft.company,
      trade: draft.trade,
      role: draft.role,
      email: email || null,
      phone: draft.phone || null,
      type: 'Subcontractor',
      status: null,
      organization_id: organizationId,
      created_by_user_id: userId,
    });
  }

  /** @type {object[]} */
  const inserted = [];

  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const { data, error } = await supabase
      .from('contacts')
      .insert(chunk)
      .select('*, project_contacts!fk_project_contacts_contact_id(project_id)');

    if (error) {
      if (parseContactIdentityDbError(error)) {
        for (const row of chunk) {
          const { data: one, error: oneError } = await supabase
            .from('contacts')
            .insert(row)
            .select('*, project_contacts!fk_project_contacts_contact_id(project_id)')
            .single();
          if (oneError) {
            if (parseContactIdentityDbError(oneError)) {
              skippedDuplicates += 1;
              continue;
            }
            return {
              success: false,
              error: oneError.message,
              contacts: inserted,
              metrics: {
                imported: inserted.length,
                skippedDuplicates,
                skippedIncomplete: built.skippedIncomplete,
              },
            };
          }
          inserted.push(one);
        }
        continue;
      }
      return {
        success: false,
        error: error.message,
        contacts: inserted,
        metrics: {
          imported: inserted.length,
          skippedDuplicates,
          skippedIncomplete: built.skippedIncomplete,
        },
      };
    }

    inserted.push(...(data || []));
  }

  return {
    success: true,
    contacts: inserted,
    warnings: built.warnings,
    metrics: {
      imported: inserted.length,
      skippedDuplicates,
      skippedIncomplete: built.skippedIncomplete,
      previewCount: built.createCount,
    },
  };
}
