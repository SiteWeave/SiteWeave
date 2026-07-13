-- Schedule daily purge of expired trashed projects via edge function.
-- Requires pg_cron + pg_net and vault secret CRON_SECRET (service role key).
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET before running in SQL editor.

/*
SELECT cron.schedule(
  'purge-expired-trash-daily',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/purge-project',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{"expiredOnly": true}'::jsonb
  );
  $$
);
*/
