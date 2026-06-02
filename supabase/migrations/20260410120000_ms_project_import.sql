-- MS Project XML import: task percent complete + org-level import mapping templates

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS percent_complete INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_percent_complete_range'
  ) THEN
    ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_percent_complete_range
    CHECK (percent_complete IS NULL OR (percent_complete >= 0 AND percent_complete <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.tasks.percent_complete IS '0-100 schedule progress; when set, completed should reflect percent_complete >= 100';

ALTER TABLE public.project_phases
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE;

CREATE TABLE IF NOT EXISTS public.schedule_import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'ms_project_xml',
  config JSONB NOT NULL DEFAULT '{}',
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_import_templates_org
  ON public.schedule_import_templates(organization_id);

CREATE INDEX IF NOT EXISTS idx_schedule_import_templates_created_at
  ON public.schedule_import_templates(created_at DESC);

ALTER TABLE public.schedule_import_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their organization schedule import templates"
ON public.schedule_import_templates;
CREATE POLICY "Users can view their organization schedule import templates"
ON public.schedule_import_templates
FOR SELECT
USING (organization_id = (SELECT get_user_organization_id()));

DROP POLICY IF EXISTS "Users can create schedule import templates for their organization"
ON public.schedule_import_templates;
CREATE POLICY "Users can create schedule import templates for their organization"
ON public.schedule_import_templates
FOR INSERT
WITH CHECK (organization_id = (SELECT get_user_organization_id()));

DROP POLICY IF EXISTS "Users can update their organization schedule import templates"
ON public.schedule_import_templates;
CREATE POLICY "Users can update their organization schedule import templates"
ON public.schedule_import_templates
FOR UPDATE
USING (organization_id = (SELECT get_user_organization_id()));

DROP POLICY IF EXISTS "Users can delete their organization schedule import templates"
ON public.schedule_import_templates;
CREATE POLICY "Users can delete their organization schedule import templates"
ON public.schedule_import_templates
FOR DELETE
USING (organization_id = (SELECT get_user_organization_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.schedule_import_templates TO authenticated;
GRANT ALL ON TABLE public.schedule_import_templates TO service_role;
