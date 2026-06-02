CREATE TABLE IF NOT EXISTS public.task_dependency_notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    successor_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'skipped', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(trigger_task_id, successor_task_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_task_dependency_notification_history_trigger
ON public.task_dependency_notification_history(trigger_task_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_dependency_notification_history_org
ON public.task_dependency_notification_history(organization_id, sent_at DESC);

ALTER TABLE public.task_dependency_notification_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view dependency notification history for their organization"
ON public.task_dependency_notification_history;

CREATE POLICY "Users can view dependency notification history for their organization"
ON public.task_dependency_notification_history
FOR SELECT
TO authenticated
USING (organization_id = (SELECT public.get_user_organization_id()));

DROP POLICY IF EXISTS "Users can create dependency notification history for their organization"
ON public.task_dependency_notification_history;

CREATE POLICY "Users can create dependency notification history for their organization"
ON public.task_dependency_notification_history
FOR INSERT
TO authenticated
WITH CHECK (organization_id = (SELECT public.get_user_organization_id()));

DROP POLICY IF EXISTS "Users can delete dependency notification history for their organization"
ON public.task_dependency_notification_history;

CREATE POLICY "Users can delete dependency notification history for their organization"
ON public.task_dependency_notification_history
FOR DELETE
TO authenticated
USING (organization_id = (SELECT public.get_user_organization_id()));

GRANT SELECT, INSERT, DELETE ON TABLE public.task_dependency_notification_history TO authenticated;
GRANT ALL ON TABLE public.task_dependency_notification_history TO service_role;
