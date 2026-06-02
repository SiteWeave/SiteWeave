ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS notification_email_batching_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_batch_window_minutes INTEGER NOT NULL DEFAULT 5;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS notification_email_batching_enabled BOOLEAN,
ADD COLUMN IF NOT EXISTS notification_batch_window_minutes INTEGER,
ADD COLUMN IF NOT EXISTS dependency_notifications_enabled BOOLEAN;

ALTER TABLE public.task_notification_history
ADD COLUMN IF NOT EXISTS batch_key UUID;

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    recipient_user_id UUID,
    recipient_email TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id UUID,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    read_by_user_id UUID,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_type, source_id, recipient_email)
);

CREATE TABLE IF NOT EXISTS public.notification_action_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.user_notifications(id) ON DELETE CASCADE,
    acted_by_user_id UUID,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_created
ON public.user_notifications(recipient_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_user_created
ON public.user_notifications(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
ON public.user_notifications(recipient_email, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_action_history_notification
ON public.notification_action_history(notification_id, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_action_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.user_notifications;
CREATE POLICY "Users can view own notifications"
ON public.user_notifications
FOR SELECT
TO authenticated
USING (
    organization_id = (SELECT public.get_user_organization_id())
    AND (
        lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR recipient_user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.user_notifications;
CREATE POLICY "Users can update own notifications"
ON public.user_notifications
FOR UPDATE
TO authenticated
USING (
    organization_id = (SELECT public.get_user_organization_id())
    AND (
        lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR recipient_user_id = auth.uid()
    )
)
WITH CHECK (
    organization_id = (SELECT public.get_user_organization_id())
    AND (
        lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR recipient_user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Service role can insert notifications" ON public.user_notifications;
CREATE POLICY "Service role can insert notifications"
ON public.user_notifications
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own notification actions" ON public.notification_action_history;
CREATE POLICY "Users can view own notification actions"
ON public.notification_action_history
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.user_notifications n
        WHERE n.id = notification_action_history.notification_id
          AND n.organization_id = (SELECT public.get_user_organization_id())
          AND (
            lower(n.recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            OR n.recipient_user_id = auth.uid()
          )
    )
);

DROP POLICY IF EXISTS "Service role can insert notification actions" ON public.notification_action_history;
CREATE POLICY "Service role can insert notification actions"
ON public.notification_action_history
FOR INSERT
TO service_role
WITH CHECK (true);

GRANT SELECT, UPDATE ON TABLE public.user_notifications TO authenticated;
GRANT ALL ON TABLE public.user_notifications TO service_role;
GRANT SELECT ON TABLE public.notification_action_history TO authenticated;
GRANT ALL ON TABLE public.notification_action_history TO service_role;
