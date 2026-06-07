-- Personal workspace 14-day full-feature trial (new signups only; no backfill).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS trial_reminder_mid_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS trial_reminder_final_sent_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.organizations.trial_ends_at IS
  'Personal workspaces only. When set and in the future, org gets full business-tier feature access.';
COMMENT ON COLUMN public.organizations.trial_reminder_mid_sent_at IS
  'When the mid-trial (7 days remaining) reminder email was sent.';
COMMENT ON COLUMN public.organizations.trial_reminder_final_sent_at IS
  'When the final (1 day remaining) trial reminder email was sent.';

-- Skip personal tier caps while trial is active
CREATE OR REPLACE FUNCTION public.org_has_active_personal_trial(org_row public.organizations)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT org_row.workspace_type = 'personal'
    AND org_row.trial_ends_at IS NOT NULL
    AND org_row.trial_ends_at > now();
$$;

CREATE OR REPLACE FUNCTION public.enforce_personal_workspace_project_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_row public.organizations%ROWTYPE;
  cap INTEGER;
BEGIN
  SELECT * INTO org_row FROM public.organizations WHERE id = NEW.organization_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF org_row.workspace_type IS DISTINCT FROM 'personal' THEN
    RETURN NEW;
  END IF;

  IF public.org_has_active_personal_trial(org_row) THEN
    RETURN NEW;
  END IF;

  cap := COALESCE(org_row.max_projects, 2);

  IF COALESCE(org_row.lifetime_projects_created, 0) >= cap THEN
    RAISE EXCEPTION 'PROJECT_LIMIT_REACHED'
      USING ERRCODE = 'P0001',
        MESSAGE = 'Personal workspace project limit reached';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_personal_workspace_guest_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_row public.organizations%ROWTYPE;
  cap INTEGER;
  seats INTEGER;
  pid UUID;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT o.* INTO org_row
  FROM public.organizations o
  JOIN public.projects p ON p.organization_id = o.id
  WHERE p.id = pid;

  IF NOT FOUND OR org_row.workspace_type IS DISTINCT FROM 'personal' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF public.org_has_active_personal_trial(org_row) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  cap := COALESCE(org_row.max_guest_collaborators_per_project, 5);
  seats := public.count_project_guest_seats(pid);

  IF seats >= cap THEN
    RAISE EXCEPTION 'GUEST_COLLABORATOR_LIMIT_REACHED'
      USING ERRCODE = 'P0001',
        MESSAGE = 'Personal workspace guest collaborator limit reached for this project';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
