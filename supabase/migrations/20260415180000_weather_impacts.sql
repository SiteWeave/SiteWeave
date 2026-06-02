-- Project-level weather / schedule impact events (manual reporting + optional date shift)
CREATE TABLE IF NOT EXISTS public.weather_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    impact_type TEXT NOT NULL DEFAULT 'weather' CHECK (impact_type IN ('weather', 'other')),
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    days_lost INTEGER NOT NULL CHECK (days_lost > 0),
    affected_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    affected_phase_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    apply_cascade BOOLEAN NOT NULL DEFAULT false,
    schedule_shift_applied BOOLEAN NOT NULL DEFAULT false,
    applied_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_impacts_project_id ON public.weather_impacts(project_id);
CREATE INDEX IF NOT EXISTS idx_weather_impacts_organization_id ON public.weather_impacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_weather_impacts_created_at ON public.weather_impacts(created_at DESC);

ALTER TABLE public.weather_impacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see weather impacts for accessible projects"
ON public.weather_impacts
FOR SELECT
USING (
  project_id IN (SELECT id FROM public.projects)
);

CREATE POLICY "Users can create weather impacts for accessible projects"
ON public.weather_impacts
FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM public.projects)
);

CREATE POLICY "Users can update weather impacts for accessible projects"
ON public.weather_impacts
FOR UPDATE
USING (
  project_id IN (SELECT id FROM public.projects)
);

CREATE POLICY "Admins PMs creators can delete weather impacts"
ON public.weather_impacts
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = (select auth.uid())
       OR (select get_user_role()) = 'Admin'
       OR created_by_user_id = (select auth.uid())
  )
);

COMMENT ON TABLE public.weather_impacts IS 'Manual schedule impact events (e.g. weather); optional task/phase date shift with dependency cascade.';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weather_impacts TO authenticated;
GRANT ALL ON TABLE public.weather_impacts TO service_role;
