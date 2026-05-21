-- Personal workspace tier enforcement:
-- 1) Lifetime project cap (delete/archive cannot free slots)
-- 2) Guest collaborator cap per project
-- 3) Export / custom roles enforced in app + edge functions

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS lifetime_projects_created INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_guest_collaborators_per_project INTEGER;

-- Backfill lifetime count from existing projects (all statuses)
UPDATE public.organizations o
SET lifetime_projects_created = sub.cnt
FROM (
  SELECT organization_id, COUNT(*)::INTEGER AS cnt
  FROM public.projects
  GROUP BY organization_id
) sub
WHERE o.id = sub.organization_id
  AND o.lifetime_projects_created = 0;

UPDATE public.organizations
SET max_guest_collaborators_per_project = 5
WHERE workspace_type = 'personal'
  AND max_guest_collaborators_per_project IS NULL;

UPDATE public.organizations
SET max_guest_collaborators_per_project = NULL
WHERE workspace_type = 'business';

-- Lifetime project cap (counts all projects ever created, not only active)
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

  cap := COALESCE(org_row.max_projects, 2);

  IF COALESCE(org_row.lifetime_projects_created, 0) >= cap THEN
    RAISE EXCEPTION 'PROJECT_LIMIT_REACHED'
      USING ERRCODE = 'P0001',
        MESSAGE = 'Personal workspace project limit reached';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_org_lifetime_projects_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.organizations
  SET lifetime_projects_created = COALESCE(lifetime_projects_created, 0) + 1
  WHERE id = NEW.organization_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_lifetime_projects ON public.projects;
CREATE TRIGGER trg_increment_lifetime_projects
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_org_lifetime_projects_created();

-- Guest collaborator + pending invite cap per project (personal workspaces only)
CREATE OR REPLACE FUNCTION public.count_project_guest_seats(p_project_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (SELECT COUNT(*)::INTEGER FROM public.project_collaborators WHERE project_id = p_project_id)
    + (SELECT COUNT(*)::INTEGER FROM public.project_access_invites
       WHERE project_id = p_project_id AND status = 'pending')
  );
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

DROP TRIGGER IF EXISTS trg_enforce_personal_guest_cap_collaborators ON public.project_collaborators;
CREATE TRIGGER trg_enforce_personal_guest_cap_collaborators
  BEFORE INSERT ON public.project_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_personal_workspace_guest_cap();

DROP TRIGGER IF EXISTS trg_enforce_personal_guest_cap_invites ON public.project_access_invites;
CREATE TRIGGER trg_enforce_personal_guest_cap_invites
  BEFORE INSERT ON public.project_access_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_personal_workspace_guest_cap();
