import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createServiceClient } from '../_shared/auth.ts'
import { resolveCloseoutReviewToken } from '../_shared/guestCloseoutShare.ts'
import { enforceRateLimit } from '../_shared/rateLimit.ts'
import {
  buildAppProjectUrl,
  getProjectRecipients,
  insertUserNotifications,
  sendExpoPush,
} from '../_shared/projectCommunicationNotify.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const PHOTO_BUCKET = 'message_files'
const SIGNED_TTL = 3600

function parseBearer(req: Request): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h?.startsWith('Bearer ')) return null
  const t = h.slice(7).trim()
  return t || null
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function groupIssuesByLocation(issues: Record<string, unknown>[]) {
  const map = new Map<string, Record<string, unknown>[]>()
  const unlocated: Record<string, unknown>[] = []
  for (const issue of issues || []) {
    const loc = String(issue.location || '').trim()
    if (loc) {
      if (!map.has(loc)) map.set(loc, [])
      map.get(loc)!.push(issue)
    } else {
      unlocated.push(issue)
    }
  }
  const groups = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([location, items]) => ({ location, items }))
  if (unlocated.length) groups.push({ location: null, items: unlocated })
  return groups
}

async function attachPhotoUrls(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  issues: Record<string, unknown>[],
) {
  return Promise.all((issues || []).map(async (issue) => {
    const beforePath = issue.before_photo_path as string | null
    const afterPath = issue.after_photo_path as string | null
    let before_photo_url: string | null = null
    let after_photo_url: string | null = null
    if (beforePath) {
      const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(beforePath)
      before_photo_url = data?.publicUrl || null
    }
    if (afterPath) {
      const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(afterPath)
      after_photo_url = data?.publicUrl || null
    }
    return { ...issue, before_photo_url, after_photo_url }
  }))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const rawToken = parseBearer(req)
  if (!rawToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const supabase = createServiceClient()
  const rateLimited = await enforceRateLimit(supabase, req, 'guest-closeout-review', {
    ipMax: 60,
    tokenMax: 30,
  }, rawToken)
  if (rateLimited) {
    return new Response(rateLimited.body, {
      status: rateLimited.status,
      headers: { ...corsHeaders, ...Object.fromEntries(rateLimited.headers.entries()) },
    })
  }

  const tokenRow = await resolveCloseoutReviewToken(supabase, rawToken)
  if (!tokenRow) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  if (req.method === 'GET') {
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('id, name, address, punch_list_signed_off_at, punch_list_signed_off_by_name, punch_list_signature')
      .eq('id', tokenRow.project_id)
      .maybeSingle()

    if (projectErr || !project) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: issues, error: issuesErr } = await supabase
      .from('project_issues')
      .select('id, title, description, status, priority, location, before_photo_path, after_photo_path, resolved_at, created_at')
      .eq('project_id', tokenRow.project_id)
      .order('location', { ascending: true })
      .order('created_at', { ascending: false })

    if (issuesErr) {
      return new Response(JSON.stringify({ error: issuesErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const withUrls = await attachPhotoUrls(supabase, issues || [])
    const groups = groupIssuesByLocation(withUrls)

    return new Response(JSON.stringify({
      project,
      groups,
      issues: withUrls,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  if (req.method === 'POST') {
    let body: { signer_name?: string; signature?: Record<string, unknown> }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const signerName = String(body.signer_name || '').trim()
    if (!signerName) {
      return new Response(JSON.stringify({ error: 'signer_name required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const signature = body.signature && typeof body.signature === 'object' ? body.signature : { typed_name: signerName }
    const signedAt = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('projects')
      .update({
        punch_list_signed_off_at: signedAt,
        punch_list_signed_off_by_name: signerName,
        punch_list_signature: signature,
      })
      .eq('id', tokenRow.project_id)

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    try {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', tokenRow.project_id)
        .maybeSingle()
      const projectName = project?.name || 'Project'
      const actionUrl = buildAppProjectUrl(tokenRow.project_id, 'updates')
      const recipients = await getProjectRecipients(supabase, tokenRow.project_id, {})
      const title = `Punch list signed off · ${projectName}`
      const bodyText = `${signerName} signed off the punch list.`
      const notifRows = recipients.map((r) => ({
        organization_id: tokenRow.organization_id,
        project_id: tokenRow.project_id,
        recipient_user_id: r.userId,
        recipient_email: r.email,
        source_type: 'punch_list_signed_off',
        source_id: tokenRow.project_id,
        title,
        body: bodyText,
        metadata: {
          action_url: actionUrl,
          screen: `/projects/${tokenRow.project_id}/updates`,
          project_id: tokenRow.project_id,
        },
      }))
      await insertUserNotifications(supabase, notifRows)
      const { data: pushProfiles } = await supabase
        .from('profiles')
        .select('push_token')
        .in('id', recipients.map((r) => r.userId))
        .not('push_token', 'is', null)
      const pushTokens = (pushProfiles || []).map((p) => p.push_token).filter(Boolean) as string[]
      await sendExpoPush(pushTokens, {
        title,
        body: bodyText,
        data: {
          project_id: tokenRow.project_id,
          screen: `/projects/${tokenRow.project_id}/updates`,
          source_type: 'punch_list_signed_off',
        },
      })
    } catch (notifyErr) {
      console.warn('guest-closeout-review notify', notifyErr)
    }

    return new Response(JSON.stringify({
      success: true,
      signed_off_at: signedAt,
      signed_off_by_name: signerName,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders })
})
