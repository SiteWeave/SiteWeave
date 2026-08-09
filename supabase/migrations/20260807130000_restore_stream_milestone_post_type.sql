-- Restore milestone stream posts for approval workflows.
ALTER TABLE public.project_stream_posts
  DROP CONSTRAINT IF EXISTS project_stream_posts_post_type_check;

ALTER TABLE public.project_stream_posts
  ADD CONSTRAINT project_stream_posts_post_type_check
  CHECK (post_type IN ('general', 'daily_log', 'milestone'));
