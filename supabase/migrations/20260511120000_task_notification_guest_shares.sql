-- Opaque guest links for task notifications (view-only web page, no login).
-- RLS enabled with no policies: only service_role (edge functions) can access via PostgREST bypass;
-- anon/authenticated cannot read or enumerate shares.

CREATE TABLE IF NOT EXISTS public.task_notification_guest_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    task_ids UUID[] NOT NULL,
    source TEXT NOT NULL DEFAULT 'task_start',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_notification_guest_shares IS 'Hashed tokens granting time-limited guest access to specific tasks for notification links.';
COMMENT ON COLUMN public.task_notification_guest_shares.token_hash IS 'SHA-256 hex of the raw token; raw token is only sent in email/SMS/push metadata.';
COMMENT ON COLUMN public.task_notification_guest_shares.task_ids IS 'Tasks visible on the guest page; must belong to project_id.';

CREATE INDEX IF NOT EXISTS idx_task_notification_guest_shares_project
    ON public.task_notification_guest_shares(project_id);

CREATE INDEX IF NOT EXISTS idx_task_notification_guest_shares_expires
    ON public.task_notification_guest_shares(expires_at);

ALTER TABLE public.task_notification_guest_shares ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.task_notification_guest_shares FROM PUBLIC;
REVOKE ALL ON public.task_notification_guest_shares FROM anon, authenticated;

-- Intentionally no policies for anon/authenticated; service_role bypasses RLS for edge functions.
GRANT ALL ON TABLE public.task_notification_guest_shares TO service_role;
