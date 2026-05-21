-- Extend content_reports for stream posts and task comments (when moderation tables exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'content_reports'
  ) THEN
    ALTER TABLE public.content_reports
      DROP CONSTRAINT IF EXISTS content_reports_content_type_check;

    ALTER TABLE public.content_reports
      ADD CONSTRAINT content_reports_content_type_check
      CHECK (content_type IN (
        'message',
        'profile',
        'project',
        'task',
        'comment',
        'file',
        'stream_post',
        'task_comment'
      ));
  END IF;
END $$;
