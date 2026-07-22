-- Seven-day App Store / Google Play review prompt state on profiles.
-- No trial extension; prompt is one-shot and cross-device.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS review_eligible_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS review_prompt_shown_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS review_prompt_action TEXT NULL,
  ADD COLUMN IF NOT EXISTS review_prompt_app_version TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_review_prompt_action_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_review_prompt_action_check
      CHECK (
        review_prompt_action IS NULL
        OR review_prompt_action IN ('dismissed', 'requested_review')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.review_eligible_at IS
  'When the 7-day review-prompt clock started (org join / personal provision). Falls back to created_at in app logic.';
COMMENT ON COLUMN public.profiles.review_prompt_shown_at IS
  'When the soft review prompt was shown (one-shot across devices).';
COMMENT ON COLUMN public.profiles.review_prompt_action IS
  'User action on the soft review prompt: dismissed | requested_review.';
COMMENT ON COLUMN public.profiles.review_prompt_app_version IS
  'Native app version when the review prompt was shown.';

-- Backfill eligibility for existing org members (exclude guest-only accounts).
UPDATE public.profiles
SET review_eligible_at = COALESCE(review_eligible_at, created_at, now())
WHERE organization_id IS NOT NULL
  AND account_intent IS DISTINCT FROM 'guest_only'
  AND review_eligible_at IS NULL;
