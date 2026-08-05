-- Structured client/edge operation failures for localhost ops triage.
-- Clients insert their own rows; platform developers and service_role can read all.

CREATE TABLE IF NOT EXISTS public.operation_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL CHECK (source IN ('web', 'electron', 'mobile', 'edge')),
  feature TEXT NOT NULL,
  operation TEXT NOT NULL,
  message TEXT NOT NULL,
  error_code TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id TEXT,
  sentry_event_id TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.operation_failures IS
  'Best-effort log of failed CRUD/feature operations. Read by localhost apps/ops via service role.';

CREATE INDEX IF NOT EXISTS idx_operation_failures_created_at
  ON public.operation_failures (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_failures_feature_op
  ON public.operation_failures (feature, operation, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_failures_org
  ON public.operation_failures (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

ALTER TABLE public.operation_failures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.operation_failures FROM PUBLIC;
REVOKE ALL ON TABLE public.operation_failures FROM anon;

GRANT INSERT ON TABLE public.operation_failures TO authenticated;
GRANT SELECT ON TABLE public.operation_failures TO authenticated;
GRANT ALL ON TABLE public.operation_failures TO service_role;

DROP POLICY IF EXISTS "Users can insert own operation failures" ON public.operation_failures;
CREATE POLICY "Users can insert own operation failures"
  ON public.operation_failures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NULL
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can view own operation failures" ON public.operation_failures;
CREATE POLICY "Users can view own operation failures"
  ON public.operation_failures
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_developer()
  );
