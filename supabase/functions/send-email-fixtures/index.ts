/**
 * Dev-only: send one email per template type for QA (service role / CRON_SECRET only).
 * POST { "to": "djpugst3r@gmail.com" }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import { requireCronOrServiceRole } from '../_shared/auth.ts'
import { buildMinimalDigestEmail, buildTrialReminderEmail } from '../_shared/notificationEmailTemplates.ts'
import { buildProgressReportEmail } from '../_shared/progressReportEmailTemplates.ts'
import {
  buildAddedToProjectEmail,
  buildOrgWelcomeEmail,
  buildProjectInviteEmail,
  buildTaskAssignmentEmail,
  buildTeamInviteEmail,
  buildTransactionalShell,
  buildPrimaryCtaHtml,
  buildComplianceFooterText,
  escapeHtml,
  sendTransactionalEmail,
  SITEWEAVE_CONTACT_URL,
} from '../_shared/transactionalEmailLayout.ts'

const DEFAULT_QA_TO = 'djpugst3r@gmail.com'
const QA_PREFIX = '[SiteWeave QA]'
const RESEND_PACE_MS = 250

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authDenied = requireCronOrServiceRole(req, corsHeaders)
  if (authDenied) return authDenied

  try {
    const body = await req.json().catch(() => ({}))
    const to = String(body?.to || DEFAULT_QA_TO).trim().toLowerCase()
    const onlyTypes = Array.isArray(body?.types)
      ? new Set(body.types.map((t: unknown) => String(t).trim()).filter(Boolean))
      : null
    if (!to.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid to address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const fixtureUrl = 'https://app.siteweave.org/?project=qa-fixture'
    const inviter = 'Alex Rivera'
    const orgName = 'Rivera Construction Co.'
    const projectName = 'Oak Street Remodel'

    type SendRow = { type: string; subject: string; success: boolean; id?: string; error?: string }
    const results: SendRow[] = []

    async function sendFixture(type: string, subject: string, html: string, text: string) {
      if (onlyTypes && !onlyTypes.has(type)) return
      const res = await sendTransactionalEmail({
        to,
        subject: `${QA_PREFIX} ${subject}`,
        html,
        text,
        replyTo: 'support@siteweave.org',
      })
      results.push({
        type,
        subject: `${QA_PREFIX} ${subject}`,
        success: res.success,
        id: res.success ? res.id : undefined,
        error: res.success ? undefined : res.error,
      })
      await sleep(RESEND_PACE_MS)
    }

    const teamInvite = buildTeamInviteEmail({
      inviterName: inviter,
      organizationName: orgName,
      setupUrl: fixtureUrl,
      greeting: 'Hi QA,',
    })
    await sendFixture('team_invite', teamInvite.subject, teamInvite.html, teamInvite.text)

    const projectInvite = buildProjectInviteEmail({
      inviterName: inviter,
      projectName,
      invitationUrl: fixtureUrl,
    })
    await sendFixture('project_invite', projectInvite.subject, projectInvite.html, projectInvite.text)

    const addedToProject = buildAddedToProjectEmail({
      inviterName: inviter,
      projectName,
      organizationName: orgName,
      projectInviteUrl: fixtureUrl,
      inviteShortCode: 'ABC123',
    })
    await sendFixture('added_to_project', addedToProject.subject, addedToProject.html, addedToProject.text)

    const taskAssignment = buildTaskAssignmentEmail({
      assignerName: inviter,
      projectName,
      taskTitle: 'Install kitchen cabinets',
      projectAddress: '123 Oak St, Austin, TX',
      dueDate: '2026-06-15',
    })
    await sendFixture('task_assignment', taskAssignment.subject, taskAssignment.html, taskAssignment.text)

    const digestSingle = buildMinimalDigestEmail({
      heading: `${projectName}: Task reminder`,
      subheading: 'Install kitchen cabinets',
      ctaUrl: fixtureUrl,
      reviewLinkText: 'Review this task in SiteWeave',
      summaryLabel: 'Reminder',
      summaryValue: 1,
      recipientName: 'QA',
      tasks: [{ title: 'Install kitchen cabinets', dueDateIso: '2026-06-10', startDateIso: '2026-06-06' }],
      projectName,
      projectAddress: '123 Oak St, Austin, TX',
      tasksSectionTitle: 'Task reminder',
      omitLeadBlock: true,
    })
    await sendFixture('manual_ping_digest', 'Reminder: Install kitchen cabinets', digestSingle.html, digestSingle.text)

    const digestBatch = buildMinimalDigestEmail({
      heading: `${projectName}: tasks assigned to you`,
      subheading: '3 items need attention',
      ctaUrl: fixtureUrl,
      reviewLinkText: 'Review your tasks in SiteWeave',
      summaryLabel: 'Due soon',
      summaryValue: 3,
      recipientName: 'QA',
      tasks: [
        { title: 'Rough-in plumbing', dueLabel: 'In 2 days', dueDateIso: '2026-06-08' },
        { title: 'Frame inspection', dueLabel: 'In 5 days', dueDateIso: '2026-06-11' },
        { title: 'Order cabinets', dueLabel: 'Today', dueDateIso: '2026-06-06' },
      ],
      projectName,
      tasksSectionTitle: 'Your tasks',
    })
    await sendFixture('task_start_batch', '3 updates for Oak Street Remodel', digestBatch.html, digestBatch.text)

    const dependencyUnlock = buildMinimalDigestEmail({
      heading: `${projectName}: task unlocked`,
      subheading: 'Install countertops is ready to start',
      ctaUrl: fixtureUrl,
      reviewLinkText: 'Review this task in SiteWeave',
      summaryLabel: 'Due soon',
      summaryValue: 1,
      recipientName: 'QA',
      tasks: [{ title: 'Install countertops', dueLabel: 'Ready', dueDateIso: '2026-06-15' }],
      footerText: 'Rough-in plumbing was completed by Alex Rivera.',
      projectName,
      tasksSectionTitle: 'Task',
    })
    await sendFixture('dependency_unlocked', 'Task unlocked: Install countertops', dependencyUnlock.html, dependencyUnlock.text)

    const trialMid = buildTrialReminderEmail({
      variant: 'mid',
      recipientName: 'QA',
      daysRemaining: 7,
      trialEndsAt: '2026-06-13T00:00:00.000Z',
      contactUrl: SITEWEAVE_CONTACT_URL,
      appUrl: 'https://app.siteweave.org',
    })
    await sendFixture('trial_mid', trialMid.subject, trialMid.html, trialMid.text)

    const trialFinal = buildTrialReminderEmail({
      variant: 'final',
      recipientName: 'QA',
      daysRemaining: 1,
      trialEndsAt: '2026-06-07T00:00:00.000Z',
      contactUrl: SITEWEAVE_CONTACT_URL,
      appUrl: 'https://app.siteweave.org',
    })
    await sendFixture('trial_final', trialFinal.subject, trialFinal.html, trialFinal.text)

    const mockReportData = {
      project_name: projectName,
      organization_name: orgName,
      start_date: '2026-05-30',
      end_date: '2026-06-06',
      vitals: { tasks_completed_count: 4, open_tasks_count: 12, project_end_date: '2026-08-01' },
      last_week_done: [{ text: 'Completed rough-in', phase_name: 'Phase 1' }],
      this_week_plan: [{ text: 'Install cabinets', start_date: '2026-06-09', phase_name: 'Phase 2' }],
      next_week_plan: [],
      blockers: [],
      next_steps: ['Schedule inspection'],
    }
    const mockSchedule = {
      report_audience_type: 'standard',
      custom_subject: null,
      custom_message: null,
      report_sections: {},
    }
    const mockBranding = { logo_url: null, primary_color: '#111827', secondary_color: '#10B981' }
    const standardReport = buildProgressReportEmail(mockReportData, mockReportData, mockSchedule, mockBranding)
    await sendFixture('progress_report_standard', standardReport.subject, standardReport.html, standardReport.text)

    const execReport = buildProgressReportEmail(
      { ...mockReportData, executive_summary: 'Project is on track overall.', at_a_glance: { on_track: 2, at_risk: 1, behind: 0 } },
      mockReportData,
      { ...mockSchedule, report_audience_type: 'executive' },
      mockBranding,
    )
    await sendFixture('progress_report_executive', execReport.subject, execReport.html, execReport.text)

    const calendarBody = `
      <p style="margin:0 0 16px;font-size:16px;color:#374151;"><strong>${escapeHtml(inviter)}</strong> scheduled <strong>Site walkthrough</strong>.</p>
      <p style="margin:0;font-size:15px;color:#4b5563;">June 10, 2026 · 9:00 AM – 10:00 AM · ${escapeHtml(projectName)}</p>
      ${buildPrimaryCtaHtml('View in SiteWeave', fixtureUrl)}`
    const calendarHtml = buildTransactionalShell({ title: 'Event', headline: 'Site walkthrough', bodyHtml: calendarBody })
    await sendFixture('calendar_invite', 'Event scheduled: Site walkthrough', calendarHtml, `Site walkthrough on ${projectName}\n\n${buildComplianceFooterText()}`)

    const updateBody = `
      <p style="margin:0 0 12px;font-size:16px;color:#374151;"><strong>${escapeHtml(inviter)}</strong> posted an update:</p>
      <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #111827;background:#f9fafb;">Cabinets delayed 2 days — supplier confirmed new delivery.</blockquote>`
    const updateHtml = buildTransactionalShell({ title: 'Task update', headline: 'Task update', bodyHtml: updateBody })
    await sendFixture('task_update', 'Task update: Install kitchen cabinets', updateHtml, `Task update from ${inviter}\n\n${buildComplianceFooterText()}`)

    const orgWelcome = buildOrgWelcomeEmail({ companyName: orgName, setupUrl: fixtureUrl })
    await sendFixture('org_welcome', orgWelcome.subject, orgWelcome.html, orgWelcome.text)

    const sent = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success)

    return new Response(
      JSON.stringify({
        success: failed.length === 0,
        to,
        sent,
        failed: failed.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('send-email-fixtures:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
