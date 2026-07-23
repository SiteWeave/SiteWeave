-- Retire announcement and milestone stream post types; keep legacy rows as general updates.

UPDATE public.project_stream_posts
SET post_type = 'general'
WHERE post_type IN ('announcement', 'milestone');

ALTER TABLE public.project_stream_posts
  DROP CONSTRAINT IF EXISTS project_stream_posts_post_type_check;

ALTER TABLE public.project_stream_posts
  ADD CONSTRAINT project_stream_posts_post_type_check
  CHECK (post_type IN ('general', 'daily_log'));
