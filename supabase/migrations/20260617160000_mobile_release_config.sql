-- Mobile app store version thresholds (read by all clients before login).

CREATE TABLE IF NOT EXISTS public.mobile_release_config (
  id text PRIMARY KEY DEFAULT 'default',
  min_native_version text NOT NULL DEFAULT '1.0.0',
  latest_native_version text NOT NULL DEFAULT '1.0.3',
  ios_store_url text NOT NULL DEFAULT 'https://apps.apple.com/app/id6756014286',
  android_store_url text NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.siteweave.mobile',
  force_update boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.mobile_release_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.mobile_release_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read mobile release config"
  ON public.mobile_release_config
  FOR SELECT
  TO anon, authenticated
  USING (true);
