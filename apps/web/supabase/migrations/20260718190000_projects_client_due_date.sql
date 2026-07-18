-- Preserve the pre-pull-forward project due date for client-facing progress reports.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_due_date DATE;

COMMENT ON COLUMN public.projects.client_due_date IS
  'Frozen project completion date shown on client progress reports when keep_original_completion_date is enabled. Internal due_date may move earlier after schedule pull-forwards.';

-- Best-effort backfill: use the latest task "before" due from applied schedule adjustments.
WITH inferred AS (
  SELECT
    sa.project_id,
    MAX(NULLIF(snap->>'before_due', '')::date) AS inferred_due
  FROM public.schedule_adjustments sa
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sa.date_snapshots, '[]'::jsonb)) AS snap
  WHERE sa.status = 'applied'
  GROUP BY sa.project_id
)
UPDATE public.projects p
SET client_due_date = inferred.inferred_due
FROM inferred
WHERE p.id = inferred.project_id
  AND p.client_due_date IS NULL
  AND inferred.inferred_due IS NOT NULL
  AND (p.due_date IS NULL OR inferred.inferred_due > p.due_date);
