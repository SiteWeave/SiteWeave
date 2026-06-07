import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import { createServiceClient, requireCronOrServiceRole } from '../_shared/auth.ts'
import { buildTrialReminderEmail } from '../_shared/notificationEmailTemplates.ts'
import { sendTransactionalEmail, SITEWEAVE_CONTACT_URL } from '../_shared/transactionalEmailLayout.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const CONTACT_URL = SITEWEAVE_CONTACT_URL
const APP_URL = Deno.env.get('DESKTOP_APP_URL') || Deno.env.get('PUBLIC_APP_URL') || 'https://app.siteweave.org'

function daysRemaining(trialEndsAt: string): number {
  const ms = new Date(trialEndsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authDenied = requireCronOrServiceRole(req, corsHeaders)
  if (authDenied) return authDenied

  try {
    const supabase = createServiceClient()
    const now = new Date()
    const nowIso = now.toISOString()
    const sixDaysOut = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString()
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const oneDayOut = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString()

    const results: Array<{ orgId: string; variant: string; success: boolean; error?: string }> = []

    const { data: midOrgs, error: midErr } = await supabase
      .from('organizations')
      .select('id, name, trial_ends_at, created_by_user_id, trial_reminder_mid_sent_at')
      .eq('workspace_type', 'personal')
      .gt('trial_ends_at', nowIso)
      .is('trial_reminder_mid_sent_at', null)
      .gte('trial_ends_at', sixDaysOut)
      .lte('trial_ends_at', sevenDaysOut)

    if (midErr) throw midErr

    const { data: finalOrgs, error: finalErr } = await supabase
      .from('organizations')
      .select('id, name, trial_ends_at, created_by_user_id, trial_reminder_final_sent_at')
      .eq('workspace_type', 'personal')
      .gt('trial_ends_at', nowIso)
      .is('trial_reminder_final_sent_at', null)
      .lte('trial_ends_at', oneDayOut)

    if (finalErr) throw finalErr

    type OrgRow = {
      id: string
      name: string
      trial_ends_at: string
      created_by_user_id: string | null
    }

    async function sendReminder(org: OrgRow, variant: 'mid' | 'final') {
      if (!org.created_by_user_id) {
        results.push({ orgId: org.id, variant, success: false, error: 'No owner user id' })
        return
      }

      const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(org.created_by_user_id)
      if (userErr || !userData?.user?.email) {
        results.push({ orgId: org.id, variant, success: false, error: userErr?.message || 'No owner email' })
        return
      }

      const recipientName =
        userData.user.user_metadata?.full_name ||
        userData.user.user_metadata?.name ||
        userData.user.email.split('@')[0]

      const remaining = daysRemaining(org.trial_ends_at)
      const template = buildTrialReminderEmail({
        variant,
        recipientName,
        daysRemaining: variant === 'mid' ? remaining : 1,
        trialEndsAt: org.trial_ends_at,
        contactUrl: CONTACT_URL,
        appUrl: APP_URL,
      })

      if (RESEND_API_KEY) {
        const sendResult = await sendTransactionalEmail({
          to: userData.user.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
        })

        if (!sendResult.success) {
          results.push({ orgId: org.id, variant, success: false, error: (sendResult.error || '').slice(0, 200) })
          return
        }
      } else {
        console.log(`[trial-reminder:${variant}] Would email ${userData.user.email}`, template.subject)
      }

      const sentCol = variant === 'mid' ? 'trial_reminder_mid_sent_at' : 'trial_reminder_final_sent_at'
      const { error: updateErr } = await supabase
        .from('organizations')
        .update({ [sentCol]: nowIso })
        .eq('id', org.id)

      if (updateErr) {
        results.push({ orgId: org.id, variant, success: false, error: updateErr.message })
        return
      }

      results.push({ orgId: org.id, variant, success: true })
    }

    for (const org of midOrgs || []) {
      await sendReminder(org as OrgRow, 'mid')
    }
    for (const org of finalOrgs || []) {
      await sendReminder(org as OrgRow, 'final')
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        sent: results.filter((r) => r.success).length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('process-trial-reminders:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
