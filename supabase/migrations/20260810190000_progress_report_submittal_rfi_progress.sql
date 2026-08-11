-- PM Actions: optional project notes (RFIs, submittals, long lead, change orders).
-- Included in progress reports when as_of_date falls in the report window.

CREATE TABLE IF NOT EXISTS public.project_pm_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    as_of_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    rfi_notes TEXT,
    long_lead_time_notes TEXT,
    change_orders_notes TEXT,
    submittals_notes TEXT,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_project_pm_actions_project_id
  ON public.project_pm_actions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_pm_actions_org_date
  ON public.project_pm_actions(organization_id, as_of_date DESC);

ALTER TABLE public.project_pm_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see pm actions for accessible projects" ON public.project_pm_actions;
CREATE POLICY "Users can see pm actions for accessible projects"
ON public.project_pm_actions
FOR SELECT
USING (
  project_id IN (SELECT id FROM public.projects)
);

DROP POLICY IF EXISTS "Users can create pm actions for accessible projects" ON public.project_pm_actions;
CREATE POLICY "Users can create pm actions for accessible projects"
ON public.project_pm_actions
FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM public.projects)
);

DROP POLICY IF EXISTS "Users can update pm actions for accessible projects" ON public.project_pm_actions;
CREATE POLICY "Users can update pm actions for accessible projects"
ON public.project_pm_actions
FOR UPDATE
USING (
  project_id IN (SELECT id FROM public.projects)
)
WITH CHECK (
  project_id IN (SELECT id FROM public.projects)
);

DROP POLICY IF EXISTS "Users can delete pm actions for accessible projects" ON public.project_pm_actions;
CREATE POLICY "Users can delete pm actions for accessible projects"
ON public.project_pm_actions
FOR DELETE
USING (
  project_id IN (SELECT id FROM public.projects)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_pm_actions TO authenticated;

-- Remove schedule-level note columns if an earlier draft migration added them.
ALTER TABLE public.progress_report_schedules
  DROP COLUMN IF EXISTS submittal_rfi_progress,
  DROP COLUMN IF EXISTS rfi_notes,
  DROP COLUMN IF EXISTS long_lead_time_notes,
  DROP COLUMN IF EXISTS change_orders_notes,
  DROP COLUMN IF EXISTS submittals_notes;
