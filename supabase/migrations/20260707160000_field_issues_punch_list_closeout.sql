-- Punch list closeout: extend field issues with location + before/after photos,
-- project-level client sign-off, and opaque guest review tokens.

ALTER TABLE public.project_issues
  ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.project_issues
  ADD COLUMN IF NOT EXISTS before_photo_path TEXT;

ALTER TABLE public.project_issues
  ADD COLUMN IF NOT EXISTS after_photo_path TEXT;

COMMENT ON COLUMN public.project_issues.location IS 'Optional area/room for punch list grouping (e.g. Kitchen, Unit 2B)';
COMMENT ON COLUMN public.project_issues.before_photo_path IS 'Storage path in message_files bucket for deficiency photo';
COMMENT ON COLUMN public.project_issues.after_photo_path IS 'Storage path in message_files bucket for completion proof';

CREATE INDEX IF NOT EXISTS idx_project_issues_location
  ON public.project_issues(project_id, location)
  WHERE location IS NOT NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS punch_list_signed_off_at TIMESTAMPTZ;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS punch_list_signed_off_by_name TEXT;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS punch_list_signature JSONB;

COMMENT ON COLUMN public.projects.punch_list_signed_off_at IS 'Client/owner punch list walkthrough sign-off timestamp';
COMMENT ON COLUMN public.projects.punch_list_signed_off_by_name IS 'Name entered on client punch list review page';
COMMENT ON COLUMN public.projects.punch_list_signature IS 'Optional signature payload from client review (typed name, strokes, etc.)';

CREATE TABLE IF NOT EXISTS public.project_closeout_review_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_closeout_review_tokens IS 'Hashed tokens for guest punch list / closeout review pages (no login).';

CREATE INDEX IF NOT EXISTS idx_project_closeout_review_tokens_project
    ON public.project_closeout_review_tokens(project_id);

CREATE INDEX IF NOT EXISTS idx_project_closeout_review_tokens_expires
    ON public.project_closeout_review_tokens(expires_at);

ALTER TABLE public.project_closeout_review_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.project_closeout_review_tokens FROM PUBLIC;
REVOKE ALL ON public.project_closeout_review_tokens FROM anon, authenticated;
GRANT ALL ON TABLE public.project_closeout_review_tokens TO service_role;
