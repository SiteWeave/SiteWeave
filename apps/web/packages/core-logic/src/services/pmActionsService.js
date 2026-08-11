/**
 * Project PM Actions — optional notes (RFIs, submittals, long lead, change orders).
 */

import { localDateOnlyIso } from '../utils/dateOnly.js';

const NOTE_FIELDS = ['rfi_notes', 'long_lead_time_notes', 'change_orders_notes', 'submittals_notes'];

/**
 * @returns {string} YYYY-MM-DD in local calendar
 */
export function pmActionsTodayIso() {
  return localDateOnlyIso(new Date());
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {string} [asOfDate] YYYY-MM-DD — defaults to today (local)
 * @returns {Promise<object|null>}
 */
export async function getPmActionsForDate(supabase, projectId, asOfDate) {
  const day = asOfDate || pmActionsTodayIso();
  const { data, error } = await supabase
    .from('project_pm_actions')
    .select('*')
    .eq('project_id', projectId)
    .eq('as_of_date', day)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Latest PM Actions row for a project (any date).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @returns {Promise<object|null>}
 */
export async function getLatestPmActions(supabase, projectId) {
  const { data, error } = await supabase
    .from('project_pm_actions')
    .select('*')
    .eq('project_id', projectId)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * History of PM Actions for a project (newest first).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function listPmActionsForProject(supabase, projectId, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(200, opts.limit)) : 50;
  const { data, error } = await supabase
    .from('project_pm_actions')
    .select('*')
    .eq('project_id', projectId)
    .order('as_of_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * Upsert PM Actions for a project + as_of_date.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} row
 * @returns {Promise<object>}
 */
export async function upsertPmActions(supabase, row) {
  const payload = {
    ...row,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('project_pm_actions')
    .upsert(payload, { onConflict: 'project_id,as_of_date' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Delete a PM Actions row by id.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deletePmActions(supabase, id) {
  if (!id) throw new Error('id required');
  const { error } = await supabase.from('project_pm_actions').delete().eq('id', id);
  if (error) throw error;
}

/**
 * List PM Actions in a date window for one or more projects.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ projectIds: string[], startDate?: string|null, endDate?: string|null, organizationId?: string|null }} opts
 * @returns {Promise<object[]>}
 */
export async function listPmActionsInWindow(supabase, opts) {
  const { projectIds, startDate, endDate, organizationId } = opts || {};
  if (!projectIds?.length) return [];

  let query = supabase
    .from('project_pm_actions')
    .select('*')
    .in('project_id', projectIds)
    .order('as_of_date', { ascending: false });

  if (organizationId) query = query.eq('organization_id', organizationId);
  if (startDate) query = query.gte('as_of_date', String(startDate).slice(0, 10));
  if (endDate) query = query.lte('as_of_date', String(endDate).slice(0, 10));

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Merge multiple PM Actions rows into one notes object (latest non-empty wins per field).
 * @param {object[]} rows
 * @returns {{ rfi_notes: string, long_lead_time_notes: string, change_orders_notes: string, submittals_notes: string } | null}
 */
export function mergePmActionsNotes(rows) {
  if (!rows?.length) return null;
  const out = {
    rfi_notes: '',
    long_lead_time_notes: '',
    change_orders_notes: '',
    submittals_notes: '',
  };
  // rows are newest-first
  for (const field of NOTE_FIELDS) {
    for (const row of rows) {
      const v = String(row?.[field] || '').trim();
      if (v) {
        out[field] = v;
        break;
      }
    }
  }
  const hasAny = NOTE_FIELDS.some((f) => out[f]);
  return hasAny ? out : null;
}

/**
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function pmActionsRowHasContent(row) {
  if (!row) return false;
  return NOTE_FIELDS.some((f) => String(row[f] || '').trim());
}
