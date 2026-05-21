-- Project Stream + Task Comments
-- Replaces channel chat with per-project stream and task-anchored comments.

-- ============================================================================
-- Helper: org member for project's owning organization
-- ============================================================================
CREATE OR REPLACE FUNCTION public.user_is_org_member_for_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects pr
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE pr.id = p_project_id
      AND p.organization_id IS NOT NULL
      AND p.organization_id = pr.organization_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_org_member_for_project(UUID) TO authenticated;

-- ============================================================================
-- Fix schema drift: parent_message_id on legacy messages (for migration)
-- messages.id is UUID in schema.sql but BIGINT on many legacy Supabase DBs
-- ============================================================================
DO $$
DECLARE
  msg_id_type text;
BEGIN
  SELECT c.data_type INTO msg_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'messages'
    AND c.column_name = 'id';

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'parent_message_id'
  ) THEN
    IF msg_id_type = 'bigint' THEN
      ALTER TABLE public.messages ADD COLUMN parent_message_id BIGINT;
    ELSE
      ALTER TABLE public.messages
        ADD COLUMN parent_message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS thread_reply_count INTEGER NOT NULL DEFAULT 0;

-- Optional legacy columns (schema.sql has these; many DBs predate them)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS payload JSONB;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ DEFAULT now();

-- ============================================================================
-- project_stream_posts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_stream_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_type TEXT NOT NULL DEFAULT 'general'
    CHECK (post_type IN ('general', 'daily_log', 'announcement', 'milestone')),
  title TEXT,
  body TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  file_url TEXT,
  file_name TEXT,
  legacy_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_posts_legacy_message
  ON public.project_stream_posts(legacy_message_id)
  WHERE legacy_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stream_posts_project_created
  ON public.project_stream_posts(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_posts_org_project
  ON public.project_stream_posts(organization_id, project_id);

-- ============================================================================
-- project_stream_replies
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_stream_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.project_stream_posts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  legacy_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_replies_legacy_message
  ON public.project_stream_replies(legacy_message_id)
  WHERE legacy_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stream_replies_post_created
  ON public.project_stream_replies(post_id, created_at ASC);

-- ============================================================================
-- task_comments
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'internal')),
  parent_comment_id UUID REFERENCES public.task_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_created
  ON public.task_comments(task_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_task_comments_project
  ON public.task_comments(project_id);

-- If tables were created earlier with legacy_message_id UUID, widen to BIGINT
DO $$
DECLARE
  msg_id_type text;
BEGIN
  SELECT c.data_type INTO msg_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'messages'
    AND c.column_name = 'id';

  IF msg_id_type <> 'bigint' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_stream_posts'
      AND column_name = 'legacy_message_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.project_stream_posts
      ALTER COLUMN legacy_message_id TYPE BIGINT USING NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_stream_replies'
      AND column_name = 'legacy_message_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.project_stream_replies
      ALTER COLUMN legacy_message_id TYPE BIGINT USING NULL;
  END IF;
END $$;

-- ============================================================================
-- Migrate legacy channel messages → stream
-- ============================================================================
INSERT INTO public.project_stream_posts (
  project_id,
  organization_id,
  author_id,
  post_type,
  title,
  body,
  file_url,
  file_name,
  payload,
  legacy_message_id,
  created_at,
  updated_at
)
SELECT
  mc.project_id,
  COALESCE(m.organization_id, mc.organization_id, pr.organization_id) AS organization_id,
  m.user_id,
  'general',
  NULL,
  COALESCE(NULLIF(TRIM(m.content), ''), '(no content)'),
  m.file_url,
  m.file_name,
  '{}'::jsonb,
  m.id,
  COALESCE(m.created_at, now()),
  COALESCE(m.updated_at, m.created_at, now())
FROM public.messages m
JOIN public.message_channels mc ON mc.id = m.channel_id
JOIN public.projects pr ON pr.id = mc.project_id
WHERE m.user_id IS NOT NULL
  AND (m.parent_message_id IS NULL)
  AND COALESCE(m.organization_id, mc.organization_id, pr.organization_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.project_stream_posts psp WHERE psp.legacy_message_id = m.id
  );

INSERT INTO public.project_stream_replies (
  post_id,
  organization_id,
  author_id,
  body,
  legacy_message_id,
  created_at,
  updated_at
)
SELECT
  psp.id,
  COALESCE(m.organization_id, mc.organization_id, pr.organization_id) AS organization_id,
  m.user_id,
  COALESCE(NULLIF(TRIM(m.content), ''), '(no content)'),
  m.id,
  COALESCE(m.created_at, now()),
  COALESCE(m.updated_at, m.created_at, now())
FROM public.messages m
JOIN public.message_channels mc ON mc.id = m.channel_id
JOIN public.projects pr ON pr.id = mc.project_id
JOIN public.project_stream_posts psp ON psp.legacy_message_id = m.parent_message_id
WHERE m.parent_message_id IS NOT NULL
  AND m.user_id IS NOT NULL
  AND COALESCE(m.organization_id, mc.organization_id, pr.organization_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.project_stream_replies psr WHERE psr.legacy_message_id = m.id
  );

-- ============================================================================
-- RLS: project_stream_posts
-- ============================================================================
ALTER TABLE public.project_stream_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_posts_select"
ON public.project_stream_posts
FOR SELECT
TO authenticated
USING (project_id IN (SELECT public.get_accessible_project_ids()));

CREATE POLICY "stream_posts_insert"
ON public.project_stream_posts
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND project_id IN (SELECT public.get_accessible_project_ids())
  AND organization_id = (SELECT organization_id FROM public.projects WHERE id = project_id)
);

