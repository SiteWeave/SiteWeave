/**
 * Progress Report Service
 * Handles all progress report-related database operations and scheduling logic
 */

import {
  calculateNextSendDate,
  calculateFirstSendDate,
  getOrgProgressReportScheduleSettings,
  resolveScheduleNextSendAt,
  resolveScheduleSendSettings,
} from '../utils/progressReportScheduleTime.js';

export {
  calculateNextSendDate,
  calculateFirstSendDate,
  resolveScheduleNextSendAt,
  resolveScheduleSendSettings,
  formatTimezoneLabel,
  formatSendHourLabel,
  formatScheduleNextSendAt,
} from '../utils/progressReportScheduleTime.js';

/**
 * @param {import('@supabase/supabase-js').FunctionsHttpError | Error | null} error
 * @returns {string}
 */
function messageFromFunctionsError(error) {
  if (!error) return 'Unknown error';
  const base = error.message || String(error);
  const body = error.context?.body;
  if (!body) return base;
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    if (parsed && typeof parsed.error === 'string') {
      let msg = parsed.error;
      if (parsed.details != null) {
        const detailStr =
          typeof parsed.details === 'string' ? parsed.details : JSON.stringify(parsed.details);
        if (detailStr && detailStr !== '{}') msg += ` (${detailStr})`;
      }
      return msg;
    }
    if (parsed && typeof parsed.message === 'string') return parsed.message;
  } catch {
    /* ignore */
  }
  return base;
}

/**
 * Fresh access token for Edge Function calls (explicit header helps Electron / some clients).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Record<string, string>>}
 */
