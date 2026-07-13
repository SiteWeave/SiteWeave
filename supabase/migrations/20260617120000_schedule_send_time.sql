-- Per-schedule send time for progress reports (replaces org-level send hour for scheduling)

ALTER TABLE public.progress_report_schedules
ADD COLUMN IF NOT EXISTS send_hour INTEGER NOT NULL DEFAULT 8;

ALTER TABLE public.progress_report_schedules
ADD COLUMN IF NOT EXISTS send_timezone TEXT NOT NULL DEFAULT 'America/New_York';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'progress_report_schedules_send_hour_range'
  ) THEN
    ALTER TABLE public.progress_report_schedules
    ADD CONSTRAINT progress_report_schedules_send_hour_range
    CHECK (send_hour >= 0 AND send_hour <= 23);
  END IF;
END $$;

-- Backfill from organization defaults
UPDATE public.progress_report_schedules s
SET
  send_hour = o.progress_report_send_hour,
  send_timezone = o.progress_report_timezone
FROM public.organizations o
WHERE s.organization_id = o.id;
