-- Allow users with can_edit_projects to update projects they can access.
-- Previously only org admins and assigned project_manager_id could UPDATE projects,
-- while the app UI exposed edit controls (including project type) to can_edit_projects roles.

DROP POLICY IF EXISTS "Admins and PMs can update projects in their organization" ON public.projects;

CREATE POLICY "Admins and PMs can update projects in their organization"
ON public.projects
FOR UPDATE
USING (
  organization_id = (SELECT get_user_organization_id())
  AND (
    (SELECT is_user_admin())
    OR (project_manager_id = (SELECT auth.uid()))
    OR (
      (SELECT user_has_permission('can_edit_projects'))
      AND id IN (SELECT get_accessible_project_ids())
    )
  )
)
WITH CHECK (
  organization_id = (SELECT get_user_organization_id())
  AND (
    (SELECT is_user_admin())
    OR (project_manager_id = (SELECT auth.uid()))
    OR (
      (SELECT user_has_permission('can_edit_projects'))
      AND id IN (SELECT get_accessible_project_ids())
    )
  )
);
