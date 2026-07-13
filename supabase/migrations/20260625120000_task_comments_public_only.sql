-- Unify task comments to a single public thread (no internal/external distinction).

UPDATE public.task_comments
SET visibility = 'public'
WHERE visibility = 'internal';

ALTER TABLE public.task_comments
  DROP CONSTRAINT IF EXISTS task_comments_visibility_check;

ALTER TABLE public.task_comments
  ADD CONSTRAINT task_comments_visibility_check CHECK (visibility = 'public');
