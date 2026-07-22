import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertOrgMember } from '../_shared/auth.ts'
import { assertCanExportProfessionalDocs, EXPORT_FEATURE_LOCKED_ERROR } from '../_shared/workspaceTier.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PHOTO_BUCKET = 'message_files'

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

function photoUrl(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  path: string | null | undefined,
) {
  if (!path) return null
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  return data?.publicUrl || null
}

function buildPunchListHtml(opts: {
  projectName: string
  projectAddress?: string | null
  groups: { location: string | null; items: Record<string, unknown>[] }[]
  branding: Record<string, unknown> | null
  signedOffAt?: string | null
  signedOffByName?: string | null
}) {
  const primary = String(opts.branding?.primary_color || '#3B82F6')
  const logoUrl = String(opts.branding?.logo_url || '')
  const footer = String(opts.branding?.company_footer || '')
  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const groupHtml = opts.groups.map((group) => {
    const heading = group.location ? escapeHtml(group.location) : 'General'
    const rows = group.items.map((issue) => {
      const closed = Boolean(issue.resolved_at) || String(issue.status || '').toLowerCase() === 'closed'
      const before = issue.before_photo_url as string | null
      const after = issue.after_photo_url as string | null
      return `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <div style="font-weight:600;color:#111827;">${escapeHtml(String(issue.title || ''))}</div>
            ${issue.description ? `<div style="margin-top:4px;color:#6b7280;font-size:13px;">${escapeHtml(String(issue.description))}</div>` : ''}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:middle;width:100px;">
            <!-- Nested table badge: print/PDF engines mis-center text inside inline-block pills -->
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;">
              <tr>
                <td style="padding:4px 10px;border-radius:6px;background:${closed ? '#f3f4f6' : '#dbeafe'};color:${closed ? '#4b5563' : '#1d4ed8'};font-size:11px;font-weight:700;line-height:1.2;text-align:center;white-space:nowrap;mso-line-height-rule:exactly;">${closed ? 'Closed' : 'Open'}</td>
              </tr>
            </table>
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;width:180px;">
            <div style="display:flex;gap:8px;">
              ${before ? `<img src="${escapeHtml(before)}" alt="Before" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;" />` : ''}
              ${after ? `<img src="${escapeHtml(after)}" alt="After" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;" />` : ''}
            </div>
          </td>
        </tr>`
    }).join('')
    return `
      <section style="margin-bottom:28px;">
        <h2 style="margin:0 0 12px;font-size:16px;color:${primary};">${heading}</h2>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:2px solid #e5e7eb;">Item</th>
              <th align="left" style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:2px solid #e5e7eb;">Status</th>
              <th align="left" style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:2px solid #e5e7eb;">Photos</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`
  }).join('')

  const signOffBlock = opts.signedOffAt
    ? `<div style="margin-top:32px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Client sign-off</div>
        <div style="margin-top:6px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(opts.signedOffByName || 'Signed')}</div>
        <div style="margin-top:4px;font-size:13px;color:#6b7280;">${escapeHtml(new Date(opts.signedOffAt).toLocaleString())}</div>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>${escapeHtml(opts.projectName)} — Punch List</title>
<style>
@media print { @page { size: A4; margin: 12mm; } html, body { height: auto !important; min-height: 0 !important; margin: 0; } }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; margin: 0; padding: 24px; }
</style></head><body>
  <header style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid ${primary};">
    <div>
      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" style="max-height:48px;max-width:180px;margin-bottom:8px;" />` : ''}
      <h1 style="margin:0;font-size:24px;">Punch List</h1>
      <div style="margin-top:4px;font-size:15px;font-weight:600;">${escapeHtml(opts.projectName)}</div>
      ${opts.projectAddress ? `<div style="margin-top:2px;font-size:13px;color:#6b7280;">${escapeHtml(opts.projectAddress)}</div>` : ''}
    </div>
    <div style="text-align:right;font-size:12px;color:#6b7280;">Generated ${escapeHtml(generated)}</div>
  </header>
  ${groupHtml || '<p style="color:#6b7280;">No punch list items recorded.</p>'}
  ${signOffBlock}
  ${footer ? `<footer style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${escapeHtml(footer)}</footer>` : ''}
</body></html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  let body: { project_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const projectId = String(body.project_id || '').trim()
  if (!projectId) {
    return new Response(JSON.stringify({ error: 'project_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id, name, address, organization_id, punch_list_signed_off_at, punch_list_signed_off_by_name')
    .eq('id', projectId)
    .maybeSingle()

  if (projectErr || !project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const member = await assertOrgMember(supabase, user.id, project.organization_id, corsHeaders)
  if (member instanceof Response) return member

  const tier = await assertCanExportProfessionalDocs(supabase, project.organization_id)
  if (!tier.ok) {
    return new Response(JSON.stringify({ error: EXPORT_FEATURE_LOCKED_ERROR }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const { data: issues, error: issuesErr } = await supabase
    .from('project_issues')
    .select('id, title, description, status, location, before_photo_path, after_photo_path, resolved_at, created_at')
    .eq('project_id', projectId)
    .order('location', { ascending: true })
    .order('created_at', { ascending: false })

  if (issuesErr) {
    return new Response(JSON.stringify({ error: issuesErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const enriched = (issues || []).map((issue) => ({
    ...issue,
    before_photo_url: photoUrl(supabase, issue.before_photo_path),
    after_photo_url: photoUrl(supabase, issue.after_photo_path),
  }))

  const { data: branding } = await supabase
    .from('organization_branding')
    .select('*')
    .eq('organization_id', project.organization_id)
    .maybeSingle()

  const html = buildPunchListHtml({
    projectName: project.name,
    projectAddress: project.address,
    groups: groupIssuesByLocation(enriched),
    branding,
    signedOffAt: project.punch_list_signed_off_at,
    signedOffByName: project.punch_list_signed_off_by_name,
  })

  const filename = `${String(project.name || 'project').replace(/[^a-zA-Z0-9._-]+/g, '_')}_punch_list.html`

  return new Response(JSON.stringify({ html, filename }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
})
