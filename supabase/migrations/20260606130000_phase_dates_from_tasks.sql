-- Roll up project_phases.start_date / end_date from linked task schedules.

CREATE OR REPLACE FUNCTION public.recompute_project_phase_dates(p_phase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
BEGIN
  IF p_phase_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    MIN(t.start_date) FILTER (WHERE t.start_date IS NOT NULL),
    MAX(
      COALESCE(
        t.due_date,
        CASE
          WHEN t.start_date IS NOT NULL THEN
            (t.start_date + (GREATEST(COALESCE(t.duration_days, 1), 1) - 1))::date
          ELSE NULL
        END
      )
    ) FILTER (
      WHERE t.start_date IS NOT NULL OR t.due_date IS NOT NULL
    )
  INTO v_start, v_end
  FROM public.tasks t
  WHERE t.project_phase_id = p_phase_id;

  UPDATE public.project_phases
  SET start_date = v_start,
      end_date = v_end,
      updated_at = now()
  WHERE id = p_phase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tasks_after_change_refresh_phase_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  op text := TG_OP;
BEGIN
  IF op = 'DELETE' THEN
    IF OLD.project_phase_id IS NOT NULL THEN
      PERFORM public.recompute_project_phase_progress(OLD.project_phase_id);
      PERFORM public.recompute_project_phase_dates(OLD.project_phase_id);
    END IF;
    RETURN OLD;
  END IF;

  IF op = 'UPDATE' AND OLD.project_phase_id IS DISTINCT FROM NEW.project_phase_id THEN
    IF OLD.project_phase_id IS NOT NULL THEN
      PERFORM public.recompute_project_phase_progress(OLD.project_phase_id);
      PERFORM public.recompute_project_phase_dates(OLD.project_phase_id);
    END IF;
  END IF;

  IF op IN ('INSERT', 'UPDATE') AND NEW.project_phase_id IS NOT NULL THEN
    PERFORM public.recompute_project_phase_progress(NEW.project_phase_id);
    PERFORM public.recompute_project_phase_dates(NEW.project_phase_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_refresh_phase_progress ON public.tasks;
CREATE TRIGGER trg_tasks_refresh_phase_progress
AFTER INSERT OR DELETE OR UPDATE OF completed, project_phase_id, project_id, start_date, due_date, duration_days ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.tasks_after_change_refresh_phase_progress();

-- Backfill phase dates from existing tasks
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.project_phases LOOP
    PERFORM public.recompute_project_phase_dates(r.id);
  END LOOP;
END;
$$;
