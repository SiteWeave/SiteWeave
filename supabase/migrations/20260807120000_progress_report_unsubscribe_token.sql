-- Progress report email unsubscribe tokens (one-click / List-Unsubscribe)
ALTER TABLE public.progress_report_recipients
  ADD COLUMN IF NOT EXISTS unsubscribe_token text;

UPDATE public.progress_report_recipients
SET unsubscribe_token = replace(gen_random_uuid()::text, '-', '')
WHERE unsubscribe_token IS NULL;

ALTER TABLE public.progress_report_recipients
  ALTER COLUMN unsubscribe_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS progress_report_recipients_unsubscribe_token_uidx
  ON public.progress_report_recipients (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;
