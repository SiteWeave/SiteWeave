# SiteWeave B2B - Quick Reference Guide

## Architecture Overview

```
Super Admin → Creates Organizations
Organization Admin → Manages Users & Roles
Users → Work on Projects (within their organization)
Guest Collaborators → Access specific projects (across organizations)
```

---

## Key Concepts

### Organization
- Root entity for multi-tenancy
- All data belongs to an organization
- Users can only belong to ONE organization
- Data is automatically isolated by RLS policies

### Roles (Dynamic RBAC)
- Defined per organization
- Stored in `roles` table with JSONB permissions
- Organization Admins can create custom roles
- Permissions: `can_create_projects`, `can_delete_tasks`, `can_manage_users`, etc.

### Project Collaborators (Guest Access)
- Users who can access specific projects without being org members
- Three access levels: viewer, editor, admin
- Useful for subcontractors working across multiple organizations
- Managed via `project_collaborators` table

### Super Admin
- Can create organizations
- Has `is_super_admin = true` in profiles
- Not tied to a specific organization

---

## Database Tables

### Core Tables
| Table | Purpose |
|-------|---------|
| `organizations` | Root entity for multi-tenancy |
| `roles` | Dynamic roles with JSONB permissions |
| `profiles` | Links auth.users to organizations and roles |
| `project_collaborators` | Guest access for specific projects |

### Data Tables (All have `organization_id`)
- `projects`, `contacts`, `tasks`, `files`
- `calendar_events`, `event_categories`
- `issue_comments`, `issue_files`, `issue_steps`
- `message_channels`, `messages`
- `project_contacts`, `project_issues`, `project_phases`
- `activity_log`, `invitations`

---

## Helper Functions

### `get_user_organization_id()`
Returns the current user's organization ID.

**Usage:**
```sql
SELECT * FROM projects WHERE organization_id = get_user_organization_id();
```

### `is_organization_admin()`
Returns true if current user is an organization admin.

**Usage:**
```sql
SELECT * FROM users WHERE is_organization_admin();
```

### `has_project_access(project_uuid)`
Returns true if user is an org member OR project collaborator.

**Usage:**
```sql
SELECT * FROM projects WHERE has_project_access(id);
```

### `is_project_collaborator(project_uuid)`
Returns true if user is a project collaborator (guest).

**Usage:**
```sql
SELECT * FROM project_collaborators WHERE is_project_collaborator(project_id);
```

### `has_storage_file_access(file_path, bucket_name)`
Returns true if user can access a file in storage.

**Usage:**
```sql
-- Used in storage bucket RLS policies
SELECT has_storage_file_access(name, bucket_id);
```

---

## Permission Checks

### In SQL (RLS Policies)
```sql
-- Check if user has permission
(
  SELECT (r.permissions->>'can_create_projects')::boolean
  FROM profiles p
  JOIN roles r ON p.role_id = r.id
  WHERE p.id = auth.uid()
)
```

### In JavaScript (Frontend)
```javascript
import { hasPermission } from '../utils/permissions';

// Check permission
if (hasPermission('can_delete_projects')) {
  // Show delete button
}

// Or use PermissionGuard component
<PermissionGuard permission="can_delete_projects">
  <button onClick={handleDelete}>Delete</button>
</PermissionGuard>
```

---

## Common Queries

### Get Current User's Organization
```javascript
const { data: profile } = await supabase
  .from('profiles')
  .select('organization_id, organizations(name)')
  .eq('id', user.id)
  .single();
```

### Get User's Role and Permissions
```javascript
const { data: profile } = await supabase
  .from('profiles')
  .select('role_id, roles(name, permissions)')
  .eq('id', user.id)
  .single();
```

### Get All Projects (Automatically Filtered by Org)
```javascript
// RLS automatically filters by organization_id
const { data: projects } = await supabase
  .from('projects')
  .select('*');
```

### Get Projects Including Guest Access
```javascript
// RLS checks both org membership and project_collaborators
const { data: projects } = await supabase
  .from('projects')
  .select('*');
// Returns: projects in user's org + projects where user is collaborator
```

### Invite User to Organization
```javascript
import { inviteUser } from '../utils/userManagementService';

const result = await inviteUser(
  supabase,
  'user@example.com',
  organizationId,
  roleId,
  projectId // optional
);
```

### Add Project Collaborator (Guest)
```javascript
import { addProjectCollaborator } from '../utils/projectCollaborationService';

const result = await addProjectCollaborator(
  supabase,
  projectId,
  userId,
  'editor' // access level: viewer, editor, admin
);
```

### Duplicate Project with Date Shifting
```javascript
import { duplicateProject } from '../utils/projectDuplicationService';

const result = await duplicateProject(
  supabase,
  projectId,
  'New Project Name',
  organizationId,
  '2026-02-01' // new start date
);
```

---

## Permissions Reference

### Standard Permissions
- `can_view_projects` - View projects
- `can_create_projects` - Create new projects
- `can_edit_projects` - Edit project details
- `can_delete_projects` - Delete projects
- `can_create_tasks` - Create tasks
- `can_edit_tasks` - Edit tasks
- `can_delete_tasks` - Delete tasks
- `can_manage_users` - Invite/remove users
- `can_manage_roles` - Create/edit roles
- `can_invite_users` - Send invitations
- `can_view_financials` - View financial data
- `can_manage_settings` - Manage org settings

