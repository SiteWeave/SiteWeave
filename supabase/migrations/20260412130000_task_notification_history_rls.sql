-- Task notification delivery log: enable RLS (PostgREST exposure). Edge function uses service role for writes.

ALTER TABLE public.task_notification_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view task notification history for their organization"
ON public.task_notification_history;

CREATE POLICY "Users can view task notification history for their organization"
ON public.task_notification_history
FOR SELECT
TO authenticated
USING (organization_id = (SELECT public.get_user_organization_id()));

-- Data API: explicit grants (writes via service_role / edge functions)
GRANT SELECT ON TABLE public.task_notification_history TO authenticated;
GRANT ALL ON TABLE public.task_notification_history TO service_role;
