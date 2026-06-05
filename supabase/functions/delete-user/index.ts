import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROFILE_PHOTOS_BUCKET = 'profile_photos'

function throwOnError(error: { message: string } | null, step: string) {
  if (error) throw new Error(`${step}: ${error.message}`)
}

async function removeProfilePhotosForUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
) {
  const paths: string[] = []
  const { data: contactFolders, error: listError } = await supabaseAdmin.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .list(userId, { limit: 1000 })

  if (listError) {
    console.warn('delete-user: could not list profile photo folders', listError.message)
    return
  }

  for (const folder of contactFolders || []) {
    if (!folder?.name) continue
    const prefix = `${userId}/${folder.name}`
    const { data: files, error: filesError } = await supabaseAdmin.storage
      .from(PROFILE_PHOTOS_BUCKET)
      .list(prefix, { limit: 1000 })

    if (filesError) {
      console.warn('delete-user: could not list profile photos', filesError.message)
      continue
    }

    for (const file of files || []) {
      if (file?.name) paths.push(`${prefix}/${file.name}`)
    }
  }

  if (paths.length === 0) return

  const { error: removeError } = await supabaseAdmin.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .remove(paths)

  if (removeError) {
    console.warn('delete-user: could not remove profile photos', removeError.message)
  }
}

async function deleteProjectsByIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  projectIds: string[],
) {
  if (!projectIds.length) return

  const { data: tasks, error: tasksSelectErr } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .in('project_id', projectIds)
  throwOnError(tasksSelectErr, 'select tasks for projects')

  const taskIds = (tasks || []).map((t) => t.id)
  if (taskIds.length) {
    throwOnError(
      (await supabaseAdmin.from('task_photos').delete().in('task_id', taskIds)).error,
      'task_photos',
    )
    throwOnError(
      (await supabaseAdmin.from('task_dependencies').delete().in('task_id', taskIds)).error,
      'task_dependencies task_id',
    )
    throwOnError(
      (await supabaseAdmin.from('task_dependencies').delete().in('successor_task_id', taskIds)).error,
      'task_dependencies successor',
    )
    throwOnError(
      (await supabaseAdmin.from('task_comments').delete().in('task_id', taskIds)).error,
      'task_comments',
    )
  }

  throwOnError(
    (await supabaseAdmin.from('tasks').delete().in('project_id', projectIds)).error,
    'tasks',
  )
  throwOnError(
    (await supabaseAdmin.from('calendar_events').delete().in('project_id', projectIds)).error,
    'calendar_events',
  )
  throwOnError(
    (await supabaseAdmin.from('weather_impacts').delete().in('project_id', projectIds)).error,
    'weather_impacts',
  )
  throwOnError(
    (await supabaseAdmin.from('project_contacts').delete().in('project_id', projectIds)).error,
    'project_contacts',
  )
  throwOnError(
    (await supabaseAdmin.from('project_collaborators').delete().in('project_id', projectIds)).error,
    'project_collaborators',
  )
  throwOnError(
    (await supabaseAdmin.from('project_issues').delete().in('project_id', projectIds)).error,
    'project_issues',
  )
  throwOnError(
    (await supabaseAdmin.from('project_phases').delete().in('project_id', projectIds)).error,
    'project_phases',
  )
  throwOnError(
    (await supabaseAdmin.from('project_stream_posts').delete().in('project_id', projectIds)).error,
    'project_stream_posts',
  )
  throwOnError(
    (await supabaseAdmin.from('files').delete().in('project_id', projectIds)).error,
    'files',
  )

  const { data: channels, error: channelsErr } = await supabaseAdmin
    .from('message_channels')
    .select('id')
    .in('project_id', projectIds)
  throwOnError(channelsErr, 'select message_channels')

  const channelIds = (channels || []).map((c) => c.id)
  if (channelIds.length) {
    throwOnError(
      (await supabaseAdmin.from('messages').delete().in('channel_id', channelIds)).error,
      'messages',
    )
    throwOnError(
      (await supabaseAdmin.from('message_channels').delete().in('id', channelIds)).error,
      'message_channels',
    )
  }

  throwOnError(
    (await supabaseAdmin.from('projects').delete().in('id', projectIds)).error,
    'projects',
  )
}

async function collectUserContactIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  profileContactId: string | null | undefined,
  userEmail: string | undefined,
): Promise<string[]> {
  const ids = new Set<string>()
  if (profileContactId) ids.add(profileContactId)

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('created_by_user_id', userId)
  throwOnError(error, 'select user contacts')

  for (const row of data || []) {
    if (row?.id) ids.add(row.id)
  }

  if (userEmail) {
    const { data: byEmail, error: emailErr } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .ilike('email', userEmail)
    throwOnError(emailErr, 'select contacts by email')
    for (const row of byEmail || []) {
      if (row?.id) ids.add(row.id)
    }
  }

  return [...ids]
}

