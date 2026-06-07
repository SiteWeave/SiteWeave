/**
 * Shared transactional email layout, compliance footer, and Resend sender.
 * All product email should use this for consistent design + deliverability metadata.
 */

export const SITEWEAVE_PHYSICAL_ADDRESS = '2965 Hero Way Ste 100, Leander, TX 78641'
export const SITEWEAVE_LOGO_URL = 'https://app.siteweave.org/logo.svg'
export const SITEWEAVE_SITE_URL = 'https://siteweave.org'
export const SITEWEAVE_CONTACT_URL = 'https://www.siteweave.org/#contact'

function formatTaskDueDateForEmail(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null
  const trimmed = iso.trim()
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (ymd) {
    const y = Number(ymd[1])
    const mo = Number(ymd[2])
    const d = Number(ymd[3])
    if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null
    const dt = new Date(Date.UTC(y, mo - 1, d))
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
export const SITEWEAVE_SUPPORT_EMAIL = 'support@siteweave.org'

export const RESEND_FROM_DEFAULT = 'SiteWeave <notifications@siteweave.org>'

export function getResendFrom(): string {
  return Deno.env.get('RESEND_FROM') ?? RESEND_FROM_DEFAULT
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function buildComplianceFooterHtml(): string {
  return `
    <div style="background:#f9fafb;padding:24px 32px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6;">
        <a href="${SITEWEAVE_SITE_URL}" style="color:#4b5563;text-decoration:none;">siteweave.org</a>
      </p>
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
        © ${new Date().getFullYear()} SiteWeave. All rights reserved.<br>
        ${escapeHtml(SITEWEAVE_PHYSICAL_ADDRESS)}
      </p>
    </div>`
}

export function buildComplianceFooterText(): string {
  return [
    '---',
    `© ${new Date().getFullYear()} SiteWeave. All rights reserved.`,
    SITEWEAVE_PHYSICAL_ADDRESS,
    SITEWEAVE_SITE_URL,
  ].join('\n')
}

export type TransactionalShellParams = {
  /** Document title / preheader context */
  title: string
  /** Optional visible headline (h1) */
  headline?: string | null
  /** Main body HTML (already escaped where needed) */
  bodyHtml: string
  /** Optional preheader hidden text for inbox preview */
  preheader?: string | null
}

export function buildTransactionalShell(params: TransactionalShellParams): string {
  const { title, headline, bodyHtml, preheader } = params
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : ''
  const headlineBlock = headline
    ? `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:#111827;letter-spacing:-0.02em;">${escapeHtml(headline)}</h1>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;-webkit-font-smoothing:antialiased;">
  ${preheaderBlock}
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #e5e7eb;">
              <img src="${SITEWEAVE_LOGO_URL}" alt="SiteWeave" width="96" height="96" style="display:block;width:96px;height:auto;margin:0 auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${headlineBlock}
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              ${buildComplianceFooterHtml()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildPrimaryCtaHtml(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0;border-collapse:collapse;">
      <tr>
        <td style="border-radius:6px;background:#111827;">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:500;color:#ffffff !important;text-decoration:none;letter-spacing:-0.01em;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`
}

export function buildLinkFallbackHtml(url: string): string {
  return `
    <div style="margin-top:24px;padding-top:24px;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Button not working? Copy and paste this link into your browser:</p>
      <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;">
        <a href="${escapeHtml(url)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(url)}</a>
      </p>
    </div>`
}

export type SendTransactionalEmailParams = {
  to: string | string[]
  subject: string
  html: string
  text: string
  replyTo?: string | null
  tags?: Array<{ name: string; value: string }>
}

export type SendTransactionalEmailResult =
  | { success: true; id?: string }
  | { success: false; error: string; status?: number }

export async function sendTransactionalEmail(
  params: SendTransactionalEmailParams,
): Promise<SendTransactionalEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.log('[transactional-email] RESEND_API_KEY not set; would send:', params.subject, 'to', params.to)
    return { success: true, id: 'dry-run' }
  }

  const toArray = (Array.isArray(params.to) ? params.to : [params.to]).map((e) => e.trim().toLowerCase())
  const body: Record<string, unknown> = {
    from: getResendFrom(),
    to: toArray,
    subject: params.subject,
    html: params.html,
    text: params.text,
    tags: params.tags ?? [{ name: 'category', value: 'transactional' }],
  }
  if (params.replyTo?.trim()) {
    body.reply_to = params.replyTo.trim()
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text()
    return { success: false, error: errText.slice(0, 500), status: response.status }
  }

  const data = await response.json()
  return { success: true, id: data.id }
}

/** Team / org invitation email content */
export function buildTeamInviteEmail(params: {
  inviterName: string
  organizationName: string
  setupUrl: string
  greeting?: string
}): { subject: string; html: string; text: string } {
  const { inviterName, organizationName, setupUrl } = params
  const greeting = params.greeting ?? 'Hi there,'
  const subject = `${inviterName} invited you to ${organizationName}`

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#374151;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
      <strong style="color:#111827;">${escapeHtml(inviterName)}</strong> invited you to collaborate with
      <strong style="color:#111827;">${escapeHtml(organizationName)}</strong> on SiteWeave.
    </p>
    <p style="margin:0;font-size:16px;line-height:1.6;color:#4b5563;">Accept your invitation to get started:</p>
    ${buildPrimaryCtaHtml('Accept invitation', setupUrl)}
    ${buildLinkFallbackHtml(setupUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;text-align:center;">This invitation expires in 7 days.</p>`

  const html = buildTransactionalShell({
    title: subject,
    headline: `Invitation to ${organizationName}`,
    bodyHtml,
    preheader: `${inviterName} invited you to ${organizationName} on SiteWeave.`,
  })

  const text = [
    greeting,
    '',
    `${inviterName} invited you to collaborate with ${organizationName} on SiteWeave.`,
    '',
    `Accept your invitation: ${setupUrl}`,
    '',
    'This invitation expires in 7 days.',
    '',
    buildComplianceFooterText(),
  ].join('\n')

  return { subject, html, text }
}

/** External / project invitation for new users */
export function buildProjectInviteEmail(params: {
  inviterName: string
  projectName: string
  invitationUrl: string
}): { subject: string; html: string; text: string } {
  const { inviterName, projectName, invitationUrl } = params
  const subject = `${inviterName} invited you to ${projectName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
      <strong style="color:#111827;">${escapeHtml(inviterName)}</strong> invited you to collaborate on
      <strong style="color:#111827;">${escapeHtml(projectName)}</strong> on SiteWeave.
    </p>
    <p style="margin:0;font-size:16px;line-height:1.6;color:#4b5563;">Create your account to accept the invitation:</p>
    ${buildPrimaryCtaHtml('Accept invitation', invitationUrl)}
    ${buildLinkFallbackHtml(invitationUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;text-align:center;">This invitation expires in 7 days.</p>`

  const html = buildTransactionalShell({
    title: subject,
    headline: projectName,
    bodyHtml,
    preheader: `${inviterName} invited you to ${projectName}.`,
  })

  const text = [
    `${inviterName} invited you to collaborate on ${projectName} on SiteWeave.`,
    '',
    `Accept your invitation: ${invitationUrl}`,
    '',
    'This invitation expires in 7 days.',
    '',
    buildComplianceFooterText(),
  ].join('\n')

  return { subject, html, text }
}

/** Existing org member added to a project */
export function buildAddedToProjectEmail(params: {
  inviterName: string
  projectName: string
  organizationName: string
  projectInviteUrl: string
  inviteShortCode?: string | null
}): { subject: string; html: string; text: string } {
  const { inviterName, projectName, organizationName, projectInviteUrl, inviteShortCode } = params
  const subject = `${inviterName} added you to ${projectName}`

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151;">
      <strong style="color:#111827;">${escapeHtml(inviterName)}</strong> added you to
      <strong style="color:#111827;">${escapeHtml(projectName)}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:8px;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 10px;font-size:12px;color:#6b7280;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;">Project</p>
          <p style="margin:0;font-size:17px;font-weight:600;color:#111827;">${escapeHtml(projectName)}</p>
        </td>
      </tr>
    </table>
    ${buildPrimaryCtaHtml('Open project', projectInviteUrl)}
    ${inviteShortCode ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;text-align:center;">Or sign in and enter code: <strong>${escapeHtml(inviteShortCode)}</strong></p>` : ''}
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">You received this because you are a member of ${escapeHtml(organizationName)}.</p>`

  const html = buildTransactionalShell({
    title: subject,
    headline: `Added to ${projectName}`,
    bodyHtml,
    preheader: `${inviterName} added you to ${projectName}.`,
  })

  const textLines = [
    `${inviterName} added you to ${projectName}.`,
    '',
    `Project: ${projectName}`,
    '',
    `Open project: ${projectInviteUrl}`,
  ]
  if (inviteShortCode) textLines.push(`Or enter code: ${inviteShortCode}`)
  textLines.push('', `You received this because you are a member of ${organizationName}.`, '', buildComplianceFooterText())

  return { subject, html, text: textLines.join('\n') }
}

/** External contact task assignment notification */
export function buildTaskAssignmentEmail(params: {
  assignerName: string
  projectName: string
  taskTitle: string
  projectAddress?: string | null
  issueTitle?: string | null
  dueDate?: string | null
  taskLabel?: string
}): { subject: string; html: string; text: string } {
  const { assignerName, projectName, taskTitle, projectAddress, issueTitle } = params
  const taskLabel = params.taskLabel ?? (issueTitle ? 'Step' : 'Task')
  const dueFormatted = formatTaskDueDateForEmail(params.dueDate)
  const subject = `New task assignment: ${taskTitle || 'Task'}`

  const issueRow = issueTitle
    ? `<p style="margin:0 0 10px;font-size:12px;color:#6b7280;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;">Issue</p>
       <p style="margin:0 0 14px;font-size:15px;color:#111827;">${escapeHtml(issueTitle)}</p>`
    : ''

  const dueRow = dueFormatted
    ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#6b7280;font-weight:500;">Due date</p>
        <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1e40af;">${escapeHtml(dueFormatted)}</p>
      </div>`
    : ''

  const locationBlock = projectAddress?.trim()
    ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Location: <span style="color:#111827;">${escapeHtml(projectAddress.trim())}</span></p>`
    : ''

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
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Questions? Reply to this email or contact ${escapeHtml(assignerName)}.</p>`

  const html = buildTransactionalShell({
    title: subject,
    headline: 'New task assignment',
    bodyHtml,
    preheader: `${assignerName} assigned you a task on ${projectName}.`,
  })

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
  ].filter(Boolean) as string[]

  return { subject, html, text: textLines.join('\n') }
}

/** Org owner welcome / setup */
export function buildOrgWelcomeEmail(params: {
  companyName: string
  setupUrl: string
}): { subject: string; html: string; text: string } {
  const { companyName, setupUrl } = params
  const subject = `Welcome to SiteWeave — ${companyName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
      Your organization <strong style="color:#111827;">${escapeHtml(companyName)}</strong> is ready on SiteWeave.
    </p>
    <p style="margin:0;font-size:16px;line-height:1.6;color:#4b5563;">Set your password and sign in to get started:</p>
    ${buildPrimaryCtaHtml('Set up your account', setupUrl)}
    ${buildLinkFallbackHtml(setupUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;text-align:center;">This link expires in 7 days.</p>`

  const html = buildTransactionalShell({
    title: subject,
    headline: `Welcome to SiteWeave`,
    bodyHtml,
    preheader: `Set up ${companyName} on SiteWeave.`,
  })

  const text = [
    `Welcome to SiteWeave!`,
    '',
    `Your organization ${companyName} has been created.`,
    '',
    `Set up your account: ${setupUrl}`,
    '',
    'This link expires in 7 days.',
    '',
    buildComplianceFooterText(),
  ].join('\n')

  return { subject, html, text }
}
