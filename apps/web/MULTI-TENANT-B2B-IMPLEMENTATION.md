# Multi-Tenant B2B Architecture Implementation

## Overview
Successfully refactored SiteWeave from a single-user (B2C) model to an Organization-based Multi-Tenant (B2B) model with strict data isolation, organization-scoped authentication, dynamic RBAC, and enhanced project management features.

## Implementation Status: ✅ COMPLETE

All core features have been implemented and are ready for testing and deployment.

---

## Key Features Implemented

### 1. Multi-Tenancy & Data Isolation
- ✅ Created `organizations` table as the root entity for multi-tenancy
- ✅ Added `organization_id` to all data tables (projects, contacts, tasks, files, etc.)
- ✅ Implemented Row Level Security (RLS) policies for automatic data filtering
- ✅ All queries automatically scoped to user's organization via RLS

### 2. Dynamic Roles & Permissions (RBAC)
- ✅ Created `roles` table with JSONB permissions column
- ✅ Replaced hardcoded role enums with dynamic role system
- ✅ Organization Admins can create/edit/delete custom roles
- ✅ Granular permissions: `can_create_tasks`, `can_delete_projects`, `can_manage_users`, etc.
- ✅ Permission utility functions for checking user permissions
- ✅ `PermissionGuard` component for conditional UI rendering

### 3. Guest Access for Subcontractors
- ✅ Created `project_collaborators` table
- ✅ Users can access specific projects without being organization members
- ✅ Three access levels: viewer, editor, admin
- ✅ RLS policies updated to allow access for org members OR project collaborators
- ✅ UI for managing project collaborators

### 4. Organization-Based Authentication
- ✅ Removed public sign-up functionality
- ✅ Invitation-based user onboarding
- ✅ Users linked to organizations via invitations
- ✅ Organization Admins can invite/create users
- ✅ Deep linking support for mobile invites (`siteweave://invite/:token`)

### 5. Project Duplication with Date Shifting
- ✅ Duplicate project structure (phases, tasks, settings)
- ✅ Automatic date shifting based on new start date
- ✅ Excludes transactional data (comments, files, activity logs)
- ✅ UI integrated into ProjectModal with date picker

### 6. Storage Security
- ✅ Updated storage bucket RLS policies
- ✅ Organization and guest access checks for file operations
- ✅ Helper function `has_storage_file_access()` for path-based access control

### 7. Demo Account for App Store Review
- ✅ Seed script for creating demo organization and user
- ✅ Sample projects and data for reviewers

---

## Database Schema Changes

### New Tables

#### `organizations`
```sql
- id (UUID, PK)
- name (TEXT)
- slug (TEXT, unique)
- created_at, updated_at (TIMESTAMP)
- created_by_user_id (UUID)
```

#### `roles`
```sql
- id (UUID, PK)
- organization_id (UUID, FK)
- name (TEXT)
- permissions (JSONB) -- Dynamic permissions
- is_system_role (BOOLEAN)
- created_at, updated_at (TIMESTAMP)
- UNIQUE(organization_id, name)
```

#### `project_collaborators`
```sql
- id (UUID, PK)
- project_id (UUID, FK)
- user_id (UUID, FK)
- organization_id (UUID, FK)
- invited_by_user_id (UUID, FK)
- access_level (TEXT) -- 'viewer', 'editor', 'admin'
- created_at (TIMESTAMP)
- UNIQUE(project_id, user_id)
```

### Updated Tables

#### `profiles`
- Changed `role` (TEXT enum) → `role_id` (UUID FK to roles)
- Added `organization_id` (UUID FK to organizations)
- Added `is_super_admin` (BOOLEAN)

#### All Data Tables
Added `organization_id` (UUID FK to organizations) to:
- projects, contacts, calendar_events, event_categories
- files, issue_comments, issue_files, issue_steps
- message_channels, messages, message_reactions
- typing_indicators, message_reads, channel_reads
- project_contacts, project_issues, project_phases
- tasks, activity_log, invitations

---

## RLS Helper Functions

### New Functions
```sql
- get_user_organization_id() → UUID
- is_organization_admin() → BOOLEAN
- is_project_collaborator(project_uuid) → BOOLEAN
- has_project_access(project_uuid) → BOOLEAN
- has_storage_file_access(file_path, bucket_name) → BOOLEAN
```

### Updated Policies
All RLS policies updated to:
1. Filter by `organization_id` for organization members
2. Allow guest access via `has_project_access()` for project collaborators
3. Check dynamic permissions via `roles.permissions` JSONB

