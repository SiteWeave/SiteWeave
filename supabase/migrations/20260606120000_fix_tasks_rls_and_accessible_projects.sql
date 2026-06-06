-- Align task visibility with project access (not org-wide).
-- Ensures get_accessible_project_ids matches projects SELECT policy (incl. email fallback).

CREATE OR REPLACE FUNCTION public.get_accessible_project_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM public.projects
  WHERE organization_id = public.get_user_organization_id()
    AND (
      public.is_user_admin()
      OR project_manager_id = auth.uid()
      OR created_by_user_id = auth.uid()
      OR id IN (
        SELECT project_id
        FROM public.project_contacts
        WHERE organization_id = public.get_user_organization_id()
          AND (
            (contact_id = public.get_user_contact_id() AND public.get_user_contact_id() IS NOT NULL)
            OR contact_id IN (
              SELECT c.id
              FROM public.contacts c
              WHERE LOWER(c.email) = LOWER(public.get_user_email())
                AND c.organization_id = public.get_user_organization_id()
            )
          )
      )
      OR id IN (
        SELECT project_id
        FROM public.project_collaborators
        WHERE user_id = auth.uid()
          AND organization_id = public.get_user_organization_id()
      )
    );
$$;

DROP POLICY IF EXISTS "Users can see tasks for projects they have access to" ON public.tasks;
CREATE POLICY "Users can see tasks for projects they have access to"
ON public.tasks
FOR SELECT
USING (
  project_id IN (SELECT public.get_accessible_project_ids())
  OR (
    assignee_id IS NOT NULL
    AND assignee_id = (SELECT public.get_user_contact_id())
    AND (SELECT public.get_user_contact_id()) IS NOT NULL
    AND organization_id = (SELECT public.get_user_organization_id())
  )
);

DROP POLICY IF EXISTS "Users can create tasks for accessible projects" ON public.tasks;
CREATE POLICY "Users can create tasks for accessible projects"
ON public.tasks
FOR INSERT
WITH CHECK (
  project_id IN (SELECT public.get_accessible_project_ids())
);