/** Clear FKs that block contact deletion. */
async function detachContactsBeforeDelete(
  supabaseAdmin: ReturnType<typeof createClient>,
  contactIds: string[],
) {
  if (!contactIds.length) return

  throwOnError(
    (await supabaseAdmin.from('tasks').update({ assignee_id: null }).in('assignee_id', contactIds)).error,
    'tasks assignee_id null',
  )
  throwOnError(
    (await supabaseAdmin.from('issue_steps').update({ assigned_to_contact_id: null }).in('assigned_to_contact_id', contactIds)).error,
    'issue_steps assigned_to_contact_id null',
  )
  throwOnError(
    (await supabaseAdmin.from('project_contacts').delete().in('contact_id', contactIds)).error,
    'project_contacts by contact',
  )
  throwOnError(
    (await supabaseAdmin.from('profiles').update({ contact_id: null }).in('contact_id', contactIds)).error,
    'profiles contact_id null',
  )
}

async function deleteUserContacts(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  profileContactId: string | null | undefined,
  userEmail: string | undefined,
) {
  throwOnError(
    (await supabaseAdmin.from('profiles').update({ contact_id: null }).eq('id', userId)).error,
    'profile contact_id null self',
  )

  const contactIds = await collectUserContactIds(supabaseAdmin, userId, profileContactId, userEmail)
  if (!contactIds.length) return

  await detachContactsBeforeDelete(supabaseAdmin, contactIds)

  throwOnError(
    (await supabaseAdmin.from('contacts').delete().in('id', contactIds)).error,
    'contacts',
  )
}

/** Null profile contact links before org cascade deletes contacts (fk_profiles_contact has no ON DELETE). */
async function prepareOrganizationForDeletion(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string,
) {
  const { data: contacts, error } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('organization_id', organizationId)
  throwOnError(error, 'select org contacts')

  const contactIds = (contacts || []).map((c) => c.id).filter(Boolean)
  if (!contactIds.length) return

  await detachContactsBeforeDelete(supabaseAdmin, contactIds)
}

/** Clear auth.users FKs that lack ON DELETE CASCADE/SET NULL. */
async function clearRemainingUserReferences(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
) {
  throwOnError(
    (await supabaseAdmin.from('contacts').update({ created_by_user_id: null }).eq('created_by_user_id', userId)).error,
    'contacts created_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('calendar_events').update({ updated_by_user_id: null }).eq('updated_by_user_id', userId)).error,
    'calendar_events updated_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('files').update({ created_by_user_id: null }).eq('created_by_user_id', userId)).error,
    'files created_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('files').update({ updated_by_user_id: null }).eq('updated_by_user_id', userId)).error,
    'files updated_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('issue_comments').delete().eq('user_id', userId)).error,
    'issue_comments',
  )
  throwOnError(
    (await supabaseAdmin.from('issue_files').delete().eq('uploaded_by_user_id', userId)).error,
    'issue_files',
  )
  throwOnError(
    (await supabaseAdmin.from('issue_steps').update({ assigned_to_user_id: null }).eq('assigned_to_user_id', userId)).error,
    'issue_steps assigned_to_user null',
  )
  throwOnError(
    (await supabaseAdmin.from('issue_steps').update({ created_by_user_id: null }).eq('created_by_user_id', userId)).error,
    'issue_steps created_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('issue_steps').update({ updated_by_user_id: null }).eq('updated_by_user_id', userId)).error,
    'issue_steps updated_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('issue_steps').update({ completed_by_user_id: null }).eq('completed_by_user_id', userId)).error,
    'issue_steps completed_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('project_issues').update({ created_by_user_id: null }).eq('created_by_user_id', userId)).error,
    'project_issues created_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('projects').update({ created_by_user_id: null }).eq('created_by_user_id', userId)).error,
    'projects created_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('project_collaborators').update({ invited_by_user_id: null }).eq('invited_by_user_id', userId)).error,
    'project_collaborators invited_by null',
  )
}

