# Edge function security

## Authentication patterns

| Pattern | Use case | Header |
|---------|----------|--------|
| User JWT | Client-invoked actions | `Authorization: Bearer <access_token>` |
| Service role | DB webhooks, internal jobs | `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` |
| Cron secret | Scheduled jobs (`process-task-notifications`) | `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret` |
| Platform admin | `create-org-admin` only | `x-platform-admin-secret` |

Set secrets in Supabase: `CRON_SECRET`, `PLATFORM_ADMIN_SECRET`, `WEATHER_API_KEY`, `ALLOWED_CORS_ORIGINS`.

## Rate limits (guest share)

| Bucket | Limit |
|--------|-------|
| Per IP | 60 requests / minute |
| Per guest token (prefix) | 30 requests / minute |

Stored in `rate_limit_buckets` (service role only). Returns HTTP 429 with `Retry-After`.

## CORS

Authenticated functions use an origin allowlist (`ALLOWED_CORS_ORIGINS` + localhost). Guest share may use broader origins but remains rate-limited.

## Client API keys

- **Supabase anon key** — expected in clients; authorization is RLS + edge authZ.
- **WeatherAPI** — use `get-weather` edge function only; never `VITE_WEATHER_API_KEY` in production bundles.
