-- Content reports moderation: platform developers only (is_super_admin), not org admins.

CREATE OR REPLACE FUNCTION public.is_platform_developer()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "Admins can see all reports" ON public.content_reports;
DROP POLICY IF EXISTS "Admins can update reports" ON public.content_reports;

CREATE POLICY "Platform developers can see all reports"
  ON public.content_reports
  FOR SELECT
  USING (public.is_platform_developer());

CREATE POLICY "Platform developers can update reports"
  ON public.content_reports
  FOR UPDATE
  USING (public.is_platform_developer())
  WITH CHECK (public.is_platform_developer());
