---
name: Multi-Tenant B2B Architecture
overview: Refactor from single-user B2C to Organization-based multi-tenant B2B model with strict data isolation, organization-scoped authentication, RBAC, and project duplication features.
todos:
  - id: db-schema-orgs
    content: Create organizations table and add organization_id to all data tables in schema.sql (repository root)
    status: completed
  - id: db-migration-script
    content: Create migration script (scripts/migrate-to-organizations.sql) to add organization_id columns and handle data migration
    status: completed
    dependencies:
      - db-schema-orgs
  - id: rls-helper-functions
    content: Update RLS helper functions (get_user_organization_id, is_organization_admin) in schema.sql (repository root)
    status: completed
    dependencies:
      - db-schema-orgs
  - id: rls-policies-update
    content: Update all RLS policies in schema.sql (repository root) to filter by organization_id
    status: completed
    dependencies:
      - rls-helper-functions
  - id: remove-public-signup
    content: Remove public sign-up UI from LoginForm.jsx and mobile signup.js
    status: completed
  - id: update-invitations
    content: Update invitationService.js to include organization_id in invitations
    status: completed
    dependencies:
      - db-schema-orgs
  - id: user-management-service
    content: Create userManagementService.js for Organization Admins to invite/create users
    status: completed
    dependencies:
      - db-schema-orgs
      - rls-policies-update
  - id: user-management-ui
    content: Create UserManagement.jsx component for Organization Admins to manage team members
    status: completed
    dependencies:
      - user-management-service
  - id: permissions-utility
    content: Create permissions.js utility with RBAC permission checks
    status: completed
    dependencies:
      - db-schema-orgs
  - id: permission-guard-component
    content: Create PermissionGuard/Can component to conditionally render UI based on permissions
    status: completed
    dependencies:
      - permissions-utility
      - appcontext-organization
  - id: update-ui-with-permission-guards
    content: Wrap all action buttons (Delete, Edit, Create) with PermissionGuard components
    status: cancelled
    dependencies:
      - permission-guard-component
  - id: deep-linking-mobile-invites
    content: Configure deep linking for mobile invites (siteweave://invite/:token)
    status: completed
    dependencies:
      - update-invitations
  - id: create-roles-table
    content: Create roles table with organization_id and permissions JSONB column in schema.sql (repository root)
    status: completed
    dependencies:
      - db-schema-orgs
  - id: update-profiles-role-id
    content: Update profiles table to use role_id (UUID) instead of role (TEXT enum)
    status: completed
    dependencies:
      - create-roles-table
  - id: create-project-collaborators-table
    content: Create project_collaborators table for guest access (subcontractors) in schema.sql (repository root)
    status: completed
    dependencies:
      - db-schema-orgs
  - id: update-rls-guest-access
    content: Update RLS policies to include guest access checks (has_project_access function)
    status: completed
    dependencies:
      - create-project-collaborators-table
      - rls-helper-functions
  - id: project-duplication-service
    content: Create projectDuplicationService.js with date shifting logic (accept newStartDate, shift all dates)
    status: completed
    dependencies:
      - db-schema-orgs
  - id: project-duplication-ui
    content: Add duplicate project button and UI in ProjectModal or project detail view
    status: completed
    dependencies:
      - project-duplication-service
  - id: appcontext-organization
    content: Update AppContext.jsx to include currentOrganization and filter queries by organization_id
    status: completed
    dependencies:
      - db-schema-orgs
      - rls-policies-update
  - id: update-all-queries
    content: Update all Supabase queries throughout the app to include organization_id filter
    status: cancelled
    dependencies:
      - appcontext-organization
  - id: update-storage-policies
    content: Update storage bucket RLS policies to respect organization and guest access
    status: completed
    dependencies:
      - update-rls-guest-access
  - id: create-demo-seed-script
    content: Create seed-demo-account.sql script for App Store reviewers (Demo Organization and User)
    status: completed
    dependencies:
      - db-schema-orgs
      - create-roles-table
---

# Multi-Tenant

B2B Architecture Refactoring Plan

## Overview

Transform SiteWeave from a single-user (B2C) model to an Organization-based Multi-Tenant (B2B) model with strict data isolation, organization-scoped authentication, and enhanced project management features.

## Key Architectural Changes (Construction Industry Context)

### 1. Dynamic Roles System

- **Replaces:** Hardcoded role enums
- **Implementation:** `roles` table with `organization_id` and `permissions` JSONB column
- **Benefit:** Each construction company can define custom roles (e.g., "Site Supervisor", "Project Manager") with granular permissions
- **Management:** Organization Admins can create/edit/delete custom roles and assign them to users

### 2. Guest Access for Subcontractors

- **Replaces:** Forced organization membership for all users
- **Implementation:** `project_collaborators` table allowing users to access specific projects without being organization members
- **Benefit:** Subcontractors can work across multiple construction companies without joining each organization
- **RLS:** Policies updated to allow access if user is org member OR project collaborator

### 3. Enhanced Project Duplication with Date Shifting

- **Replaces:** Simple copy with old dates
- **Implementation:** Duplication function accepts `newStartDate` parameter and shifts all dates (tasks, phases, project) by calculated delta
- **Benefit:** Creates realistic project templates with proper timelines for construction scheduling
- **Logic:** Calculate delta between original start date and new start date, shift all due_dates and phase dates forward

### 4. Demo Account & Storage Security

- **Implementation:** Seed script creates permanent "Demo Organization" and "Demo User" for App Store reviewers
- **Storage RLS:** Storage bucket policies updated to respect organization and guest access (not just database tables)
- **Benefit:** Enables App Store review process without public sign-up, ensures complete security across database and storage

### 5. Frontend Permission Guards

- **Problem:** UI shows buttons/actions that backend forbids, causing 403 errors
- **Implementation:** `<PermissionGuard>` component reads JSON permissions and conditionally renders UI
- **Benefit:** Prevents confusing errors, provides better UX by hiding unavailable actions
- **Usage:** Wrap action buttons with `<Can permission="delete_project">` to hide when user lacks permission

### 6. Deep Linking for Mobile Invites

- **Problem:** Invite links in email open browser on mobile instead of app
- **Implementation:** Configure `siteweave://invite/:token` deep links with Expo Router
- **Benefit:** Seamless experience for subcontractors clicking invite links on mobile devices
- **Configuration:** Update invitation emails to include deep link, handle route in mobile app

## Architecture Changes

### 1. Database Schema - Organization Entity

**New Table: `organizations`**

- `id` (UUID, primary key)
- `name` (TEXT, required)
- `slug` (TEXT, unique, for URL-friendly identifiers)
- `created_at` (TIMESTAMP)
- `created_by_user_id` (UUID, references auth.users)
- `updated_at` (TIMESTAMP)

**Add `organization_id` to all data tables:**

- `projects` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `contacts` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `calendar_events` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `files` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `project_issues` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `project_phases` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `tasks` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `message_channels` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `messages` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `message_reactions` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `typing_indicators` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `message_reads` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `channel_reads` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `project_contacts` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `issue_comments` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `issue_files` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `issue_steps` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `activity_log` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`
- `event_categories` - Add `organization_id UUID NOT NULL REFERENCES organizations(id)`

**Update `profiles` table:**

- Add `organization_id UUID REFERENCES organizations(id)` - NULLABLE for Super Admins and guests
- Change `role` to `role_id UUID REFERENCES roles(id)` - Dynamic role assignment
- Add `is_super_admin BOOLEAN DEFAULT false` - Flag for Super Admins
- Remove hardcoded role constraint (replaced by dynamic roles)

**Migration Strategy:**

- Create migration script: `scripts/migrate-to-organizations.sql`
- Since fresh start: Mark existing data as orphaned (set organization_id to NULL temporarily, then clean up)
- Add NOT NULL constraints after migration

### 2. Row Level Security (RLS) Updates

**New Tables for Guest Access:**

**New Table: `project_collaborators`**

- `id` (UUID, primary key)
- `project_id` (UUID, NOT NULL, references projects(id))
- `user_id` (UUID, NOT NULL, references auth.users(id))
- `organization_id` (UUID, NOT NULL, references organizations(id)) - The project's organization
- `invited_by_user_id` (UUID, references auth.users(id))
- `access_level` (TEXT, default 'viewer') - 'viewer', 'editor', 'admin'
- `created_at` (TIMESTAMP)
- Unique constraint: `(project_id, user_id)`

**New Helper Functions:**

```sql
-- Get current user's organization_id
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if user is Organization Admin (via role permissions)
CREATE OR REPLACE FUNCTION is_organization_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid() 
      AND r.permissions->>'can_manage_users' = 'true'
      AND r.is_system_role = true
      AND r.name = 'OrganizationAdmin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if user is project collaborator (guest access)
CREATE OR REPLACE FUNCTION is_project_collaborator(project_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_collaborators
    WHERE project_id = project_uuid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if user has access to project (org member OR collaborator)
CREATE OR REPLACE FUNCTION has_project_access(project_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    -- User is organization member
    SELECT 1 FROM public.projects p
    JOIN public.profiles pf ON p.organization_id = pf.organization_id
    WHERE p.id = project_uuid AND pf.id = auth.uid()
  ) OR EXISTS (
    -- User is project collaborator (guest)
    SELECT 1 FROM public.project_collaborators
    WHERE project_id = project_uuid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

**Update All RLS Policies:**

- Replace `organization_id = get_user_organization_id()` with access check:
  - `has_project_access(project_id)` for project-scoped data
  - `organization_id = get_user_organization_id() OR is_project_collaborator(...)` for organization-scoped data
- Ensure Organization Admins can manage all data within their organization
- Standard Users can only access data in their organization
- Guest users (project collaborators) can only access specific projects they're invited to

**Files to Update:**

- `schema.sql (repository root)` - Update all RLS policies (lines 830-1946)

### 3. Authentication & User Provisioning

**Remove Public Sign-Up:**

- `src/components/LoginForm.jsx` - Remove sign-up UI and `handleSignUp` function
- `apps/mobile/app/(auth)/signup.js` - Disable or remove sign-up screen
- `src/views/AcceptInvitationView.jsx` - Keep for invitation-based sign-up only

**Super Admin Workflow:**

- Super Admins created manually via database/admin panel
- Super Admin can create Organizations via admin interface
- When creating Organization, Super Admin becomes first Organization Admin

**Organization Admin User Management:**

- Create new component: `src/components/UserManagement.jsx`
- Organization Admins can:
- Invite users by email (creates invitation)
- Create user accounts directly
- Assign roles (OrganizationAdmin or StandardUser)
- Remove users from organization
- New utility: `src/utils/userManagementService.js`

**Invitation System Updates:**

- Update `src/utils/invitationService.js`
- Invitations must include `organization_id`
- On acceptance, user is assigned to organization
- Remove project-specific invitations (users join organization, not individual projects)

**Deep Linking for Mobile Invites:**

- **Problem:** When subcontractors click invite links in email on mobile, they open in browser instead of app
- **Solution:** Configure deep linking so `siteweave://invite/:token` opens the mobile app
- **Implementation:**
  - Mobile app already has scheme `siteweave` configured in `app.json` and `app.config.js`
  - Update invitation email links to use deep link format: `siteweave://invite/:token`
  - Configure Expo Router to handle `/invite/:token` route in mobile app
  - Update `apps/mobile/app/(auth)/invite/[token].js` or create new route handler
  - Handle both web (https://app.siteweave.com/invite/:token) and mobile (siteweave://invite/:token) formats
  - Use `expo-linking` (already installed) to handle deep link navigation
  - Test deep linking on both iOS and Android

**Deep Link Configuration:**

- **iOS:** Add URL scheme to `Info.plist` (handled by Expo `scheme` config)
- **Android:** Add intent filter to `AndroidManifest.xml` (handled by Expo)
- **Email Links:** Update invitation service to generate both web and mobile deep links
- **Fallback:** If app not installed, redirect to web version or app store

**Files to Create/Update:**

- Update: `src/utils/invitationService.js` - Generate deep link URLs for mobile
- Create/Update: `apps/mobile/app/(auth)/invite/[token].js` - Handle deep link invite route
- Update: `apps/mobile/app.config.js` - Verify scheme configuration (already set to "siteweave")
- Update: `apps/mobile/app.json` - Verify scheme configuration
- Create: `apps/mobile/utils/linking.js` - Deep link handling utilities (if needed)

**Files to Update:**

- `src/components/LoginForm.jsx` - Remove sign-up
- `apps/mobile/app/(auth)/signup.js` - Disable
- `src/utils/invitationService.js` - Add organization_id
- `src/views/AcceptInvitationView.jsx` - Update for organization-based invitations
- Create: `src/components/UserManagement.jsx`
- Create: `src/utils/userManagementService.js`

### 4. RBAC Implementation - Dynamic Roles

**Dynamic Roles System (Construction Industry Context):**

Instead of hardcoded role enums, implement a flexible role system where each Organization can define custom roles with granular permissions.

**New Table: `roles`**

- `id` (UUID, primary key)
- `organization_id` (UUID, NOT NULL, references organizations(id))
- `name` (TEXT, required) - e.g., "Project Manager", "Site Supervisor", "Accountant"
- `permissions` (JSONB, required) - Flexible permission structure
  - Example: `{ "can_create_tasks": true, "can_view_financials": false, "can_manage_users": false, "can_delete_projects": false }`
- `is_system_role` (BOOLEAN, default false) - System roles (SuperAdmin, OrganizationAdmin) cannot be modified
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)
- Unique constraint: `(organization_id, name)`

**Update `profiles` table:**

- Change `role` from TEXT enum to `role_id UUID REFERENCES roles(id)`
- Keep `organization_id` for direct access
- Add `is_super_admin` (BOOLEAN, default false) - Only for Super Admins
- Remove hardcoded role constraint

**System Roles (Created by Migration):**

- `SuperAdmin` - System role (is_system_role = true, organization_id = NULL)
- `OrganizationAdmin` - Created per organization with full permissions
- Default roles can be seeded per organization

**Permission Structure (JSONB):**

```json
{
  "can_create_tasks": true,
  "can_view_financials": false,
  "can_manage_users": false,
  "can_delete_projects": false,
  "can_assign_tasks": true,
  "can_view_reports": true,
  "can_manage_contacts": true,
  "can_create_projects": true,
  "can_edit_projects": true,
  "can_delete_projects": false
}
```

**Permission Checks:**

- Create utility: `src/utils/permissions.js`
- Functions:
  - `getUserRole(userId, organizationId)` - Get user's role with permissions
  - `hasPermission(userId, permission, organizationId)` - Check specific permission
  - `canManageUsers(userId, organizationId)` - Check if user can manage team
  - `canManageProjects(userId, organizationId)` - Check if user can manage projects
  - `canCreateProjects(userId, organizationId)` - Check if user can create projects

**Frontend Permission Guard Component:**

- Create: `src/components/PermissionGuard.jsx` (or `Can.jsx`)
- Purpose: Conditionally render UI elements based on user permissions
- Prevents UI elements from showing when user lacks permission (avoids 403 errors)
- Usage: `<PermissionGuard permission="can_delete_projects"><button>Delete</button></PermissionGuard>`
- Implementation:
  - Reads user's role permissions from AppContext
  - Checks JSONB permissions object for specific permission key
  - Returns `null` if permission is false, otherwise renders children
  - Handles loading states while permissions are being fetched
- Alternative naming: `<Can permission="delete_project">` for cleaner API

**Files to Create/Update:**

- Create: `src/components/PermissionGuard.jsx` - Reusable permission-based rendering component
- Create: `src/components/Can.jsx` - Alias/wrapper for PermissionGuard (optional, cleaner API)
- Update: All components with action buttons (Delete, Edit, Create) - Wrap with PermissionGuard
- Update: `src/context/AppContext.jsx` - Ensure user role and permissions are loaded and available

**Organization Admin Role Management:**

- Organization Admins can create/edit/delete custom roles for their organization
- Organization Admins can assign roles to users
- System roles (SuperAdmin, OrganizationAdmin) cannot be deleted or modified

**Files to Create/Update:**

- Create: `src/utils/permissions.js` - Dynamic permission checking
- Create: `src/utils/roleManagementService.js` - Role CRUD operations
- Create: `src/components/RoleManagement.jsx` - UI for managing roles
- Update: `schema.sql (repository root)` - Create roles table, update profiles.role to role_id
- Update: All components that check user roles - Use permission utility instead

### 5. Project Duplication Feature with Date Shifting

**Implementation:**

- Create utility: `src/utils/projectDuplicationService.js`
- Function: `duplicateProject(projectId, newName, organizationId, newStartDate)`

**Date Shifting Logic:**

- Accept `newStartDate` parameter (Date object or ISO string)
- Calculate original project start date:
  - Use `created_at` as baseline, or
  - Use earliest `due_date` from tasks/phases, or
  - Use project `due_date` minus estimated duration
- Calculate delta: `newStartDate - originalStartDate`
- Shift all dates forward by delta:
  - Task `due_date` values
  - Phase dates (if stored)
  - Project `due_date`
  - Calendar events (if included in duplication)

**What to Copy:**

- Project metadata (name, address, status, project_type, milestones, color)
- Project phases (structure only, reset progress to 0, budget to 0, shift dates)
- Task lists (structure only, mark all as incomplete, clear assignees, shift due_dates)
- Project settings and configuration
- **Date-shifted timeline** based on new_start_date

**What to Exclude (Transactional Data):**

- Comments (`issue_comments`)
- Activity logs (`activity_log`)
- Messages (`messages`, `message_reactions`, `typing_indicators`, `message_reads`, `channel_reads`)
- Uploaded files (`files`)
- Completed tasks (mark all tasks as incomplete)
- Issue history (`project_issues`, `issue_steps`, `issue_files`)
- Calendar events (`calendar_events`) - Excluded, but structure can be recreated with shifted dates

**UI Integration:**

- Add "Duplicate Project" or "Create from Template" button in `src/components/ProjectModal.jsx` or project detail view
- Show dialog with:
  - New project name (default: "[Original Name] - Copy")
  - New start date picker (required)
  - Options checklist (what to copy)
- Create new project with shifted dates

**Files to Create/Update:**

- Create: `src/utils/projectDuplicationService.js` - Include date shifting logic
- Update: `src/components/ProjectModal.jsx` or project detail component
- Update: `src/views/DashboardView.jsx` - Add duplicate action with date picker

### 6. Frontend Context Updates

**AppContext Changes:**

- Add `currentOrganization` to state
- Load organization data on user login
- Filter all queries by `organization_id`
- Update all Supabase queries to include organization filter

**Files to Update:**

- `src/context/AppContext.jsx` - Add organization context
- All components that query Supabase - Add `.eq('organization_id', organizationId)` filter

### 7. Data Migration Script

**Migration Script:**

- Create: `scripts/migrate-to-organizations.sql`
- Steps:

1. Create `organizations` table
2. Add `organization_id` columns to all tables (nullable initially)
3. Create default organization for existing data (if needed, or mark as orphaned)
4. Update foreign key constraints
5. Update RLS policies
6. Add NOT NULL constraints after data migration

**Files to Create:**

- `scripts/migrate-to-organizations.sql`
- `scripts/seed-demo-account.sql` - Demo Organization and User for App Store reviewers

## Implementation Order

1. **Phase 1: Database Schema** (Foundation)

- Create organizations table
- Add organization_id columns
- Update foreign keys
- Create migration script

2. **Phase 2: RLS Policies** (Security)

- Update helper functions
- Update all RLS policies
- Test data isolation

3. **Phase 3: Authentication** (Access Control)

- Remove public sign-up
- Update invitation system
- Create user management components

4. **Phase 4: RBAC** (Permissions)

- Implement permission utilities
- Update role checks throughout app
- Add Organization Admin UI

5. **Phase 5: Project Duplication** (Feature)

- Implement duplication service
- Add UI components
- Test duplication logic

6. **Phase 6: Frontend Integration** (Polish)

- Update AppContext
- Update all queries
- Add organization selector (if multi-org support needed)

## Key Files to Modify

**Database:**

- `schema.sql (repository root)` - Add organizations table, roles table, project_collaborators table, update all tables, update RLS policies
- `scripts/migrate-to-organizations.sql` - Migration script
- `scripts/seed-demo-account.sql` - Demo account for App Store reviewers
- `scripts/setup-storage-policies.sql` - Update storage bucket RLS policies

**Backend/Utils:**

- `src/utils/userManagementService.js` - New file for user management
- `src/utils/permissions.js` - New file for dynamic RBAC permission checks
- `src/utils/roleManagementService.js` - New file for role CRUD operations
- `src/utils/projectDuplicationService.js` - New file for project duplication with date shifting
- `src/utils/invitationService.js` - Update for organization-based invitations
- `src/utils/projectCollaborationService.js` - New file for managing guest access (project collaborators)

**Components:**

- `src/components/LoginForm.jsx` - Remove sign-up
- `src/components/UserManagement.jsx` - New component for managing team members
- `src/components/RoleManagement.jsx` - New component for managing custom roles
- `src/components/ProjectModal.jsx` - Add duplicate functionality with date picker
- `src/components/ProjectCollaborators.jsx` - New component for managing guest access
- `src/components/PermissionGuard.jsx` - New component for conditional rendering based on permissions
- `src/components/Can.jsx` - Alias/wrapper for PermissionGuard (optional, cleaner API)
- `src/context/AppContext.jsx` - Add organization context and user permissions

**Views:**

- `src/views/DashboardView.jsx` - Add duplicate project action
- `src/views/AcceptInvitationView.jsx` - Update for organization invitations

**Mobile:**

- `apps/mobile/app/(auth)/signup.js` - Disable sign-up
- `apps/mobile/app/(auth)/invite/[token].js` - Create/update deep link invite handler
- `apps/mobile/app.config.js` - Verify deep linking scheme configuration
- `apps/mobile/utils/linking.js` - Deep link utilities (if needed)

## Testing Considerations

1. **Data Isolation:** Verify users in Organization A cannot see data from Organization B
2. **Guest Access:** Test project collaborators can access specific projects but not other org data
3. **Dynamic RBAC:** Test custom roles with different permission combinations
4. **Project Duplication:** Verify transactional data is excluded and dates are shifted correctly
5. **Date Shifting:** Verify all dates (tasks, phases, project) shift correctly by delta
6. **Storage Security:** Verify storage bucket policies respect organization and guest access
7. **Invitations:** Test organization-based invitation flow
8. **Demo Account:** Verify demo account works for App Store reviewers
9. **Permission Guards:** Verify UI elements are hidden when user lacks permissions (no 403 errors)
10. **Deep Linking:** Test invite links open mobile app on iOS and Android devices

### 8. Storage Bucket RLS Policies

**Storage Security Updates:**

Storage buckets must respect Organization and Guest access rules, not just database tables.

**Update Storage Policies:**

- Update `scripts/setup-storage-policies.sql`
- Add organization and project collaborator checks to storage policies
- Buckets: `message_files`, `files`, and any other storage buckets

**New Storage Helper Functions:**

```sql
-- Check if user has access to file via project (org member OR collaborator)
CREATE OR REPLACE FUNCTION has_file_access(file_path TEXT, bucket_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  project_uuid UUID;
  file_org_id UUID;
BEGIN
  -- Extract project_id from file path or metadata
  -- This depends on your file path structure
  -- Example: files/{organization_id}/{project_id}/filename.ext
  
  -- Check if user is org member OR project collaborator
  RETURN has_project_access(project_uuid) OR 
         file_org_id = get_user_organization_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Storage Policy Updates:**

- **SELECT Policy:** Users can read files if:
  - They are organization members AND file belongs to their organization, OR
  - They are project collaborators for the project the file belongs to

- **INSERT Policy:** Users can upload files if:
  - They are organization members AND uploading to their organization's projects, OR
  - They are project collaborators with 'editor' or 'admin' access level

- **DELETE Policy:** Users can delete files if:
  - They are organization admins, OR
  - They are project collaborators with 'admin' access level, OR
  - They uploaded the file themselves

**Files to Update:**

- `scripts/setup-storage-policies.sql` - Add organization and collaborator checks
- `docs/storage-setup.md` - Update documentation

### 9. Demo Account Seed Script

**App Store Review Requirements:**

Since public sign-up is removed, create a permanent demo account for Apple/Google reviewers.

**Seed Script: `scripts/seed-demo-account.sql`**

- Create "Demo Organization" (name: "SiteWeave Demo", slug: "demo")
- Create demo user account:
  - Email: `demo@siteweave.app` (or configurable)
  - Password: Set via Supabase Auth API (or provide reset link)
  - Role: OrganizationAdmin with full permissions
- Create sample projects, tasks, phases for demonstration
- Mark as permanent (do not delete on cleanup)

**Demo Account Credentials:**

- Store credentials securely (environment variable or secure note)
- Provide to reviewers in App Store submission notes
- Consider creating a dedicated "Reviewer Guide" document

**Files to Create:**

- `scripts/seed-demo-account.sql` - Demo organization and user creation
- `REVIEWER_GUIDE.md` - Instructions for App Store reviewers (if needed)

## Notes

- Fresh start approach means existing data will be orphaned (simplifies migration)
- Super Admins created manually (no UI for this initially)
- Dynamic roles allow each construction company to customize workflows
- Guest access enables subcontractors to work across multiple organizations
- Date shifting in project duplication ensures realistic project timelines
- Storage policies must match database RLS for complete security