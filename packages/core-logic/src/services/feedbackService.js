import { buildComplianceFooterText } from '../email/transactionalEmailLayout.js';

export const FEEDBACK_RECIPIENT = 'chris@siteweave.org';

/**
 * User feedback — email-only delivery via send-email edge function.
 */

const FEEDBACK_TYPE_LABELS = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  general: 'General Feedback',
};

function getFeedbackTypeLabel(feedbackType) {
  return FEEDBACK_TYPE_LABELS[feedbackType] ?? 'General Feedback';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} params
 * @param {Object} params.user - Auth user
 * @param {'bug'|'feature'|'general'} params.feedbackType
 * @param {string} params.subject
 * @param {string} params.message
 * @param {string} params.appVersion
 * @param {'web'|'electron'|'mobile'} params.platform
 */
export async function submitUserFeedback(supabase, {
  user,
  feedbackType,
  subject,
  message,
  appVersion,
  platform,
}) {
  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();

  if (!trimmedSubject || !trimmedMessage) {
    throw new Error('Please fill in both subject and message');
  }

  const feedbackTypeLabel = getFeedbackTypeLabel(feedbackType);
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown';
  const userEmail = user?.email || 'Unknown';
  const userIdShort = user?.id ? `${user.id.slice(0, 8)}...` : 'N/A';

  const safeSubject = escapeHtml(trimmedSubject);
  const safeMessage = escapeHtml(trimmedMessage);
  const safeUserName = escapeHtml(userName);
  const safeUserEmail = escapeHtml(userEmail);

  const emailHtml = `
    <h2>New ${feedbackTypeLabel} from SiteWeave</h2>
    <p><strong>Type:</strong> ${feedbackTypeLabel}</p>
    <p><strong>From:</strong> ${safeUserName} (${safeUserEmail})</p>
    <p><strong>Subject:</strong> ${safeSubject}</p>
    <p><strong>Message:</strong></p>
    <p style="white-space: pre-wrap;">${safeMessage}</p>
    <hr>
    <p style="font-size: 12px; color: #666;">
      Platform: ${escapeHtml(platform)}<br>
      App Version: ${escapeHtml(appVersion)}<br>
      User ID: ${escapeHtml(userIdShort)}
    </p>
  `;

  const emailText = [
    feedbackTypeLabel,
    '',
    `From: ${userName} (${userEmail})`,
    `Platform: ${platform}`,
    `App Version: ${appVersion}`,
    `User ID: ${userIdShort}`,
    `Subject: ${trimmedSubject}`,
    '',
    trimmedMessage,
    '',
    buildComplianceFooterText(),
  ].join('\n');

  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      to: FEEDBACK_RECIPIENT,
      subject: `[SiteWeave ${feedbackTypeLabel}] ${trimmedSubject}`,
      html: emailHtml,
      text: emailText,
    },
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}
