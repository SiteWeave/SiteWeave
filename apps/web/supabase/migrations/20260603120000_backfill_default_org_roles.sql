-- Backfill Member and Project Manager system roles for organizations that only have Org Admin.

INSERT INTO public.roles (organization_id, name, permissions, is_system_role)
SELECT o.id, 'Member', jsonb_build_object(
  'can_manage_team', false,
  'can_manage_users', false,
  'can_manage_roles', false,
  'can_create_projects', false,
  'can_edit_projects', false,
  'can_delete_projects', false,
  'can_assign_tasks', false,
  'can_manage_contacts', false,
  'can_create_tasks', false,
  'can_edit_tasks', true,
  'can_delete_tasks', false,
  'can_send_messages', true,
  'can_view_activity_history', false
), true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE r.organization_id = o.id AND r.name = 'Member'
);

INSERT INTO public.roles (organization_id, name, permissions, is_system_role)
SELECT o.id, 'Project Manager', jsonb_build_object(
  'can_manage_team', false,
  'can_manage_users', false,
  'can_manage_roles', false,
  'can_create_projects', true,
  'can_edit_projects', true,
  'can_delete_projects', false,
  'can_assign_tasks', true,
  'can_manage_contacts', true,
  'can_create_tasks', true,
  'can_edit_tasks', true,
  'can_delete_tasks', true,
  'can_send_messages', true,
  'can_manage_progress_reports', true,
  'can_view_activity_history', true
), true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles r
  WHERE r.organization_id = o.id AND r.name = 'Project Manager'
);

UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE p.organization_id IS NOT NULL
  AND p.role_id IS NULL
  AND p.organization_id = r.organization_id
  AND r.name = 'Member';
