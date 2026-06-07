-- Schedule daily trial reminder emails via pg_cron (run once after deploy).
-- Requires pg_cron + pg_net extensions and vault secret CRON_SECRET.
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET before running in SQL editor.

-- Example (adjust URL and secret):
/*
SELECT cron.schedule(
  'process-trial-reminders-daily',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-trial-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
*/
