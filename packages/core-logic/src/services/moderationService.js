/**
 * Moderation Service
 * Handles content reporting, user blocking, and Terms of Service
 */

async function fetchReportUsersById(supabase, userIds) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (!uniqueIds.length) return {};

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, contact_id')
    .in('id', uniqueIds);

  if (profilesError) throw profilesError;
  if (!profiles?.length) return {};

  const contactIds = [...new Set(profiles.map((profile) => profile.contact_id).filter(Boolean))];
  const contactMap = {};

  if (contactIds.length) {
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, name, email')
      .in('id', contactIds);

    if (contactsError) throw contactsError;
    (contacts || []).forEach((contact) => {
      contactMap[contact.id] = contact;
    });
  }

  const userMap = {};
  profiles.forEach((profile) => {
    const contact = profile.contact_id ? contactMap[profile.contact_id] : null;
    userMap[profile.id] = {
      id: profile.id,
      email: contact?.email || null,
      name: contact?.name || null,
    };
  });

  return userMap;
}

/**
 * Report content (message, profile, etc.)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} reportData - Report data
 * @param {string} reportData.contentType - Type of content ('message', 'profile', etc.)
 * @param {string} reportData.contentId - ID of the content being reported
 * @param {string} reportData.reportedUserId - ID of the user who created the content
 * @param {string} reportData.reason - Reason for report ('spam', 'harassment', etc.)
 * @param {string} reportData.description - Optional description
 * @param {string} reportData.reportedByUserId - ID of the user making the report
 * @returns {Promise<Object>} Created report
 */
