-- Scheduled project pings (issue / task reminders with delay).
-- Processor: edge function process-scheduled-pings (cron ~every 15 min).

CREATE TABLE IF NOT EXISTS public.scheduled_project_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('issue', 'task')),
  entity_id TEXT NOT NULL,
  recipient_user_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  -- Optional contact snapshots for task pings (email/phone/name) when recipients
  -- are contacts rather than (or in addition to) auth user ids.
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  channels JSONB NOT NULL DEFAULT '{"email": true}'::jsonb,
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT,
  message TEXT
);

COMMENT ON TABLE public.scheduled_project_pings IS
  'Deferred issue/task reminder pings (email, SMS, app). Processed by process-scheduled-pings.';

COMMENT ON COLUMN public.scheduled_project_pings.entity_id IS
  'Issue id (integer as text) or task UUID.';

COMMENT ON COLUMN public.scheduled_project_pings.recipients IS
  'Optional [{userId?, email?, phone?, name?}] for delivery when not only user ids.';

COMMENT ON COLUMN public.scheduled_project_pings.channels IS
  'Channel flags, e.g. {"email":true,"sms":false,"app":true}.';

CREATE INDEX IF NOT EXISTS idx_scheduled_project_pings_due
  ON public.scheduled_project_pings (status, send_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_project_pings_project
  ON public.scheduled_project_pings (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_project_pings_entity
  ON public.scheduled_project_pings (entity_type, entity_id);

ALTER TABLE public.scheduled_project_pings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.scheduled_project_pings FROM PUBLIC;
REVOKE ALL ON public.scheduled_project_pings FROM anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.scheduled_project_pings TO authenticated;
GRANT ALL ON TABLE public.scheduled_project_pings TO service_role;

DROP POLICY IF EXISTS "Org members can view scheduled project pings" ON public.scheduled_project_pings;
CREATE POLICY "Org members can view scheduled project pings"
  ON public.scheduled_project_pings
  FOR SELECT
  TO authenticated
  USING (public.user_is_org_member_for_project(project_id));

DROP POLICY IF EXISTS "Org members can insert scheduled project pings" ON public.scheduled_project_pings;
CREATE POLICY "Org members can insert scheduled project pings"
  ON public.scheduled_project_pings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_is_org_member_for_project(project_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Creators can cancel scheduled project pings" ON public.scheduled_project_pings;
CREATE POLICY "Creators can cancel scheduled project pings"
  ON public.scheduled_project_pings
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.user_is_org_member_for_project(project_id)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.user_is_org_member_for_project(project_id)
  );

-- Schedule every 15 minutes via pg_cron (run once after deploy).
-- Requires pg_cron + pg_net and vault secret CRON_SECRET (service role key).
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET before running in SQL editor.
/*
SELECT cron.schedule(
  'process-scheduled-pings-every-15m',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-scheduled-pings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
*/
