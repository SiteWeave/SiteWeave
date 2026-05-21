-- Field issues collaboration: assignee, task links (no workflow UI)

ALTER TABLE public.project_issues
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.project_issues
  ADD COLUMN IF NOT EXISTS related_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_project_issues_assigned_to_user_id
  ON public.project_issues(assigned_to_user_id);

COMMENT ON COLUMN public.project_issues.assigned_to_user_id IS 'Single triage owner for the issue';
COMMENT ON COLUMN public.project_issues.related_task_ids IS 'Optional UUID[] of related schedule tasks';

-- Moderation: issue comments
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
        'task_comment',
        'issue_comment'
      ));
  END IF;
END $$;
