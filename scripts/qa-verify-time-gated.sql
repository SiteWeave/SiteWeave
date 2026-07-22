-- ============================================================================
-- QA: Verify time-gated fixture state (read-only)
-- ============================================================================
-- Run after qa-accelerate-time-gated.sql / cron curls to confirm setup.
-- Edit the email filters to match your CONFIG in the accelerate script.
-- ============================================================================

-- Review prompt clocks
SELECT
  u.email,
  p.review_eligible_at,
  p.review_prompt_shown_at,
  p.review_prompt_action,
  now() - p.review_eligible_at AS age
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE lower(u.email) IN (
  lower('you@example.com'),
  lower('qa-personal@siteweave.test')
);

-- Org notification + trial state
SELECT
  o.id,
  o.name,
  o.workspace_type,
  o.task_start_notifications_enabled,
  o.task_start_notification_lead_days,
  o.trial_ends_at,
  o.trial_reminder_mid_sent_at,
  o.trial_reminder_final_sent_at,
  o.max_projects,
  o.lifetime_projects_created
FROM public.organizations o
ORDER BY o.updated_at DESC NULLS LAST
LIMIT 20;

-- Project smart-notif flags
SELECT
  p.id,
  p.name,
  p.trashed_at,
  p.purge_after,
  p.task_start_notifications_enabled,
  p.task_start_notification_lead_days,
  p.task_notifications_use_org_defaults
FROM public.projects p
WHERE p.trashed_at IS NULL
ORDER BY p.updated_at DESC NULLS LAST
LIMIT 20;

-- QA smart-notif tasks
SELECT
  t.id,
  t.text,
  t.start_date,
  t.completed,
  t.assignee_id,
  c.email AS assignee_email
FROM public.tasks t
LEFT JOIN public.contacts c ON c.id = t.assignee_id
WHERE t.text LIKE 'QA smart notif lead %'
ORDER BY t.start_date;

-- Today's notification history
SELECT
  h.task_id,
  h.lead_days,
  h.notification_date,
  h.status,
  h.recipient_email,
  h.error_message,
  h.sent_at
FROM public.task_notification_history h
WHERE h.notification_date = (timezone('utc', now()))::date
ORDER BY h.sent_at DESC NULLS LAST
LIMIT 50;

-- Due / recent progress schedules
SELECT
  s.id,
  s.name,
  s.is_active,
  s.next_send_at,
  s.last_sent_at,
  s.approval_status,
  s.project_id
FROM public.progress_report_schedules s
ORDER BY s.next_send_at NULLS LAST
LIMIT 20;

-- Trashed / purge-ready projects
SELECT
  id,
  name,
  trashed_at,
  purge_after,
  purge_after <= now() AS purge_due
FROM public.projects
WHERE trashed_at IS NOT NULL
ORDER BY trashed_at DESC
LIMIT 20;
