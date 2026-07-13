-- Project trash lifecycle: soft-delete with 30-day retention before permanent purge.
-- Trashed projects are hidden from normal queries; authorized users can list/restore/purge.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trashed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_trashed_at
  ON public.projects (organization_id, trashed_at DESC)
  WHERE trashed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_purge_after
  ON public.projects (purge_after)
  WHERE trashed_at IS NOT NULL AND purge_after IS NOT NULL;

-- Audit events survive project purge (org-scoped).
CREATE TABLE IF NOT EXISTS public.project_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID,
  project_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('trashed', 'restored', 'purged')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_lifecycle_events_org
  ON public.project_lifecycle_events (organization_id, created_at DESC);

ALTER TABLE public.project_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view project lifecycle events" ON public.project_lifecycle_events;
CREATE POLICY "Org members can view project lifecycle events"
ON public.project_lifecycle_events
FOR SELECT
USING (
  organization_id = (SELECT public.get_user_organization_id())
  AND (
    (SELECT public.is_user_admin())
    OR (SELECT public.user_can_delete_projects(organization_id))
  )
);

-- Preserve sent progress report history when a schedule is deleted.
ALTER TABLE public.progress_report_history
  ALTER COLUMN schedule_id DROP NOT NULL;

ALTER TABLE public.progress_report_history
  DROP CONSTRAINT IF EXISTS progress_report_history_schedule_id_fkey;

ALTER TABLE public.progress_report_history
  ADD CONSTRAINT progress_report_history_schedule_id_fkey
  FOREIGN KEY (schedule_id)
  REFERENCES public.progress_report_schedules(id)
  ON DELETE SET NULL;

-- Exclude trashed projects from accessible project helpers.
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
    AND trashed_at IS NULL
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

CREATE OR REPLACE FUNCTION public.user_can_trash_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_project.organization_id IS DISTINCT FROM public.get_user_organization_id() THEN
    RETURN FALSE;
  END IF;

  IF (SELECT public.is_user_admin()) THEN
    RETURN TRUE;
  END IF;

  IF v_project.project_manager_id = auth.uid() THEN
    RETURN TRUE;
  END IF;

  IF v_project.created_by_user_id = auth.uid() THEN
    RETURN TRUE;
  END IF;

  RETURN COALESCE(public.user_can_delete_projects(v_project.organization_id), FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_project_trash(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p_organization_id = public.get_user_organization_id()
    AND (
      (SELECT public.is_user_admin())
      OR (SELECT public.user_can_delete_projects(p_organization_id))
    );
$$;

CREATE OR REPLACE FUNCTION public.trash_project(p_project_id UUID)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF NOT public.user_can_trash_project(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized to move this project to trash';
  END IF;

  IF v_project.trashed_at IS NOT NULL THEN
    RETURN v_project;
  END IF;

  UPDATE public.projects
  SET
    trashed_at = now(),
    trashed_by = auth.uid(),
    purge_after = now() + interval '30 days',
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  INSERT INTO public.project_lifecycle_events (
    organization_id,
    project_id,
    project_name,
    action,
    actor_user_id,
    metadata
  ) VALUES (
    v_project.organization_id,
    v_project.id,
    v_project.name,
    'trashed',
    auth.uid(),
    jsonb_build_object('purge_after', v_project.purge_after)
  );

  RETURN v_project;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_project(p_project_id UUID)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF v_project.trashed_at IS NULL THEN
    RETURN v_project;
  END IF;

  IF NOT public.user_can_trash_project(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized to restore this project';
  END IF;

  UPDATE public.projects
  SET
    trashed_at = NULL,
    trashed_by = NULL,
    purge_after = NULL,
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  INSERT INTO public.project_lifecycle_events (
    organization_id,
    project_id,
    project_name,
    action,
    actor_user_id
  ) VALUES (
    v_project.organization_id,
    v_project.id,
    v_project.name,
    'restored',
    auth.uid()
  );

  RETURN v_project;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_trashed_projects()
RETURNS SETOF public.projects
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.*
  FROM public.projects p
  WHERE p.organization_id = public.get_user_organization_id()
    AND p.trashed_at IS NOT NULL
    AND public.user_can_manage_project_trash(p.organization_id)
  ORDER BY p.trashed_at DESC;
$$;

-- Hide trashed projects from normal org member views.
DROP POLICY IF EXISTS "Users can see projects in their organization" ON public.projects;
CREATE POLICY "Users can see projects in their organization"
ON public.projects
FOR SELECT
USING (
  organization_id = (SELECT public.get_user_organization_id())
  AND trashed_at IS NULL
  AND (
    (SELECT public.is_user_admin())
    OR (project_manager_id = (SELECT auth.uid()))
    OR (created_by_user_id = (SELECT auth.uid()))
    OR (id IN (
      SELECT project_id
      FROM public.project_contacts
      WHERE (
        (contact_id = (SELECT public.get_user_contact_id()) AND (SELECT public.get_user_contact_id()) IS NOT NULL)
        OR (contact_id IN (
          SELECT id
          FROM public.contacts
          WHERE LOWER(email) = LOWER((SELECT public.get_user_email()))
            AND organization_id = (SELECT public.get_user_organization_id())
        ))
      )
      AND organization_id = (SELECT public.get_user_organization_id())
    ))
    OR (id IN (
      SELECT project_id
      FROM public.project_collaborators
      WHERE user_id = (SELECT auth.uid())
        AND organization_id = (SELECT public.get_user_organization_id())
    ))
  )
);

DROP POLICY IF EXISTS "Trash managers can see trashed projects" ON public.projects;
CREATE POLICY "Trash managers can see trashed projects"
ON public.projects
FOR SELECT
USING (
  organization_id = (SELECT public.get_user_organization_id())
  AND trashed_at IS NOT NULL
  AND public.user_can_manage_project_trash(organization_id)
);

DROP POLICY IF EXISTS "Guest collaborators can see their projects" ON public.projects;
CREATE POLICY "Guest collaborators can see their projects"
ON public.projects
FOR SELECT
USING (
  trashed_at IS NULL
  AND id IN (
    SELECT project_id
    FROM public.project_collaborators
    WHERE user_id = (SELECT auth.uid())
  )
);

-- Block edits while trashed (restore/purge use SECURITY DEFINER).
DROP POLICY IF EXISTS "Admins and PMs can update projects in their organization" ON public.projects;
CREATE POLICY "Admins and PMs can update projects in their organization"
ON public.projects
FOR UPDATE
USING (
  trashed_at IS NULL
  AND organization_id = (SELECT public.get_user_organization_id())
  AND (
    (SELECT public.is_user_admin())
    OR (project_manager_id = (SELECT auth.uid()))
    OR (
      (SELECT public.user_has_permission('can_edit_projects'))
      AND id IN (SELECT public.get_accessible_project_ids())
    )
  )
)
WITH CHECK (
  trashed_at IS NULL
  AND organization_id = (SELECT public.get_user_organization_id())
  AND (
    (SELECT public.is_user_admin())
    OR (project_manager_id = (SELECT auth.uid()))
    OR (
      (SELECT public.user_has_permission('can_edit_projects'))
      AND id IN (SELECT public.get_accessible_project_ids())
    )
  )
);

GRANT EXECUTE ON FUNCTION public.trash_project(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_project(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trashed_projects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_trash_project(UUID) TO authenticated;
