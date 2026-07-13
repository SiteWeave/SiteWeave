-- Track when each task was marked complete (dashboard modal, reports, sorting).
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.tasks.completed_at IS
  'Timestamp when the task was marked complete (completed = true). Cleared when uncompleted.';

-- Backfill from the latest task completion activity per task.
UPDATE public.tasks t
SET completed_at = sub.latest_at
FROM (
  SELECT entity_id AS task_id, MAX(created_at) AS latest_at
  FROM public.activity_log
  WHERE entity_type = 'task'
    AND action = 'completed'
    AND entity_id IS NOT NULL
  GROUP BY entity_id
) sub
WHERE t.id = sub.task_id
  AND t.completed IS TRUE
  AND t.completed_at IS NULL;

-- Fallback for completed tasks without activity history.
UPDATE public.tasks
SET completed_at = created_at
WHERE completed IS TRUE
  AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.tasks_sync_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.completed IS TRUE THEN
    IF TG_OP = 'INSERT' OR OLD.completed IS DISTINCT FROM TRUE THEN
      NEW.completed_at := now();
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_sync_completed_at ON public.tasks;
CREATE TRIGGER tasks_sync_completed_at
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.tasks_sync_completed_at();

CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
  ON public.tasks (completed_at DESC NULLS LAST)
  WHERE completed IS TRUE;