### Custom Permissions
Organizations can define custom permissions in the JSONB column:
```json
{
  "can_approve_timesheets": true,
  "can_sign_contracts": false,
  "can_access_safety_reports": true
}
```

---

## User Flows

### New User Onboarding
1. Organization Admin invites user (email)
2. User receives invitation email with link
3. User clicks link → redirected to sign-up page
4. User creates account (email + password)
5. System links user to organization
6. User is assigned role from invitation
7. User can now access organization's projects

### Adding Guest Collaborator
1. Project Manager opens project
2. Clicks "Add Collaborator"
3. Enters user email and selects access level
4. System sends invitation
5. User accepts invitation
6. User can now access this specific project (but not other org data)

### Creating Custom Role
1. Organization Admin goes to Settings → Roles
2. Clicks "Create Role"
3. Enters role name (e.g., "Site Supervisor")
4. Selects permissions (checkboxes)
5. Saves role
6. Role is now available when inviting users

---

## RLS Policy Patterns

### Organization-Only Access
```sql
CREATE POLICY "org_members_only" ON projects
FOR SELECT
USING (organization_id = get_user_organization_id());
```

### Organization + Guest Access
```sql
CREATE POLICY "org_and_guests" ON projects
FOR SELECT
USING (has_project_access(id));
```

### Admin-Only Actions
```sql
CREATE POLICY "admins_only" ON projects
FOR DELETE
USING (
  is_organization_admin() AND
  organization_id = get_user_organization_id()
);
```

### Permission-Based Actions
```sql
CREATE POLICY "permission_based" ON projects
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id() AND
  (
    SELECT (r.permissions->>'can_create_projects')::boolean
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
  )
);
```

---

## File Structure

### Key Files
```
../../schema.sql                          # Complete database schema (repo root)
scripts/
  migrate-to-organizations.sql          # Migration script
  seed-demo-account.sql                 # Demo account for reviewers
  setup-storage-policies.sql            # Storage bucket policies
  ../../scripts/validate-schema.sql       # Schema validation (repo root)
src/
  utils/
    permissions.js                      # Permission utilities
    userManagementService.js            # User management
    roleManagementService.js            # Role management
    projectCollaborationService.js      # Guest access
    projectDuplicationService.js        # Project duplication
    invitationService.js                # Invitation handling
  components/
    PermissionGuard.jsx                 # Permission-based rendering
    UserManagement.jsx                  # User management UI
    RoleManagement.jsx                  # Role management UI
    ProjectCollaborators.jsx            # Collaborator management UI
  context/
    AppContext.jsx                      # Global state (includes org)
apps/mobile/
  app/(auth)/invite/[token].js          # Mobile invitation handler
  utils/invitationService.js            # Mobile invitation service
```

---

## Environment Variables

### Web App
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Mobile App
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Demo Account

For App Store review:
- **Email:** demo@siteweave.app
- **Password:** DemoPassword123!
- **Organization:** SiteWeave Demo
- **Role:** Organization Admin (full permissions)

---

## Common Issues & Solutions

### Issue: User can't see data
**Check:**
1. User has `organization_id` set in profiles
2. User has `role_id` set in profiles
3. RLS is enabled on tables
4. User's role has required permissions

### Issue: Guest can't access project
**Check:**
1. User is in `project_collaborators` table
2. `access_level` is set correctly
3. Project has correct `organization_id`
4. RLS policy includes `has_project_access()` check

### Issue: Permission denied
**Check:**
1. User's role has the required permission in JSONB
2. Permission name matches exactly (e.g., `can_create_projects`)
3. Permission value is boolean `true` (not string "true")

---

## Testing Checklist

- [ ] Create organization
- [ ] Invite user to organization
- [ ] User accepts invitation and joins
- [ ] Create project in organization
- [ ] Add guest collaborator to project
- [ ] Guest can access project
- [ ] Guest cannot see other org projects
- [ ] Create custom role with limited permissions
- [ ] Assign user to custom role
- [ ] Verify user can only perform allowed actions
- [ ] Duplicate project with date shifting
- [ ] Upload file to project
- [ ] Verify file access respects org boundaries

---

## Quick Commands

### Create Organization (SQL)
```sql
INSERT INTO organizations (name, slug)
VALUES ('Company Name', 'company-slug')
RETURNING id;
```

### Create Role (SQL)
```sql
INSERT INTO roles (organization_id, name, permissions)
VALUES (
  '<org-id>',
  'Role Name',
  '{"can_create_projects": true}'::jsonb
)
RETURNING id;
```

### Assign User to Organization (SQL)
```sql
UPDATE profiles
SET organization_id = '<org-id>',
    role_id = '<role-id>'
WHERE id = '<user-id>';
```

### Add Project Collaborator (SQL)
```sql
INSERT INTO project_collaborators (project_id, user_id, organization_id, access_level)
VALUES ('<project-id>', '<user-id>', '<org-id>', 'editor');
```

---

## Resources

- **Full Implementation Guide:** `MULTI-TENANT-B2B-IMPLEMENTATION.md`
- **Deployment Guide:** `DEPLOYMENT-GUIDE-B2B.md`
- **Database Schema:** `../../schema.sql`
- **Migration Script:** `scripts/migrate-to-organizations.sql`

---

**Last Updated:** January 2026
**Version:** 1.0.0