async function deleteUserScopedData(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  userEmail: string | undefined,
) {
  throwOnError(
    (await supabaseAdmin.from('message_reactions').delete().eq('user_id', userId)).error,
    'message_reactions',
  )
  throwOnError(
    (await supabaseAdmin.from('typing_indicators').delete().eq('user_id', userId)).error,
    'typing_indicators',
  )
  throwOnError(
    (await supabaseAdmin.from('message_reads').delete().eq('user_id', userId)).error,
    'message_reads',
  )
  throwOnError(
    (await supabaseAdmin.from('channel_reads').delete().eq('user_id', userId)).error,
    'channel_reads',
  )
  throwOnError(
    (await supabaseAdmin.from('messages').delete().eq('user_id', userId)).error,
    'messages',
  )
  throwOnError(
    (await supabaseAdmin.from('calendar_events').delete().eq('user_id', userId)).error,
    'calendar_events user_id',
  )
  throwOnError(
    (await supabaseAdmin.from('calendar_events').delete().eq('created_by_user_id', userId)).error,
    'calendar_events created_by',
  )
  throwOnError(
    (await supabaseAdmin.from('project_collaborators').delete().eq('user_id', userId)).error,
    'project_collaborators',
  )
  throwOnError(
    (await supabaseAdmin.from('activity_log').delete().eq('user_id', userId)).error,
    'activity_log',
  )
  throwOnError(
    (await supabaseAdmin.from('user_preferences').delete().eq('user_id', userId)).error,
    'user_preferences',
  )
  throwOnError(
    (await supabaseAdmin.from('user_notifications').delete().eq('recipient_user_id', userId)).error,
    'user_notifications recipient_user_id',
  )
  if (userEmail) {
    throwOnError(
      (await supabaseAdmin.from('user_notifications').delete().eq('recipient_email', userEmail)).error,
      'user_notifications recipient_email',
    )
  }
  throwOnError(
    (await supabaseAdmin.from('invitations').delete().eq('invited_by_user_id', userId)).error,
    'invitations',
  )
  throwOnError(
    (await supabaseAdmin.from('progress_report_schedules').delete().eq('created_by_user_id', userId)).error,
    'progress_report_schedules',
  )
  throwOnError(
    (await supabaseAdmin.from('progress_report_schedules').update({ approved_by_user_id: null }).eq('approved_by_user_id', userId)).error,
    'progress_report_schedules approved_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('progress_report_history').update({ sent_by_user_id: null }).eq('sent_by_user_id', userId)).error,
    'progress_report_history sent_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('content_reports').delete().eq('reported_by_user_id', userId)).error,
    'content_reports reported_by',
  )
  throwOnError(
    (await supabaseAdmin.from('content_reports').delete().eq('reported_user_id', userId)).error,
    'content_reports reported_user',
  )
  throwOnError(
    (await supabaseAdmin.from('blocked_users').delete().eq('blocker_user_id', userId)).error,
    'blocked_users blocker',
  )
  throwOnError(
    (await supabaseAdmin.from('blocked_users').delete().eq('blocked_user_id', userId)).error,
    'blocked_users blocked',
  )
  throwOnError(
    (await supabaseAdmin.from('terms_of_service_acceptances').delete().eq('user_id', userId)).error,
    'terms_of_service_acceptances',
  )

  throwOnError(
    (await supabaseAdmin.from('organizations').update({ created_by_user_id: null }).eq('created_by_user_id', userId)).error,
    'organizations created_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('projects').update({ project_manager_id: null }).eq('project_manager_id', userId)).error,
    'projects project_manager null',
  )
  throwOnError(
    (await supabaseAdmin.from('projects').update({ updated_by_user_id: null }).eq('updated_by_user_id', userId)).error,
    'projects updated_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('project_access_invites').update({ invited_by_user_id: null }).eq('invited_by_user_id', userId)).error,
    'project_access_invites invited_by null',
  )
  throwOnError(
    (await supabaseAdmin.from('project_access_invites').update({ accepted_by_user_id: null }).eq('accepted_by_user_id', userId)).error,
    'project_access_invites accepted_by null',
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      throw new Error('Invalid user token')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const userId = user.id
    const userEmail = user.email?.toLowerCase()

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('organization_id, contact_id, account_intent')
      .eq('id', userId)
      .maybeSingle()
    throwOnError(profileErr, 'load profile')

    const organizationId = profile?.organization_id
    let soleOrgMember = false

    if (organizationId) {
      const { count, error: countErr } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
      throwOnError(countErr, 'count org members')
      soleOrgMember = count === 1
    }

    await deleteUserScopedData(supabaseAdmin, userId, userEmail)
    await deleteUserContacts(supabaseAdmin, userId, profile?.contact_id, userEmail)
    await clearRemainingUserReferences(supabaseAdmin, userId)

    if (soleOrgMember && organizationId) {
      await prepareOrganizationForDeletion(supabaseAdmin, organizationId)
      throwOnError(
        (await supabaseAdmin.from('organizations').delete().eq('id', organizationId)).error,
        'delete organization',
      )
    } else {
      const { data: createdProjects, error: ownedErr } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('created_by_user_id', userId)
      throwOnError(ownedErr, 'select created projects')
      await deleteProjectsByIds(
        supabaseAdmin,
        (createdProjects || []).map((p) => p.id),
      )
    }

    await removeProfilePhotosForUser(supabaseAdmin, userId)

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    return new Response(
      JSON.stringify({ message: 'User account deleted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('delete-user failed:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
