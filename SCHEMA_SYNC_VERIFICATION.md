# Schema Synchronization Verification

## Source of Truth
**Root `schema.sql`** is the **single source of truth** for the database schema.

## Canonical Schema File
The repo maintains a single schema file at the repository root:

### ✅ Table Definitions
- `project_contacts` table includes `organization_id UUID NOT NULL` column
- Foreign key constraint `fk_project_contacts_organization_id` exists

### ✅ Helper Functions
- `get_user_organization_id()` - Returns user's organization_id
- `get_user_role()` - Handles both old TEXT role and new role_id system
- `get_user_contact_id()` - Returns user's contact_id
- `get_user_email()` - Returns user's email
- `is_user_admin()` - Checks both is_super_admin flag and role name
- `is_current_user_admin()` - Backward compatibility function
- `user_has_permission()` - Checks specific permissions

### ✅ Triggers
- `handle_new_user()` - Auto-creates profile on user signup
- `auto_add_project_creator()` - Auto-adds creator to project_contacts
- `trigger_auto_add_project_creator` - Trigger on projects table

### ✅ RLS Policies - Projects Table
- SELECT: "Users can see projects in their organization" (with org isolation)
- INSERT: "Users can create projects in their organization"
- UPDATE: "Admins and PMs can update projects in their organization"
- DELETE: "Admins, PMs, and creators can delete projects in their organization"

### ✅ RLS Policies - Project_Contacts Table
- SELECT: "Users can see project contacts in their organization"
- INSERT: "Admins and PMs can assign contacts in their organization"
- UPDATE: "Admins and PMs can update project contacts in their organization"
- DELETE: "Admins and PMs can remove project contacts in their organization"

## File Verified
1. ✅ `schema.sql` (repository root) - Source of truth

## Key Features Implemented
- ✅ Organization isolation enforced in all policies
- ✅ Admins can see all projects in their org (even if not explicitly added)
- ✅ Creators automatically added to project_contacts via trigger
- ✅ Both old TEXT role and new role_id systems supported
- ✅ Admin detection works with both is_super_admin flag and role name

## No Conflicts
Use the root `schema.sql` as the master reference for any future schema changes. Incremental updates ship via `supabase/migrations/`.
