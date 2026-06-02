-- Restrict sms_phone_consent reads (was USING (true) for all authenticated).
-- Column is pending_organization_id (not organization_id). Confirmed rows clear pending_organization_id,
-- so also allow rows whose phone matches a contact in the caller's org.

DROP POLICY IF EXISTS "Authenticated users can read sms consent" ON public.sms_phone_consent;
DROP POLICY IF EXISTS "sms_phone_consent_select_authenticated" ON public.sms_phone_consent;
DROP POLICY IF EXISTS "Org members can read sms consent in their org" ON public.sms_phone_consent;

CREATE POLICY "sms_phone_consent_select_org_scoped"
  ON public.sms_phone_consent
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_organization_id() IS NOT NULL
    AND (
      pending_organization_id = public.get_user_organization_id()
      OR EXISTS (
        SELECT 1
        FROM public.contacts c
        WHERE c.organization_id = public.get_user_organization_id()
          AND c.phone IS NOT NULL
          AND (
            c.phone = sms_phone_consent.phone_e164
            OR sms_phone_consent.phone_e164 LIKE '%' || RIGHT(regexp_replace(c.phone, '[^0-9]', '', 'g'), 10)
          )
      )
    )
  );
