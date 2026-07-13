-- Require can_create_projects (or org admin) to insert projects, matching app RBAC.

DROP POLICY IF EXISTS "Users can create projects in their organization" ON public.projects;

CREATE POLICY "Users can create projects in their organization"
ON public.projects
FOR INSERT
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND organization_id = (SELECT get_user_organization_id())
  AND (
    (SELECT is_user_admin())
    OR (SELECT user_has_permission('can_create_projects'))
  )
);
