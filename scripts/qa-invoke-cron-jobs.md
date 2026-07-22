# QA: Invoke time-gated cron jobs

Use after running blocks in [`qa-accelerate-time-gated.sql`](./qa-accelerate-time-gated.sql).

## Project

```text
SUPABASE_PROJECT_ID=tchqmlyiwsqxwopvyxjx
```

Base URL:

```text
https://tchqmlyiwsqxwopvyxjx.supabase.co/functions/v1
```

Replace:

- `YOUR_SERVICE_ROLE_KEY` — Dashboard → Project Settings → API → `service_role` (secret)
- Or `YOUR_CRON_SECRET` if the function accepts the cron auth header

Do **not** commit real keys. Prefer staging.

> **Windows / PowerShell:** bash `\` line continuations fail. Use a single-line `curl.exe ...` command, or PowerShell backticks (`` ` ``). Prefer `curl.exe` over `curl` (the latter is often an alias for `Invoke-WebRequest`).

---

## Smart task-start notifications (Block B)

Requires cron secret **or** service role (`requireCronOrServiceRole`).

```bash
curl -X POST \
  "https://tchqmlyiwsqxwopvyxjx.supabase.co/functions/v1/process-task-notifications" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{}"
```

**PowerShell** (use `curl.exe`, or backticks — not `\`):

```powershell
curl.exe -X POST "https://tchqmlyiwsqxwopvyxjx.supabase.co/functions/v1/process-task-notifications" -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d "{}"
```

Or with cron secret:

```bash
curl -X POST \
  "https://tchqmlyiwsqxwopvyxjx.supabase.co/functions/v1/process-task-notifications" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{}"
```

**Expect:** emails to the assignee contact, rows in `task_notification_history`, and in-app `user_notifications` when channels succeed.

**Verify in SQL:**

```sql
SELECT task_id, lead_days, notification_date, status, recipient_email, sent_at
FROM public.task_notification_history
WHERE notification_date = (timezone('utc', now()))::date
ORDER BY sent_at DESC
LIMIT 20;
```

---

## Trial reminders (Blocks C / D)

```bash
curl -X POST \
  "https://tchqmlyiwsqxwopvyxjx.supabase.co/functions/v1/process-trial-reminders" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{}"
```

**PowerShell:**

```powershell
curl.exe -X POST "https://tchqmlyiwsqxwopvyxjx.supabase.co/functions/v1/process-trial-reminders" -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d "{}"
```

**Expect:** mid email when `trial_ends_at` is ~6–7 days out and `trial_reminder_mid_sent_at` is null; final email when ≤1 day left and `trial_reminder_final_sent_at` is null.

**Do not run C and D in the same SQL pass** if you need both emails — Block D overwrites `trial_ends_at`. Run C → curl → then D → curl.

**Verify:**

```sql
SELECT id, name, trial_ends_at, trial_reminder_mid_sent_at, trial_reminder_final_sent_at
FROM public.organizations
WHERE workspace_type = 'personal'
ORDER BY updated_at DESC
LIMIT 10;
```

---

## Scheduled progress reports (Block G)

```bash
curl -X POST \
  "https://tchqmlyiwsqxwopvyxjx.supabase.co/functions/v1/process-scheduled-reports" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{}"
```

**PowerShell:**

```powershell
curl.exe -X POST "https://tchqmlyiwsqxwopvyxjx.supabase.co/functions/v1/process-scheduled-reports" -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d "{}"
```

**Expect:** due active schedules send; check Resend + inbox for the schedule recipient.

**Verify:**

```sql
SELECT id, name, is_active, next_send_at, last_sent_at, approval_status
FROM public.progress_report_schedules
WHERE is_active = true
ORDER BY next_send_at
LIMIT 20;
```

---

## Suggested order for a customer-realistic day

| Step | SQL block | Curl |
| ---- | --------- | ---- |
| 1 | B smart notifs | `process-task-notifications` |
| 2 | C trial mid | `process-trial-reminders` |
| 3 | D trial final | `process-trial-reminders` |
| 4 | G schedule due | `process-scheduled-reports` |
| 5 | A review prompt | none (open mobile, complete a product moment) |
| 6 | F project cap | none (try create project as personal user) |
| 7 | E trash purge | use Trash / purge UI or your purge cron |
| 8 | H reset | re-run earlier curls as needed |

---

## Related

- [`docs/FULL-FEATURE-TEST-PLAN.md`](../docs/FULL-FEATURE-TEST-PLAN.md) — click-by-click checklist
- [`qa-seed-personas.sql`](./qa-seed-personas.sql) — create Auth users + orgs + golden project first
- [`qa-accelerate-time-gated.sql`](./qa-accelerate-time-gated.sql)
- [`qa-verify-time-gated.sql`](./qa-verify-time-gated.sql)
- [`docs/progress-reports-scheduling-setup.md`](../docs/progress-reports-scheduling-setup.md)
- [`docs/SMS-SIGNAL-HOUSE.md`](../docs/SMS-SIGNAL-HOUSE.md) (optional SMS after email path works)
