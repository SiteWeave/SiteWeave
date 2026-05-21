-- Self-serve workspaces, account intent, project access invites, personal project cap

-- Organizations: personal vs business + optional project cap
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS workspace_type TEXT NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS max_projects INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_workspace_type_check'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_workspace_type_check
      CHECK (workspace_type IN ('personal', 'business'));
  END IF;
END $$;

UPDATE public.organizations
SET workspace_type = 'business', max_projects = NULL
WHERE workspace_type IS NULL OR workspace_type = 'business';

-- Profiles: why the user signed up
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_intent TEXT NOT NULL DEFAULT 'workspace_owner';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_account_intent_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_intent_check
      CHECK (account_intent IN ('workspace_owner', 'guest_only'));
  END IF;
END $$;

-- Project access invites (token-based guest access)
CREATE TABLE IF NOT EXISTS public.project_access_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  invited_email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  short_code TEXT,
  access_level TEXT NOT NULL DEFAULT 'viewer'
    CHECK (access_level IN ('viewer', 'editor', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_access_invites_token_hash
  ON public.project_access_invites (token_hash)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_access_invites_short_code_pending
  ON public.project_access_invites (short_code)
  WHERE status = 'pending' AND short_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_access_invites_invited_email_pending
  ON public.project_access_invites (lower(invited_email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_project_access_invites_project_id
  ON public.project_access_invites (project_id);

-- Enforce personal workspace project cap on insert
CREATE OR REPLACE FUNCTION public.enforce_personal_workspace_project_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_row public.organizations%ROWTYPE;
  project_count INTEGER;
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
  SELECT COUNT(*)::INTEGER INTO project_count
  FROM public.projects
  WHERE organization_id = NEW.organization_id;

  IF project_count >= cap THEN
    RAISE EXCEPTION 'PROJECT_LIMIT_REACHED'
      USING ERRCODE = 'P0001',
        MESSAGE = 'Personal workspace project limit reached';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_personal_workspace_project_limit ON public.projects;
CREATE TRIGGER trg_enforce_personal_workspace_project_limit
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_personal_workspace_project_limit();

-- ============================================================================
-- RLS: guest collaborator read access
-- The existing "Users can see projects in their organization" policy requires
-- organization_id = get_user_organization_id() at the top level.
-- For users with no organization (account_intent = 'guest_only') that function
-- returns NULL, making the entire USING clause NULL/false.
-- We add a separate permissive policy so guests can read their own projects.
-- ============================================================================

DROP POLICY IF EXISTS "Guest collaborators can see their projects" ON public.projects;
CREATE POLICY "Guest collaborators can see their projects"
ON public.projects
FOR SELECT
USING (
  id IN (
    SELECT project_id
    FROM public.project_collaborators
    WHERE user_id = (SELECT auth.uid())
  )
);

-- RLS for project_access_invites
ALTER TABLE public.project_access_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view project access invites" ON public.project_access_invites;
CREATE POLICY "Org members can view project access invites"
  ON public.project_access_invites FOR SELECT
  USING (
    organization_id = public.get_user_organization_id()
  );

DROP POLICY IF EXISTS "Org members can manage project access invites" ON public.project_access_invites;
CREATE POLICY "Org members can manage project access invites"
  ON public.project_access_invites FOR ALL
  USING (
    organization_id = public.get_user_organization_id()
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
  );
