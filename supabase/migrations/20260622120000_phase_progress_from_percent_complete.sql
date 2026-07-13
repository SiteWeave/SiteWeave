-- Derive project_phases.progress from average task percent_complete (completed = 100).
-- Replaces binary completed/total rollup; fires on percent_complete changes.

CREATE OR REPLACE FUNCTION public.recompute_project_phase_progress(p_phase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_avg numeric;
  v_start date;
  v_end date;
  v_progress int;
BEGIN
  IF p_phase_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    count(*)::int,
    AVG(
      CASE
        WHEN t.completed = true THEN 100
        ELSE GREATEST(0, LEAST(100, COALESCE(t.percent_complete, 0)))
      END
    )
  INTO v_total, v_avg
  FROM public.tasks t
  WHERE t.project_phase_id = p_phase_id;

  IF v_total > 0 THEN
    v_progress := ROUND(COALESCE(v_avg, 0))::int;
    v_progress := GREATEST(0, LEAST(100, v_progress));
  ELSE
    SELECT pp.start_date, pp.end_date
    INTO v_start, v_end
    FROM public.project_phases pp
    WHERE pp.id = p_phase_id;

    IF v_start IS NULL OR v_end IS NULL THEN
      v_progress := 0;
    ELSE
      v_progress := public.calculate_project_phase_schedule_progress(v_start, v_end, CURRENT_DATE);
    END IF;
  END IF;

  UPDATE public.project_phases
  SET progress = v_progress,
      updated_at = now()
  WHERE id = p_phase_id;
END;
$$;

-- When phase dates change: if phase has tasks, rollup from tasks; else schedule-based
CREATE OR REPLACE FUNCTION public.set_project_phase_schedule_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  task_count int;
  v_avg numeric;
  v_progress int;
BEGIN
  SELECT count(*)::int INTO task_count
  FROM public.tasks
  WHERE project_phase_id = NEW.id;

  IF task_count > 0 THEN
    SELECT AVG(
      CASE
        WHEN completed = true THEN 100
        ELSE GREATEST(0, LEAST(100, COALESCE(percent_complete, 0)))
      END
    )
    INTO v_avg
    FROM public.tasks
    WHERE project_phase_id = NEW.id;

    NEW.progress := GREATEST(0, LEAST(100, COALESCE(ROUND(v_avg)::int, 0)));
    RETURN NEW;
  END IF;

  IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.progress := public.calculate_project_phase_schedule_progress(
    NEW.start_date,
    NEW.end_date,
    CURRENT_DATE
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_refresh_phase_progress ON public.tasks;
CREATE TRIGGER trg_tasks_refresh_phase_progress
AFTER INSERT OR DELETE OR UPDATE OF completed, percent_complete, project_phase_id, project_id, start_date, due_date, duration_days ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.tasks_after_change_refresh_phase_progress();

-- Backfill phase progress from existing tasks
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.project_phases LOOP
    PERFORM public.recompute_project_phase_progress(r.id);
  END LOOP;
END;
$$;