---

## Frontend Changes

### New Components
- `UserManagement.jsx` - Manage team members (invite, create, remove)
- `RoleManagement.jsx` - Create and manage custom roles
- `ProjectCollaborators.jsx` - Manage guest access for projects
- `PermissionGuard.jsx` / `Can.jsx` - Conditional rendering based on permissions

### New Services
- `userManagementService.js` - User invitation and management
- `roleManagementService.js` - Role CRUD operations
- `projectCollaborationService.js` - Guest access management
- `projectDuplicationService.js` - Project duplication with date shifting
- `permissions.js` - Permission checking utilities

### Updated Services
- `invitationService.js` - Now organization-based with deep linking support

### Updated Context
- `AppContext.jsx` - Added `currentOrganization` and `userRole` to state
- Loads organization and role data on user login
- All data queries automatically filtered by RLS

### Updated UI
- `LoginForm.jsx` - Removed sign-up functionality
- `apps/mobile/app/(auth)/signup.js` - Disabled public sign-up
- `apps/mobile/app/(auth)/invite/[token].js` - Deep link invite handler
- `ProjectModal.jsx` - Added duplicate project button with date picker

---

## Migration & Deployment

### Migration Script
**File:** `scripts/migrate-to-organizations.sql`

**Steps:**
1. Create new tables (organizations, roles, project_collaborators)
2. Add `organization_id` columns (nullable initially)
3. Add foreign key constraints
4. Clean up orphaned data (fresh start approach)
5. Add NOT NULL constraints
6. Create indexes

**Note:** Fresh start approach - existing data will be deleted. No data migration needed for test clients.

### Demo Account Script
**File:** `scripts/seed-demo-account.sql`

Creates:
- Demo Organization ("SiteWeave Demo")
- Demo User (email: demo@siteweave.app)
- Organization Admin role with full permissions
- Sample projects for demonstration

**Usage:** Provide demo credentials to App Store reviewers

### Storage Policies Script
**File:** `scripts/setup-storage-policies.sql`

Updates storage bucket RLS policies to:
- Check organization membership
- Check project collaborator status
- Enforce access levels (viewer/editor/admin)

---

## Deployment Checklist

### Database
- [ ] Run `../../schema.sql` to create fresh database with multi-tenant structure
- [ ] OR run `scripts/migrate-to-organizations.sql` to migrate existing database
- [ ] Run `scripts/seed-demo-account.sql` to create demo account
- [ ] Run `scripts/setup-storage-policies.sql` to update storage security

