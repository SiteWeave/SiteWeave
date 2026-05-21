-- Auto-update updated_at for stream and task-comment tables.
-- Uses a reusable trigger function (created once, attached to all three tables).

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- project_stream_posts
DROP TRIGGER IF EXISTS trg_stream_posts_updated_at ON public.project_stream_posts;
CREATE TRIGGER trg_stream_posts_updated_at
BEFORE UPDATE ON public.project_stream_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- project_stream_replies
DROP TRIGGER IF EXISTS trg_stream_replies_updated_at ON public.project_stream_replies;
CREATE TRIGGER trg_stream_replies_updated_at
BEFORE UPDATE ON public.project_stream_replies
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- task_comments
DROP TRIGGER IF EXISTS trg_task_comments_updated_at ON public.task_comments;
CREATE TRIGGER trg_task_comments_updated_at
BEFORE UPDATE ON public.task_comments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
