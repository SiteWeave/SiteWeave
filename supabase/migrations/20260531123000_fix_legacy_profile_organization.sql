-- Legacy accounts: link profiles to orgs they created and resolve org id for RLS.

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
    (
      SELECT o.id
      FROM public.organizations o
      WHERE o.created_by_user_id = auth.uid()
      ORDER BY o.created_at ASC NULLS LAST
      LIMIT 1
    )
  );
$$;

-- Backfill profile.organization_id for founding users missing the link.
UPDATE public.profiles p
SET organization_id = o.id
FROM public.organizations o
WHERE o.created_by_user_id = p.id
  AND p.organization_id IS NULL;