### Backend
- [ ] Verify Supabase RLS policies are enabled
- [ ] Test organization isolation (users can't see other org data)
- [ ] Test guest access (project collaborators can access specific projects)
- [ ] Test dynamic permissions (custom roles work correctly)

### Frontend
- [ ] Deploy updated web app
- [ ] Build and deploy mobile app with deep linking
- [ ] Verify invitation flow (email → sign up → join organization)
- [ ] Test project duplication with date shifting
- [ ] Test user management (invite, create, remove users)
- [ ] Test role management (create, edit, delete roles)

### App Store
- [ ] Update app description to reflect B2B model
- [ ] Provide demo account credentials in reviewer notes
- [ ] Test demo account flow

---

## Remaining Tasks (Optional Enhancements)

### 1. Wrap Action Buttons with PermissionGuard
**Status:** Pending (not critical for MVP)

Wrap all delete/edit/create buttons throughout the app with `<PermissionGuard permission="can_xxx">` to hide buttons when user lacks permission.

**Example:**
```jsx
<PermissionGuard permission="can_delete_projects">
  <button onClick={handleDelete}>Delete</button>
</PermissionGuard>
```

**Files to update:**
- All components with action buttons (DashboardView, ProjectDetail, TaskList, etc.)

### 2. Explicit organization_id Filters
**Status:** Pending (not critical - RLS handles this)

While RLS automatically filters queries by `organization_id`, adding explicit filters improves code clarity and provides defense in depth.

**Example:**
```javascript
// Before
const { data } = await supabase.from('projects').select('*');

// After
const { data } = await supabase
  .from('projects')
  .select('*')
  .eq('organization_id', organizationId);
```

**Note:** This is optional as RLS policies already enforce organization filtering.

---

## Testing Recommendations

### Unit Tests
- Test RLS policies with different user roles
- Test permission checking functions
- Test project duplication date shifting logic

### Integration Tests
- Test invitation flow (send → accept → user joins organization)
- Test guest access (add collaborator → verify project access)
- Test data isolation (create data in org A, verify org B can't see it)

### E2E Tests
- Test complete user onboarding flow
- Test organization admin workflow (invite users, assign roles)
- Test project duplication workflow

---

## Security Considerations

### Data Isolation
- ✅ RLS policies enforce organization-level data isolation
- ✅ All queries automatically filtered by `organization_id`
- ✅ Guest access controlled via `project_collaborators` table
- ✅ Storage bucket policies respect organization boundaries

### Authentication
- ✅ Public sign-up disabled
- ✅ Invitation-based onboarding only
- ✅ Email verification required (Supabase default)

### Authorization
- ✅ Dynamic RBAC with JSONB permissions
- ✅ Permission checks at database level (RLS) and application level (utilities)
- ✅ Organization Admins can only manage their own organization

### Storage
- ✅ File access controlled by organization membership
- ✅ Guest access supported for project-specific files
- ✅ Path-based access control via `has_storage_file_access()`

---

## Support & Maintenance

### Common Issues

**Issue:** User can't see any data after login
**Solution:** Verify user has `organization_id` set in profiles table

**Issue:** Invitation link doesn't work
**Solution:** Check invitation hasn't expired and status is 'pending'

**Issue:** Permission denied errors
**Solution:** Verify user's role has required permissions in JSONB column

**Issue:** Storage files not accessible
**Solution:** Verify storage policies are updated and file paths include organization_id

### Database Maintenance

**Orphaned Data Cleanup:**
```sql
-- Find users without organizations
SELECT * FROM profiles WHERE organization_id IS NULL;

-- Find invitations older than 30 days
SELECT * FROM invitations 
WHERE created_at < NOW() - INTERVAL '30 days' 
AND status = 'pending';
```

**Performance Monitoring:**
- Monitor RLS policy performance (add indexes if needed)
- Monitor organization size (large orgs may need sharding)
- Monitor storage bucket usage per organization

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        SiteWeave B2B                         │
│                    Multi-Tenant Architecture                 │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐
│ Super Admin  │ (Creates Organizations)
└──────┬───────┘
       │
       ├─────────────────────────────────────────────────┐
       │                                                 │
┌──────▼──────────┐                          ┌──────────▼──────┐
│ Organization A  │                          │ Organization B  │
│  (Construction) │                          │  (Renovation)   │
└──────┬──────────┘                          └──────┬──────────┘
       │                                            │
       ├─ Org Admin (manages users & roles)        ├─ Org Admin
       ├─ Project Manager                          ├─ Site Supervisor
       ├─ Site Supervisor                          ├─ Team Member
       │                                            │
       ├─ Projects ──────────────────┐             ├─ Projects
       │  ├─ Project 1                │             │  ├─ Project X
       │  │  ├─ Tasks                 │             │  │  ├─ Tasks
       │  │  ├─ Files                 │             │  │  ├─ Files
       │  │  └─ Collaborators ────────┼─────────┐   │  │  └─ Collaborators
       │  │     (Guest Access)        │         │   │  │
       │  └─ Project 2                │         │   │  └─ Project Y
       │                               │         │   │
       └─ Contacts                     │         │   └─ Contacts
                                       │         │
                                       │         │
                              ┌────────▼─────────▼────┐
                              │  Subcontractor User   │
                              │  (Guest Access)       │
                              │  - Project 1 (Org A)  │
                              │  - Project Y (Org B)  │
                              └───────────────────────┘

Data Isolation: RLS policies ensure Organization A cannot see Organization B's data
Guest Access: Subcontractors can access specific projects across organizations
Dynamic Roles: Each organization defines custom roles with granular permissions
```

---

## Conclusion

The multi-tenant B2B architecture has been successfully implemented with:
- ✅ Complete data isolation between organizations
- ✅ Dynamic role-based access control
- ✅ Guest access for subcontractors
- ✅ Organization-based user management
- ✅ Project duplication with date shifting
- ✅ Secure storage with organization boundaries
- ✅ Mobile deep linking for invitations
- ✅ Demo account for app store review

**Status:** Ready for testing and deployment

**Next Steps:**
1. Deploy database schema updates
2. Deploy frontend applications
3. Test invitation and onboarding flows
4. Submit to App Store with demo credentials
5. Monitor for issues and optimize as needed