async function invokeAuthHeaders(supabase) {
  let { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('You must be signed in to use this feature.');
  }
  const expMs = (session.expires_at ?? 0) * 1000;
  if (expMs < Date.now() + 30_000) {
    const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
    if (refErr || !refreshed.session?.access_token) {
      throw new Error('Session expired. Please sign in again.');
    }
    session = refreshed.session;
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} schedule
 * @param {{ preserveFutureNext?: boolean, existingNextSendAt?: string|null }} [options]
 * @returns {Promise<string|null>}
 */
async function computeNextSendAtIso(supabase, schedule, options = {}) {
  const organizationId = schedule.organization_id;
  if (!organizationId) return null;

  const { preserveFutureNext, existingNextSendAt } = options;
  if (
    preserveFutureNext &&
    existingNextSendAt &&
    new Date(existingNextSendAt) > new Date() &&
    schedule.is_active &&
    schedule.frequency !== 'manual'
  ) {
    return existingNextSendAt;
  }

  const orgFallback = await getOrgProgressReportScheduleSettings(supabase, organizationId);
  const { sendHour, timeZone } = resolveScheduleSendSettings(schedule, orgFallback);
  let next = resolveScheduleNextSendAt({
    frequency: schedule.frequency,
    frequency_value: schedule.frequency_value,
    last_sent_at: schedule.last_sent_at ?? null,
    is_active: Boolean(schedule.is_active),
    sendHour,
    timeZone,
  });
  if (next && next <= new Date()) {
    next = calculateFirstSendDate(
      schedule.frequency,
      schedule.frequency_value,
      sendHour,
      timeZone
    );
  }
  return next ? next.toISOString() : null;
}

/**
 * Create a new progress report schedule
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} scheduleData - Schedule configuration
 * @returns {Promise<Object>} Created schedule
 */
export async function createProgressReportSchedule(supabase, scheduleData) {
  const orgFallback = scheduleData.organization_id
    ? await getOrgProgressReportScheduleSettings(supabase, scheduleData.organization_id)
    : null;
  const { sendHour, timeZone } = resolveScheduleSendSettings(scheduleData, orgFallback);
  const payload = {
    ...scheduleData,
    send_hour: scheduleData.send_hour ?? sendHour,
    send_timezone: scheduleData.send_timezone ?? timeZone,
  };
  const next_send_at = await computeNextSendAtIso(supabase, payload);
  const { data, error } = await supabase
    .from('progress_report_schedules')
    .insert({
      ...payload,
      next_send_at,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Update a progress report schedule
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated schedule
 */
export async function updateProgressReportSchedule(supabase, scheduleId, updates) {
  const { data: existing, error: fetchError } = await supabase
    .from('progress_report_schedules')
    .select('organization_id, frequency, frequency_value, last_sent_at, is_active, next_send_at, send_hour, send_timezone')
    .eq('id', scheduleId)
    .single();
  if (fetchError) throw fetchError;

  const merged = {
    organization_id: updates.organization_id ?? existing.organization_id,
    frequency: updates.frequency ?? existing.frequency,
    frequency_value:
      updates.frequency_value !== undefined ? updates.frequency_value : existing.frequency_value,
    last_sent_at: updates.last_sent_at !== undefined ? updates.last_sent_at : existing.last_sent_at,
    is_active: updates.is_active !== undefined ? updates.is_active : existing.is_active,
    send_hour: updates.send_hour !== undefined ? updates.send_hour : existing.send_hour,
    send_timezone: updates.send_timezone !== undefined ? updates.send_timezone : existing.send_timezone,
  };
  const scheduleTimingUnchanged =
    (updates.frequency === undefined || updates.frequency === existing.frequency) &&
    (updates.frequency_value === undefined || updates.frequency_value === existing.frequency_value) &&
    (updates.is_active === undefined || updates.is_active === existing.is_active) &&
    (updates.send_hour === undefined || updates.send_hour === existing.send_hour) &&
    (updates.send_timezone === undefined || updates.send_timezone === existing.send_timezone);
  const next_send_at = await computeNextSendAtIso(supabase, merged, {
    preserveFutureNext: scheduleTimingUnchanged,
    existingNextSendAt: existing.next_send_at,
  });

  const { data, error } = await supabase
    .from('progress_report_schedules')
    .update({
      ...updates,
      next_send_at,
      updated_at: new Date().toISOString()
    })
    .eq('id', scheduleId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Delete a progress report schedule
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @returns {Promise<void>}
 */
export async function deleteProgressReportSchedule(supabase, scheduleId) {
  const { error } = await supabase
    .from('progress_report_schedules')
    .delete()
    .eq('id', scheduleId);
  
  if (error) throw error;
}

/**
 * Get progress report schedules
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} organizationId - Organization ID
 * @param {string|null} projectId - Optional project ID to filter by
 * @returns {Promise<Array>} Array of schedules
 */
export async function getProgressReportSchedules(supabase, organizationId, projectId = null) {
  let query = supabase
    .from('progress_report_schedules')
    .select(`
      *,
      progress_report_recipients(*)
    `)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  
  if (projectId) {
    query = query.eq('project_id', projectId);
  } else {
    query = query.is('project_id', null);
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  return data || [];
}

/**
 * Get progress report schedules for a single project only (project details view).
 * Reports are scoped to this project's tasks, status, and phases.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @param {string} projectId
 * @returns {Promise<Array>}
 */
export async function getProjectProgressReportSchedules(supabase, organizationId, projectId) {
  return getProgressReportSchedules(supabase, organizationId, projectId);
}

/**
 * Get organization-wide progress report schedules (dashboard view).
 * These schedules are not tied to a specific project.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @returns {Promise<Array>}
 */
export async function getOrganizationProgressReportSchedules(supabase, organizationId) {
  return getProgressReportSchedules(supabase, organizationId, null);
}

/**
 * Get progress report history
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} Array of history records
 */
export async function getProgressReportHistory(supabase, scheduleId, limit = 50) {
  const { data, error } = await supabase
    .from('progress_report_history')
    .select('*')
    .eq('schedule_id', scheduleId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

/**
 * Add a recipient to a schedule
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @param {Object} recipientData - Recipient data {email, contact_id?, recipient_type, notes?}
 * @returns {Promise<Object>} Created recipient
 */
export async function addRecipient(supabase, scheduleId, recipientData) {
  const { data, error } = await supabase
    .from('progress_report_recipients')
    .insert({
      schedule_id: scheduleId,
      ...recipientData
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Remove a recipient from a schedule
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} recipientId - Recipient ID
 * @returns {Promise<void>}
 */
export async function removeRecipient(supabase, recipientId) {
  const { error } = await supabase
    .from('progress_report_recipients')
    .delete()
    .eq('id', recipientId);
  
  if (error) throw error;
}

/**
 * Update recipients for a schedule (replace all)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @param {Array} recipients - Array of recipient objects
 * @returns {Promise<Array>} Updated recipients
 */
export async function updateRecipients(supabase, scheduleId, recipients) {
  // NOTE: This uses delete-then-insert pattern. If insert fails after delete, data is lost.
  // TODO: Consider using a database RPC function with BEGIN/COMMIT transaction for atomicity.
  
  // Delete existing recipients
  const { error: deleteError } = await supabase
    .from('progress_report_recipients')
    .delete()
    .eq('schedule_id', scheduleId);
  if (deleteError) throw deleteError;
  
  // Insert new recipients (with duplicate prevention on client side)
  if (recipients.length > 0) {
    // Deduplicate by email/contact_id to prevent DB constraint violations
    const seen = new Set();
    const dedupedRecipients = recipients.filter((r) => {
      if (!r?.email) return false;
      const key = String(r.email || r.contact_id || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    const { data, error } = await supabase
      .from('progress_report_recipients')
      .insert(
        // IMPORTANT: Only insert columns that exist in the DB table.
        // UI-only fields like `contact_type` / `name` must NOT be inserted.
        dedupedRecipients.map((r) => ({
          schedule_id: scheduleId,
          contact_id: r.contact_id ?? null,
          email: r.email,
          recipient_type: r.recipient_type || 'to',
          is_active: r.is_active !== false,
          notes: r.notes ?? null
        }))
      )
      .select();
    
    if (error) throw error;
    return data || [];
  }
  
  return [];
}

/**
 * Request approval for a schedule
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @returns {Promise<Object>} Updated schedule
 */
export async function requestApproval(supabase, scheduleId) {
  return updateProgressReportSchedule(supabase, scheduleId, {
    approval_status: 'pending_review'
  });
}

/**
 * Approve a report schedule
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @param {string} approverId - User ID of approver
 * @returns {Promise<Object>} Updated schedule
 */
export async function approveReport(supabase, scheduleId, approverId) {
  return updateProgressReportSchedule(supabase, scheduleId, {
    approval_status: 'approved',
    approved_by_user_id: approverId,
    approved_at: new Date().toISOString()
  });
}

/**
 * Reject a report schedule
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @param {string} reason - Rejection reason
 * @returns {Promise<Object>} Updated schedule
 */
export async function rejectReport(supabase, scheduleId, reason) {
  // Fetch current schedule to preserve custom_message
  const { data: schedule } = await supabase
    .from('progress_report_schedules')
    .select('custom_message')
    .eq('id', scheduleId)
    .single();

  return updateProgressReportSchedule(supabase, scheduleId, {
    approval_status: 'rejected',
    custom_message: reason ? `${reason}\n\n${schedule?.custom_message || ''}` : schedule?.custom_message
  });
}

/**
 * Format frequency for display (e.g. "Weekly on Mondays", "Monthly on the 1st")
 * @param {string} frequency
 * @param {number|null} frequencyValue
 * @returns {string}
 */
export function formatFrequencyLabel(frequency, frequencyValue = null) {
  if (frequency === 'manual') return 'Manual only';
  if (frequency === 'custom') return 'Custom';
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (frequency === 'weekly') {
    const day = dayNames[frequencyValue != null && frequencyValue >= 0 && frequencyValue <= 6 ? frequencyValue : 0];
    return `Weekly on ${day}s`;
  }
  if (frequency === 'bi-weekly') {
    const day = dayNames[frequencyValue != null && frequencyValue >= 0 && frequencyValue <= 6 ? frequencyValue : 0];
    return `Bi-weekly on ${day}s`;
  }
  if (frequency === 'monthly') {
    if (frequencyValue === 15) return 'Monthly on the 15th';
    if (frequencyValue === -1 || frequencyValue === 31) return 'Monthly on the last day';
    return 'Monthly on the 1st';
  }
  return frequency;
}

/**
 * Test send a progress report (sends to creator only)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @param {string} testEmail - Email address to send test to
 * @returns {Promise<Object>} Result from edge function
 */
export async function testSendProgressReport(supabase, scheduleId, testEmail) {
  const headers = await invokeAuthHeaders(supabase);
  const { data, error } = await supabase.functions.invoke('send-progress-report', {
    headers,
    body: {
      schedule_id: scheduleId,
      test_email: testEmail,
      is_test: true
    }
  });
  
  if (error) throw new Error(messageFromFunctionsError(error));
  return data;
}

/**
 * Send manual report immediately
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @returns {Promise<Object>} Result from edge function
 */
export async function sendManualReport(supabase, scheduleId) {
  const headers = await invokeAuthHeaders(supabase);
  const { data, error } = await supabase.functions.invoke('send-progress-report', {
    headers,
    body: {
      schedule_id: scheduleId,
      is_manual: true
    }
  });

  if (error) {
    throw new Error(messageFromFunctionsError(error));
  }

  return data;
}

/**
 * Export report to PDF
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} scheduleId - Schedule ID
 * @returns {Promise<string>} PDF URL or buffer
 */
export async function exportReportToPDF(supabase, scheduleId) {
  const headers = await invokeAuthHeaders(supabase);
  const { data, error } = await supabase.functions.invoke('export-progress-report-pdf', {
    headers,
    body: {
      schedule_id: scheduleId
    }
  });
  
  if (error) throw new Error(messageFromFunctionsError(error));
  return data;
}
