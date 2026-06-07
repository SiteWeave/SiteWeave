// Supabase Edge Function for sending invitation emails
// Deploy: supabase functions deploy send-invitation-email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { buildProjectInviteEmail, sendTransactionalEmail } from '../_shared/transactionalEmailLayout.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    const {
      to,
      inviterName,
      projectName,
      invitationUrl,
      webInvitationUrl,
      replyTo,
    } = body

    const resolvedUrl = invitationUrl || webInvitationUrl

    if (!to || !inviterName || !projectName || !resolvedUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, inviterName, projectName, invitationUrl' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const template = buildProjectInviteEmail({
      inviterName,
      projectName,
      invitationUrl: resolvedUrl,
    })

    if (!Deno.env.get('RESEND_API_KEY')) {
      console.log('Invitation email would be sent to:', to, resolvedUrl)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Invitation logged (configure RESEND_API_KEY for actual sending)',
          to,
          invitationUrl: resolvedUrl,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const sendResult = await sendTransactionalEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      replyTo: replyTo || null,
    })

    if (!sendResult.success) {
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: sendResult.error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, id: sendResult.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Error in send-invitation-email function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
