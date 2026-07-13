-- Shareable web consent links for SMS (subs without the app).
CREATE TABLE IF NOT EXISTS public.sms_consent_requests (
    token text PRIMARY KEY,
    phone_e164 text NOT NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
    contact_id uuid REFERENCES public.contacts (id) ON DELETE SET NULL,
    created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'expired', 'revoked')),
    expires_at timestamptz NOT NULL,
    confirmed_at timestamptz,
    consent_method text CHECK (consent_method IS NULL OR consent_method IN ('web_form', 'sms_reply')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_consent_requests_phone_org_idx
    ON public.sms_consent_requests (phone_e164, organization_id);

CREATE INDEX IF NOT EXISTS sms_consent_requests_status_expires_idx
    ON public.sms_consent_requests (status, expires_at);

ALTER TABLE public.sms_consent_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_consent_requests_select_org_scoped"
    ON public.sms_consent_requests
    FOR SELECT
    TO authenticated
    USING (
        public.get_user_organization_id() IS NOT NULL
        AND organization_id = public.get_user_organization_id()
    );

GRANT SELECT ON TABLE public.sms_consent_requests TO authenticated;
GRANT ALL ON TABLE public.sms_consent_requests TO service_role;

COMMENT ON TABLE public.sms_consent_requests IS 'PM-generated shareable links for web SMS consent (Twilio via website opt-in).';

-- Track how consent was obtained on the global phone row.
ALTER TABLE public.sms_phone_consent
    ADD COLUMN IF NOT EXISTS consent_method text
        CHECK (consent_method IS NULL OR consent_method IN ('web_form', 'sms_reply'));

COMMENT ON COLUMN public.sms_phone_consent.consent_method IS 'How consent was obtained: web_form or sms_reply.';
