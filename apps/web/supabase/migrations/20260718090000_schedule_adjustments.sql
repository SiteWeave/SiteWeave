-- Early-completion schedule pull-forward: auditable adjustments with snapshots.
CREATE TABLE IF NOT EXISTS public.schedule_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  adjustment_type TEXT NOT NULL DEFAULT 'early_completion'
    CHECK (adjustment_type IN ('early_completion')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'dismissed', 'superseded')),
  planned_finish DATE,
  actual_finish DATE,
  suggested_workdays INTEGER NOT NULL DEFAULT 0 CHECK (suggested_workdays >= 0),
  applied_workdays INTEGER CHECK (applied_workdays IS NULL OR applied_workdays > 0),
  selected_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  date_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_adjustments_project_status
  ON public.schedule_adjustments(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_adjustments_org
  ON public.schedule_adjustments(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedule_adjustments_source_task
  ON public.schedule_adjustments(source_task_id)
  WHERE source_task_id IS NOT NULL;

ALTER TABLE public.schedule_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_adjustments_select"
ON public.schedule_adjustments
FOR SELECT
TO authenticated
USING (project_id IN (SELECT public.get_accessible_project_ids()));

CREATE POLICY "schedule_adjustments_insert"
ON public.schedule_adjustments
FOR INSERT
TO authenticated
WITH CHECK (
  project_id IN (SELECT public.get_accessible_project_ids())
  AND organization_id = (SELECT organization_id FROM public.projects WHERE id = project_id)
);

CREATE POLICY "schedule_adjustments_update"
ON public.schedule_adjustments
FOR UPDATE
TO authenticated
USING (
  project_id IN (SELECT public.get_accessible_project_ids())
  AND (
    (SELECT public.user_has_permission('can_edit_projects'))
    OR created_by_user_id = (SELECT auth.uid())
    OR (SELECT public.is_user_admin())
  )
)
WITH CHECK (project_id IN (SELECT public.get_accessible_project_ids()));

CREATE POLICY "schedule_adjustments_delete"
ON public.schedule_adjustments
FOR DELETE
TO authenticated
USING (
  project_id IN (SELECT public.get_accessible_project_ids())
  AND (
    (SELECT public.user_has_permission('can_edit_projects'))
    OR created_by_user_id = (SELECT auth.uid())
    OR (SELECT public.is_user_admin())
  )
);

COMMENT ON TABLE public.schedule_adjustments IS
  'Manager-reviewed early-completion schedule pull-forwards with before/after date snapshots.';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.schedule_adjustments TO authenticated;
GRANT ALL ON TABLE public.schedule_adjustments TO service_role;

-- Apply selected task date snapshots in one transaction; mark adjustment applied.
CREATE OR REPLACE FUNCTION public.apply_schedule_adjustment(
  p_adjustment_id UUID,
  p_workdays INTEGER,
  p_selected_task_ids UUID[],
  p_snapshots JSONB
)
RETURNS public.schedule_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  adj public.schedule_adjustments;
  snap JSONB;
  task_id UUID;
  new_start DATE;
  new_due DATE;
  cur_start DATE;
  cur_due DATE;
BEGIN
  IF p_workdays IS NULL OR p_workdays < 1 THEN
    RAISE EXCEPTION 'applied_workdays must be at least 1';
  END IF;
  IF p_snapshots IS NULL OR jsonb_typeof(p_snapshots) <> 'array' THEN
    RAISE EXCEPTION 'date_snapshots must be a JSON array';
  END IF;
  IF NOT (SELECT public.user_has_permission('can_edit_projects'))
     AND NOT (SELECT public.is_user_admin()) THEN
    RAISE EXCEPTION 'Missing can_edit_projects permission';
  END IF;

  SELECT * INTO adj
  FROM public.schedule_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule adjustment not found';
  END IF;
  IF adj.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending adjustments can be applied';
  END IF;
  IF adj.project_id NOT IN (SELECT public.get_accessible_project_ids()) THEN
    RAISE EXCEPTION 'Project not accessible';
  END IF;

  FOR snap IN SELECT * FROM jsonb_array_elements(p_snapshots)
  LOOP
    task_id := NULLIF(snap->>'task_id', '')::UUID;
    IF task_id IS NULL THEN
      CONTINUE;
    END IF;
    IF p_selected_task_ids IS NOT NULL AND NOT (task_id = ANY (p_selected_task_ids)) THEN
      CONTINUE;
    END IF;

    SELECT start_date, due_date INTO cur_start, cur_due
    FROM public.tasks
    WHERE id = task_id AND project_id = adj.project_id AND COALESCE(completed, false) = false
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Guard: current dates must still match the "before" snapshot when present.
    IF snap ? 'before_start' AND (snap->>'before_start') IS DISTINCT FROM NULLIF(cur_start::text, '') THEN
      RAISE EXCEPTION 'Task % start changed since preview; re-review required', task_id;
    END IF;
    IF snap ? 'before_due' AND (snap->>'before_due') IS DISTINCT FROM NULLIF(cur_due::text, '') THEN
      RAISE EXCEPTION 'Task % due date changed since preview; re-review required', task_id;
    END IF;

    new_start := NULLIF(snap->>'after_start', '')::DATE;
    new_due := NULLIF(snap->>'after_due', '')::DATE;

    UPDATE public.tasks
    SET
      start_date = COALESCE(new_start, start_date),
      due_date = COALESCE(new_due, due_date)
    WHERE id = task_id;
  END LOOP;

  UPDATE public.schedule_adjustments
  SET
    status = 'applied',
    applied_workdays = p_workdays,
    selected_task_ids = to_jsonb(COALESCE(p_selected_task_ids, ARRAY[]::UUID[])),
    date_snapshots = p_snapshots,
    applied_by_user_id = auth.uid(),
    applied_at = now(),
    updated_at = now()
  WHERE id = p_adjustment_id
  RETURNING * INTO adj;

  RETURN adj;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_schedule_adjustment(p_adjustment_id UUID)
RETURNS public.schedule_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  adj public.schedule_adjustments;
  snap JSONB;
  task_id UUID;
  cur_start DATE;
  cur_due DATE;
  before_start DATE;
  before_due DATE;
BEGIN
  IF NOT (SELECT public.user_has_permission('can_edit_projects'))
     AND NOT (SELECT public.is_user_admin()) THEN
    RAISE EXCEPTION 'Missing can_edit_projects permission';
  END IF;

  SELECT * INTO adj
  FROM public.schedule_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule adjustment not found';
  END IF;
  IF adj.status <> 'applied' THEN
    RAISE EXCEPTION 'Only applied adjustments can be undone';
  END IF;
  IF adj.project_id NOT IN (SELECT public.get_accessible_project_ids()) THEN
    RAISE EXCEPTION 'Project not accessible';
  END IF;

  FOR snap IN SELECT * FROM jsonb_array_elements(COALESCE(adj.date_snapshots, '[]'::jsonb))
  LOOP
    task_id := NULLIF(snap->>'task_id', '')::UUID;
    IF task_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT start_date, due_date INTO cur_start, cur_due
    FROM public.tasks
    WHERE id = task_id AND project_id = adj.project_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Only auto-undo when current dates still match the applied "after" snapshot.
    IF snap ? 'after_start' AND (snap->>'after_start') IS DISTINCT FROM NULLIF(cur_start::text, '') THEN
      RAISE EXCEPTION 'Task % was edited after apply; open a new review instead of undo', task_id;
    END IF;
    IF snap ? 'after_due' AND (snap->>'after_due') IS DISTINCT FROM NULLIF(cur_due::text, '') THEN
      RAISE EXCEPTION 'Task % was edited after apply; open a new review instead of undo', task_id;
    END IF;

    before_start := NULLIF(snap->>'before_start', '')::DATE;
    before_due := NULLIF(snap->>'before_due', '')::DATE;

    UPDATE public.tasks
    SET
      start_date = before_start,
      due_date = before_due
    WHERE id = task_id;
  END LOOP;

  UPDATE public.schedule_adjustments
  SET
    status = 'dismissed',
    dismissed_at = now(),
    updated_at = now()
  WHERE id = p_adjustment_id
  RETURNING * INTO adj;

  RETURN adj;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_schedule_adjustment(UUID, INTEGER, UUID[], JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_schedule_adjustment(UUID) TO authenticated;