export async function reportContent(supabase, reportData) {
  const { data, error } = await supabase
    .from('content_reports')
    .insert({
      reported_by_user_id: reportData.reportedByUserId,
      content_type: reportData.contentType,
      content_id: reportData.contentId,
      reported_user_id: reportData.reportedUserId,
      reason: reportData.reason,
      description: reportData.description || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Get all reports (Admin only)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} options - Query options
 * @param {string} options.status - Filter by status
 * @param {number} options.limit - Limit results
 * @param {number} options.offset - Offset for pagination
 * @returns {Promise<Array>} Array of reports
 */
export async function getContentReports(supabase, options = {}) {
  let query = supabase
    .from('content_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;

  const reports = data || [];
  const userIds = reports.flatMap((report) => [
    report.reported_by_user_id,
    report.reported_user_id,
    report.reviewed_by_user_id,
  ]);
  const userMap = await fetchReportUsersById(supabase, userIds);

  return reports.map((report) => ({
    ...report,
    reported_by: userMap[report.reported_by_user_id] || null,
    reported_user: report.reported_user_id ? userMap[report.reported_user_id] || null : null,
    reviewed_by: report.reviewed_by_user_id ? userMap[report.reviewed_by_user_id] || null : null,
  }));
}

/**
 * Update report status (Admin only)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} reportId - Report ID
 * @param {Object} updateData - Update data
 * @param {string} updateData.status - New status
 * @param {string} updateData.resolutionNotes - Resolution notes
 * @param {string} updateData.reviewedByUserId - ID of admin reviewing
 * @returns {Promise<Object>} Updated report
 */
export async function updateReportStatus(supabase, reportId, updateData) {
  const update = {
    status: updateData.status,
    resolution_notes: updateData.resolutionNotes || null,
    reviewed_by_user_id: updateData.reviewedByUserId || null,
    reviewed_at: updateData.status !== 'pending' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('content_reports')
    .update(update)
    .eq('id', reportId)
    .select('*')
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Block a user
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} blockerUserId - ID of user doing the blocking
 * @param {string} blockedUserId - ID of user being blocked
 * @returns {Promise<Object>} Created block record
 */
export async function blockUser(supabase, blockerUserId, blockedUserId) {
  if (blockerUserId === blockedUserId) {
    throw new Error('Cannot block yourself');
  }

  const { data, error } = await supabase
    .from('blocked_users')
    .insert({
      blocker_user_id: blockerUserId,
      blocked_user_id: blockedUserId,
      created_at: new Date().toISOString()
    })
    .select('*')
    .single();
  
  if (error) {
    // If already blocked, return existing record
    if (error.code === '23505') { // Unique violation
      const { data: existing } = await supabase
        .from('blocked_users')
        .select('*')
        .eq('blocker_user_id', blockerUserId)
        .eq('blocked_user_id', blockedUserId)
        .single();
      return existing;
    }
    throw error;
  }
  return data;
}

/**
 * Unblock a user
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} blockerUserId - ID of user doing the unblocking
 * @param {string} blockedUserId - ID of user being unblocked
 * @returns {Promise<boolean>} Success status
 */
export async function unblockUser(supabase, blockerUserId, blockedUserId) {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_user_id', blockerUserId)
    .eq('blocked_user_id', blockedUserId);
  
  if (error) throw error;
  return true;
}

/**
 * Get list of blocked users for a user
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - ID of user
 * @returns {Promise<Array>} Array of blocked user IDs
 */
export async function getBlockedUsers(supabase, userId) {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_user_id')
    .eq('blocker_user_id', userId);
  
  if (error) throw error;
  return (data || []).map(item => item.blocked_user_id);
}

/**
 * Check if a user is blocked by another user
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} blockerUserId - ID of potential blocker
 * @param {string} blockedUserId - ID of potential blocked user
 * @returns {Promise<boolean>} True if blocked
 */
export async function isUserBlocked(supabase, blockerUserId, blockedUserId) {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('blocker_user_id', blockerUserId)
    .eq('blocked_user_id', blockedUserId)
    .maybeSingle();
  
  if (error) throw error;
  return !!data;
}

/**
 * Filter messages to exclude those from blocked users
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - ID of user viewing messages
 * @param {Array} messages - Array of messages
 * @returns {Promise<Array>} Filtered messages
 */
export async function filterBlockedMessages(supabase, userId, messages) {
  if (!messages || messages.length === 0) return messages;
  
  const blockedUserIds = await getBlockedUsers(supabase, userId);
  if (blockedUserIds.length === 0) return messages;
  
  const blockedSet = new Set(blockedUserIds);
  return messages.filter(msg => !blockedSet.has(msg.user_id));
}

/**
 * Accept Terms of Service
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - ID of user
 * @param {string} version - ToS version
 * @param {Object} options - Additional options
 * @param {string} options.ipAddress - User's IP address
 * @param {string} options.userAgent - User's user agent
 * @returns {Promise<Object>} Created acceptance record
 */
export async function acceptTermsOfService(supabase, userId, version, options = {}) {
  const { data, error } = await supabase
    .from('terms_of_service_acceptances')
    .insert({
      user_id: userId,
      version: version,
      accepted_at: new Date().toISOString(),
      ip_address: options.ipAddress || null,
      user_agent: options.userAgent || null
    })
    .select('*')
    .single();
  
  if (error) {
    // If already accepted, return existing record
    if (error.code === '23505') { // Unique violation
      const { data: existing } = await supabase
        .from('terms_of_service_acceptances')
        .select('*')
        .eq('user_id', userId)
        .eq('version', version)
        .single();
      return existing;
    }
    throw error;
  }
  return data;
}

/**
 * Check if user has accepted Terms of Service
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - ID of user
 * @param {string} version - ToS version to check
 * @returns {Promise<boolean>} True if accepted
 */
export async function hasAcceptedTermsOfService(supabase, userId, version) {
  const { data, error } = await supabase
    .from('terms_of_service_acceptances')
    .select('id')
    .eq('user_id', userId)
    .eq('version', version)
    .maybeSingle();
  
  if (error) throw error;
  return !!data;
}

/**
 * Get latest Terms of Service acceptance for a user
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - ID of user
 * @returns {Promise<Object|null>} Latest acceptance record or null
 */
export async function getLatestTermsAcceptance(supabase, userId) {
  const { data, error } = await supabase
    .from('terms_of_service_acceptances')
    .select('*')
    .eq('user_id', userId)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

