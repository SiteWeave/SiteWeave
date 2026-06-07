/**
 * Client-side transactional email layout (mirrors edge transactionalEmailLayout.ts).
 */

export const SITEWEAVE_PHYSICAL_ADDRESS = '2965 Hero Way Ste 100, Leander, TX 78641';
export const SITEWEAVE_LOGO_URL = 'https://app.siteweave.org/logo.svg';
export const SITEWEAVE_SITE_URL = 'https://siteweave.org';
export const SITEWEAVE_CONTACT_URL = 'https://www.siteweave.org/#contact';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildComplianceFooterHtml() {
  const year = new Date().getFullYear();
  return `
    <div style="background:#f9fafb;padding:24px 32px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6;">
        <a href="${SITEWEAVE_SITE_URL}" style="color:#4b5563;text-decoration:none;">siteweave.org</a>
      </p>
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
        © ${year} SiteWeave. All rights reserved.<br>
        ${escapeHtml(SITEWEAVE_PHYSICAL_ADDRESS)}
      </p>
    </div>`;
}

export function buildComplianceFooterText() {
  const year = new Date().getFullYear();
  return [
    '---',
    `© ${year} SiteWeave. All rights reserved.`,
    SITEWEAVE_PHYSICAL_ADDRESS,
    SITEWEAVE_SITE_URL,
  ].join('\n');
}

export function buildPrimaryCtaHtml(label, href) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0;border-collapse:collapse;">
      <tr>
        <td style="border-radius:6px;background:#111827;">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:500;color:#ffffff !important;text-decoration:none;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

export function buildLinkFallbackHtml(url) {
  return `
    <div style="margin-top:24px;padding-top:24px;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Button not working? Copy and paste this link:</p>
      <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;">
        <a href="${escapeHtml(url)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(url)}</a>
      </p>
    </div>`;
}

/**
 * @param {{ title: string, headline?: string|null, bodyHtml: string, preheader?: string|null }} params
 */
export function buildTransactionalShell(params) {
  const { title, headline, bodyHtml, preheader } = params;
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>`
    : '';
  const headlineBlock = headline
    ? `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:#111827;">${escapeHtml(headline)}</h1>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  ${preheaderBlock}
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #e5e7eb;">
              <img src="${SITEWEAVE_LOGO_URL}" alt="SiteWeave" width="96" style="display:block;width:96px;height:auto;margin:0 auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${headlineBlock}
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0;">${buildComplianceFooterHtml()}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function formatTaskDueDateForEmail(iso) {
  if (!iso) return null;
  const trimmed = String(iso).trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (ymd) {
    const y = Number(ymd[1]);
    const mo = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * @param {{ assignerName: string, projectName: string, taskTitle: string, projectAddress?: string|null, issueTitle?: string|null, dueDate?: string|null, taskLabel?: string }} params
 */
export function buildTaskAssignmentEmail(params) {
  const { assignerName, projectName, taskTitle, projectAddress, issueTitle } = params;
  const taskLabel = params.taskLabel ?? (issueTitle ? 'Step' : 'Task');
  const dueFormatted = formatTaskDueDateForEmail(params.dueDate);
  const subject = `New task assignment: ${taskTitle || 'Task'}`;

  const issueRow = issueTitle
    ? `<p style="margin:0 0 10px;font-size:12px;color:#6b7280;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;">Issue</p>
       <p style="margin:0 0 14px;font-size:15px;color:#111827;">${escapeHtml(issueTitle)}</p>`
    : '';

  const dueRow = dueFormatted
    ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#6b7280;font-weight:500;">Due date</p>
        <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1e40af;">${escapeHtml(dueFormatted)}</p>
      </div>`
    : '';

  const locationBlock = projectAddress?.trim()
    ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Location: <span style="color:#111827;">${escapeHtml(projectAddress.trim())}</span></p>`
    : '';

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151;">
      <strong style="color:#111827;">${escapeHtml(assignerName)}</strong> assigned you a task on
      <strong style="color:#111827;">${escapeHtml(projectName)}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
      <tr>
        <td style="padding:16px 18px;">
          ${issueRow}
          <p style="margin:0 0 6px;font-size:12px;color:#6b7280;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(taskLabel)}</p>
          <p style="margin:0;font-size:18px;font-weight:600;color:#111827;line-height:1.35;">${escapeHtml(taskTitle || 'Task')}</p>
          ${dueRow}
        </td>
      </tr>
    </table>
    ${locationBlock}
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Questions? Reply to this email or contact ${escapeHtml(assignerName)}.</p>`;

  const html = buildTransactionalShell({
    title: subject,
    headline: 'New task assignment',
    bodyHtml,
    preheader: `${assignerName} assigned you a task on ${projectName}.`,
  });

  const textLines = [
    `${assignerName} assigned you a task on the ${projectName} project.`,
    '',
    issueTitle ? `Issue: ${issueTitle}` : null,
    `${taskLabel}: ${taskTitle || 'Task'}`,
    dueFormatted ? `Due date: ${dueFormatted}` : null,
    projectAddress?.trim() ? `Location: ${projectAddress.trim()}` : null,
    '',
    `Questions? Contact ${assignerName}.`,
    '',
    buildComplianceFooterText(),
  ].filter(Boolean);

  return { subject, html, text: textLines.join('\n') };
}
