# Field Issues

Site triage tracker for problems on the job — complementary to **tasks and Gantt dependencies**, not a replacement workflow engine.

## Where it lives

- **Web / desktop:** Project workspace **Updates** tab — **Project stream** (left) and **Field issues** (right) side by side. Legacy routes `/projects/:id/stream` and `/projects/:id/field-issues` open the same view.
- **Mobile:** Project **Updates** tab with **Stream | Field issues** segment control.

## Capabilities

- Create issues with title, description, priority, due date, assignee
- Open / closed status with optional stream bridge posts (`Field issue opened/closed: …`)
- Threaded **issue comments** (`issue_comments`)
- File attachments (`issue_files` via `message_files` storage)
- Optional **related task** links (`related_task_ids` JSONB on `project_issues`)
- Realtime refresh and unread badges (with project stream)

## Data model

| Table | Role |
|-------|------|
| `project_issues` | Parent issue row |
| `issue_comments` | Discussion |
| `issue_files` | Attachments |
| `issue_steps` | Legacy workflow data (UI not exposed) |

### Key `project_issues` fields

- `assigned_to_user_id` — single triage owner
- `related_task_ids` — JSON array of task UUIDs
- `status` — `open` / `closed` (plus `resolved_at`)

## Services (`@siteweave/core-logic`)

- `issuesService.js` — CRUD, files, stream bridge, realtime subscribe
- `issueCommentsService.js` — comments and unread activity counts

## Notifications

Edge function `notify-project-communication` actions:

- `field_issue_created`
- `field_issue_assigned`
- `issue_comment`

## Migration

Apply `supabase/migrations/20260520140000_field_issues_collaboration.sql` for assignee and related-task columns plus moderation type `issue_comment`.
