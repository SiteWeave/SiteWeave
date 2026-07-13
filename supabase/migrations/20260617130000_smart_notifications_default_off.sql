-- Smart task notifications: opt-in defaults (off unless explicitly enabled).

ALTER TABLE organizations
  ALTER COLUMN task_start_notifications_enabled SET DEFAULT false;

ALTER TABLE projects
  ALTER COLUMN task_notifications_use_org_defaults SET DEFAULT false;

-- Projects that inherited org defaults without an explicit choice → off at project level.
UPDATE projects
SET
  task_notifications_use_org_defaults = false,
  task_start_notifications_enabled = false
WHERE task_notifications_use_org_defaults IS NOT DISTINCT FROM true
  AND task_start_notifications_enabled IS NULL;
