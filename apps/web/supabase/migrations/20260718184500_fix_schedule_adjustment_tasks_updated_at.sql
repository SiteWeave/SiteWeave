-- tasks has no updated_at column; drop it from schedule pull-forward RPCs.
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
