# SiteWeave Ops (localhost only)

Private triage dashboard for **live activity**, **background jobs**, **queues**, and **operation failures**.

**Do not deploy this app.** It uses the Supabase **service role** key and must bind to `127.0.0.1` only.

## Setup

1. Copy `.env.example` → `.env.local`
2. Set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_SERVICE_ROLE_KEY` (from Supabase Dashboard → Settings → API)
3. Optional Sentry deep links:
   - `VITE_SENTRY_ORG`
   - `VITE_SENTRY_PROJECT`
4. Apply the `operation_failures` migration if not already applied:
   - `supabase/migrations/20260726160000_operation_failures.sql`

## Run

From repo root:

```bash
npm run ops
```

Or:

```bash
npm run dev --prefix apps/ops
```

Open http://127.0.0.1:5179

## Tabs

- **Activity** — successful user actions from `activity_log` (plus task completions backfill)
- **Users** — signed-in and active users (Auth last sign-in + activity), with org and action counts
- **Jobs** — delivery history for the last 7 days:
  - task start / dependency unlock emails
  - scheduled pings
  - progress report sends
  - manual pings (`notification_action_history`)
  - trial reminder stamps
  - stuck / overdue progress report schedules
- **Queues** — pending org/project invites, active report schedules, SMS consent state
- **Failures** — `operation_failures` rows (CRUD/feature errors). Many edge/email failures still land in Sentry only until those paths report into this table.

Health strip also shows signed-in / active users, tasks completed, job failures, pending invites, stuck schedules, and SMS consent pending.
