-- Sliding-window rate limit buckets for edge functions (guest share, etc.)
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL UNIQUE,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window
  ON public.rate_limit_buckets (window_start);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) may read/write
REVOKE ALL ON public.rate_limit_buckets FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_buckets TO service_role;

COMMENT ON TABLE public.rate_limit_buckets IS 'Edge function rate limiting; no client access';
