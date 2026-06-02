-- Home-screen query index verification (run against Supabase SQL editor or psql).
-- Council verdict: existing migrations already cover these patterns; no new DDL required
-- unless EXPLAIN ANALYZE shows sequential scans on production-sized data.
--
-- Existing coverage:
--   tasks: supabase/migrations/20260513130000_tasks_list_query_indexes.sql
--   user_notifications unread: supabase/migrations/20260415120000_desktop_notification_center.sql
--   calendar_events: schema.sql idx_calendar_events_org_start_time, idx_calendar_events_upcoming
--   project_issues: schema.sql idx_project_issues_project_id, idx_project_issues_status

-- 1) Incomplete tasks for assignee (home My Day)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, text, due_date, priority, completed, assignee_id, organization_id, project_id, percent_complete
FROM tasks
WHERE assignee_id IS NOT NULL
  AND completed = false
  AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid
ORDER BY due_date NULLS LAST
LIMIT 20;

-- 2) Today's calendar events
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, title, start_time, end_time, organization_id, project_id
FROM calendar_events
WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND start_time >= CURRENT_DATE
  AND start_time < CURRENT_DATE + INTERVAL '1 day';

-- 3) Active project count
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM projects
WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND status IS DISTINCT FROM 'completed';

-- 4) Overdue task count
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM tasks
WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND completed = false
  AND due_date IS NOT NULL
  AND due_date < CURRENT_DATE;

-- 5) Unread notifications
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM user_notifications
WHERE recipient_user_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND read_at IS NULL;

-- Replace placeholder UUIDs with real org/user ids from your project before running.
-- Look for "Seq Scan" on large tables; Index Scan / Bitmap Index Scan = indexes in use.
