-- Allow field issues to be assigned to any project contact (not only auth users).
-- Keeps assigned_to_user_id in sync when the contact has a linked profile.

ALTER TABLE public.project_issues
  ADD COLUMN IF NOT EXISTS assigned_to_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.project_issues.assigned_to_contact_id IS
  'Primary assignee (any project contact). Prefer this over assigned_to_user_id for display.';

COMMENT ON COLUMN public.project_issues.assigned_to_user_id IS
  'Auth user for the assignee when the contact has a linked profile (notifications / app).';

CREATE INDEX IF NOT EXISTS idx_project_issues_assigned_to_contact_id
  ON public.project_issues(assigned_to_contact_id);

-- Backfill contact id from existing user assignees via profiles.contact_id.
UPDATE public.project_issues pi
SET assigned_to_contact_id = p.contact_id
FROM public.profiles p
WHERE pi.assigned_to_user_id = p.id
  AND pi.assigned_to_contact_id IS NULL
  AND p.contact_id IS NOT NULL;
