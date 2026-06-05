-- Org Admin roles were missing can_view_activity_history (and other keys added over time).
UPDATE public.roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_manage_team', true,
  'can_manage_users', true,
  'can_manage_roles', true,
  'can_create_projects', true,
  'can_edit_projects', true,
  'can_delete_projects', true,
  'can_assign_tasks', true,
  'can_manage_contacts', true,
  'can_create_tasks', true,
  'can_edit_tasks', true,
  'can_delete_tasks', true,
  'can_send_messages', true,
  'can_view_activity_history', true,
  'can_manage_progress_reports', true,
  'can_manage_org_progress_reports', true
),
updated_at = now()
WHERE name = 'Org Admin'
  AND organization_id IS NOT NULL;