CREATE POLICY "stream_posts_update"
ON public.project_stream_posts
FOR UPDATE
TO authenticated
USING (
  author_id = auth.uid()
  OR project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = auth.uid() OR public.is_user_admin()
  )
)
WITH CHECK (project_id IN (SELECT public.get_accessible_project_ids()));

CREATE POLICY "stream_posts_delete"
ON public.project_stream_posts
FOR DELETE
TO authenticated
USING (
  author_id = auth.uid()
  OR project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = auth.uid() OR public.is_user_admin()
  )
);

-- ============================================================================
-- RLS: project_stream_replies
-- ============================================================================
ALTER TABLE public.project_stream_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_replies_select"
ON public.project_stream_replies
FOR SELECT
TO authenticated
USING (
  post_id IN (
    SELECT id FROM public.project_stream_posts
    WHERE project_id IN (SELECT public.get_accessible_project_ids())
  )
);

CREATE POLICY "stream_replies_insert"
ON public.project_stream_replies
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND post_id IN (
    SELECT id FROM public.project_stream_posts
    WHERE project_id IN (SELECT public.get_accessible_project_ids())
  )
);

CREATE POLICY "stream_replies_update"
ON public.project_stream_replies
FOR UPDATE
TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

CREATE POLICY "stream_replies_delete"
ON public.project_stream_replies
FOR DELETE
TO authenticated
USING (
  author_id = auth.uid()
  OR post_id IN (
    SELECT psp.id FROM public.project_stream_posts psp
    JOIN public.projects pr ON pr.id = psp.project_id
    WHERE pr.project_manager_id = auth.uid() OR public.is_user_admin()
  )
);

-- ============================================================================
-- RLS: task_comments
-- ============================================================================
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_comments_select"
ON public.task_comments
FOR SELECT
TO authenticated
USING (
  project_id IN (SELECT public.get_accessible_project_ids())
  AND (
    visibility = 'public'
    OR public.user_is_org_member_for_project(project_id)
  )
);

CREATE POLICY "task_comments_insert"
ON public.task_comments
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND project_id IN (SELECT public.get_accessible_project_ids())
  AND (
    visibility = 'public'
    OR (
      visibility = 'internal'
      AND public.user_is_org_member_for_project(project_id)
    )
  )
);

CREATE POLICY "task_comments_update"
ON public.task_comments
FOR UPDATE
TO authenticated
USING (
  author_id = auth.uid()
  OR project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = auth.uid() OR public.is_user_admin()
  )
)
WITH CHECK (
  project_id IN (SELECT public.get_accessible_project_ids())
  AND (
    visibility = 'public'
    OR (
      visibility = 'internal'
      AND public.user_is_org_member_for_project(project_id)
    )
  )
);

CREATE POLICY "task_comments_delete"
ON public.task_comments
FOR DELETE
TO authenticated
USING (
  author_id = auth.uid()
  OR project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = auth.uid() OR public.is_user_admin()
  )
);

-- ============================================================================
-- Archive legacy messaging (read-only)
-- ============================================================================
DROP POLICY IF EXISTS "Users can create messages for accessible projects" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages or admins/PMs can update any" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages or admins/PMs can delete any" ON public.messages;
DROP POLICY IF EXISTS "Users can create channels for accessible projects" ON public.message_channels;
DROP POLICY IF EXISTS "Users can update channels for accessible projects" ON public.message_channels;
DROP POLICY IF EXISTS "Users can delete channels for accessible projects" ON public.message_channels;

CREATE POLICY "messages_read_only_deprecated"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "message_channels_read_only_deprecated"
ON public.message_channels
FOR INSERT
TO authenticated
WITH CHECK (false);

-- ============================================================================
-- Realtime publication (if using supabase realtime)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_stream_posts;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_stream_replies;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
