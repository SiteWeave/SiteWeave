-- Migration: Add ON DELETE CASCADE / SET NULL to foreign keys that were missing them.
-- Prevents state-mismatch and "Foreign Key Violation" errors when parents are deleted.
-- Also adds a view for fetching task_dependencies by project_id (enables parallel Gantt fetch).
-- Run in Supabase SQL Editor or via migration runner.

-- ============================================================================
-- View: task_dependencies by project_id (for parallel Gantt fetch in app)
-- ============================================================================
CREATE OR REPLACE VIEW task_dependencies_by_project AS
SELECT td.id, td.task_id, td.successor_task_id, td.dependency_type, td.lag_days, td.created_at, t.project_id
FROM task_dependencies td
JOIN tasks t ON t.id = td.task_id;

-- ============================================================================
-- Security Definer: get_accessible_project_ids() for RLS performance
-- Run the policy updates in schema.sql (repository root; replace project_id IN (SELECT id FROM public.projects) with project_id IN (SELECT get_accessible_project_ids()) in applicable policies). This migration only adds the function.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_accessible_project_ids()
RETURNS SETOF UUID AS $$
  SELECT id FROM public.projects
  WHERE organization_id = get_user_organization_id()
  AND (
    is_user_admin()
    OR (project_manager_id = auth.uid())
    OR (created_by_user_id = auth.uid())
    OR (id IN (
      SELECT project_id FROM public.project_contacts
      WHERE contact_id = get_user_contact_id()
        AND organization_id = get_user_organization_id()
    ))
    OR (id IN (
      SELECT project_id FROM public.project_collaborators
      WHERE user_id = auth.uid()
    ))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- issue_comments: cascade when issue or step is deleted
-- ============================================================================
ALTER TABLE issue_comments DROP CONSTRAINT IF EXISTS fk_issue_comments_issue_id;
ALTER TABLE issue_comments ADD CONSTRAINT fk_issue_comments_issue_id
  FOREIGN KEY (issue_id) REFERENCES project_issues(id) ON DELETE CASCADE;

ALTER TABLE issue_comments DROP CONSTRAINT IF EXISTS fk_issue_comments_step_id;
ALTER TABLE issue_comments ADD CONSTRAINT fk_issue_comments_step_id
  FOREIGN KEY (step_id) REFERENCES issue_steps(id) ON DELETE CASCADE;

-- ============================================================================
-- issue_files: cascade when issue or step is deleted
-- ============================================================================
ALTER TABLE issue_files DROP CONSTRAINT IF EXISTS fk_issue_files_issue_id;
ALTER TABLE issue_files ADD CONSTRAINT fk_issue_files_issue_id
  FOREIGN KEY (issue_id) REFERENCES project_issues(id) ON DELETE CASCADE;

ALTER TABLE issue_files DROP CONSTRAINT IF EXISTS fk_issue_files_step_id;
ALTER TABLE issue_files ADD CONSTRAINT fk_issue_files_step_id
  FOREIGN KEY (step_id) REFERENCES issue_steps(id) ON DELETE CASCADE;

-- ============================================================================
-- issue_steps: cascade when issue is deleted
-- ============================================================================
ALTER TABLE issue_steps DROP CONSTRAINT IF EXISTS fk_issue_steps_issue_id;
ALTER TABLE issue_steps ADD CONSTRAINT fk_issue_steps_issue_id
  FOREIGN KEY (issue_id) REFERENCES project_issues(id) ON DELETE CASCADE;

-- ============================================================================
-- project_contacts: cascade when contact is deleted (remove link)
-- ============================================================================
ALTER TABLE project_contacts DROP CONSTRAINT IF EXISTS fk_project_contacts_contact_id;
ALTER TABLE project_contacts ADD CONSTRAINT fk_project_contacts_contact_id
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- ============================================================================
-- tasks: parent_task_id SET NULL when parent task deleted; assignee_id SET NULL when contact deleted
-- ============================================================================
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_parent_task_id_fkey;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_parent_task_id;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_parent_task_id
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_assignee_id;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_assignee_id
  FOREIGN KEY (assignee_id) REFERENCES contacts(id) ON DELETE SET NULL;

-- ============================================================================
-- project_collaborators: invited_by_user_id SET NULL when user deleted
-- ============================================================================
ALTER TABLE project_collaborators DROP CONSTRAINT IF EXISTS fk_project_collaborators_invited_by;
ALTER TABLE project_collaborators ADD CONSTRAINT fk_project_collaborators_invited_by
  FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- invitations: invited_by_user_id SET NULL when user deleted
-- ============================================================================
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS fk_invitations_invited_by;
ALTER TABLE invitations ADD CONSTRAINT fk_invitations_invited_by
  FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- activity_log: user_id SET NULL when user deleted (preserve audit row)
-- ============================================================================
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS fk_activity_log_user_id;
ALTER TABLE activity_log ADD CONSTRAINT fk_activity_log_user_id
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- user_preferences: CASCADE when user deleted (remove preferences)
-- ============================================================================
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS fk_user_preferences_user_id;
ALTER TABLE user_preferences ADD CONSTRAINT fk_user_preferences_user_id
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
