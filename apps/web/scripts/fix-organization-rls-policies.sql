-- Fix RLS Policies for Organization Isolation
-- This script adds organization_id checks to all policies to prevent cross-organization data access
-- CRITICAL SECURITY FIX: Users were seeing projects from other organizations!

-- ============================================================================
-- STEP 1: ADD HELPER FUNCTION FOR ORGANIZATION ID
-- ============================================================================

-- Get the organization_id of the currently logged-in user
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update get_user_role to work with both old TEXT role and new role_id system
-- Returns the role name, checking role_id first, then falling back to TEXT role field
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    -- Try new role_id system first
    (SELECT r.name 
     FROM public.profiles p
     LEFT JOIN public.roles r ON p.role_id = r.id
     WHERE p.id = auth.uid()),
    -- Fallback to old TEXT role field
    (SELECT role::TEXT 
     FROM public.profiles 
     WHERE id = auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper to check if user is admin (checks both is_super_admin flag and role name)
CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    false
  ) OR get_user_role() = 'Admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper to check if user has a specific permission
CREATE OR REPLACE FUNCTION user_has_permission(permission_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (r.permissions->permission_name)::boolean,
    false
  )
  FROM public.profiles p
  LEFT JOIN public.roles r ON p.role_id = r.id
  WHERE p.id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- STEP 2: UPDATE PROJECTS TABLE POLICIES WITH ORGANIZATION CHECKS
-- ============================================================================

-- Drop ALL existing projects policies (comprehensive cleanup)
-- This ensures no conflicts regardless of how policies were created
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'projects' AND schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.projects', r.policyname);
  END LOOP;
END $$;

-- Projects SELECT policy - WITH ORGANIZATION ISOLATION
CREATE POLICY "Users can see projects in their organization"
ON public.projects
FOR SELECT
USING (
  -- CRITICAL: Must be in same organization
  organization_id = get_user_organization_id()
  AND (
    -- Admin can see ALL projects in their org (even if not explicitly added)
    is_user_admin()
    OR
    -- PMs see their assigned projects
    (project_manager_id = auth.uid())
    OR
    -- Creators see projects they created
    (created_by_user_id = auth.uid())
    OR
    -- Team members see projects they're linked to via project_contacts
    (id IN (
      SELECT project_id
      FROM public.project_contacts
      WHERE contact_id = get_user_contact_id()
        AND organization_id = get_user_organization_id()
    ))
    OR
    -- Guest collaborators see projects they're invited to
    (id IN (
      SELECT project_id
      FROM public.project_collaborators
      WHERE user_id = auth.uid()
    ))
  )
);

-- Projects INSERT policy - must set organization_id to user's org
CREATE POLICY "Users can create projects in their organization"
ON public.projects
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND organization_id = get_user_organization_id()
);

-- Projects UPDATE policy - can only update projects in their org
CREATE POLICY "Admins and PMs can update projects in their organization"
ON public.projects
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND (
    is_user_admin()
    OR
    (project_manager_id = auth.uid())
    OR (
      user_has_permission('can_edit_projects')
      AND id IN (SELECT get_accessible_project_ids())
    )
  )
)
WITH CHECK (
  organization_id = get_user_organization_id()
  AND (
    is_user_admin()
    OR
    (project_manager_id = auth.uid())
    OR (
      user_has_permission('can_edit_projects')
      AND id IN (SELECT get_accessible_project_ids())
    )
  )
);

-- Projects DELETE policy - can only delete projects in their org
CREATE POLICY "Admins, PMs, and creators can delete projects in their organization"
ON public.projects
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND (
    is_user_admin()
    OR
    (project_manager_id = auth.uid())
    OR
    (created_by_user_id = auth.uid())
  )
);

-- ============================================================================
-- STEP 3: UPDATE CONTACTS TABLE POLICIES
-- ============================================================================

-- Drop ALL existing contacts policies (comprehensive cleanup)
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'contacts' AND schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.contacts', r.policyname);
  END LOOP;
END $$;

-- Contacts SELECT - only see contacts in their organization
CREATE POLICY "Users can view contacts in their organization"
ON public.contacts
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  OR
  -- Allow viewing own contact even if it's in a different org (for collaborators)
  (LOWER(email) = LOWER(get_user_email()))
);

-- Contacts INSERT - must create in their organization
CREATE POLICY "Users can create contacts in their organization"
ON public.contacts
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
);

-- Contacts UPDATE - can only update contacts in their org
CREATE POLICY "Admins and PMs can update contacts in their organization"
ON public.contacts
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND (is_user_admin() OR get_user_role() = 'PM')
);

-- Contacts DELETE - can only delete contacts in their org
CREATE POLICY "Admins can delete contacts in their organization"
ON public.contacts
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND is_user_admin()
);

-- ============================================================================
-- STEP 4: UPDATE PROJECT_CONTACTS TABLE POLICIES
-- ============================================================================

-- Drop ALL existing project_contacts policies (comprehensive cleanup)
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'project_contacts' AND schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.project_contacts', r.policyname);
  END LOOP;
END $$;

-- Project contacts SELECT - only for projects in their org
CREATE POLICY "Users can see project contacts in their organization"
ON public.project_contacts
FOR SELECT
USING (
  organization_id = get_user_organization_id()
);

-- Project contacts INSERT - must be in same org
CREATE POLICY "Admins and PMs can assign contacts in their organization"
ON public.project_contacts
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND (
    -- Admins can add any contact in their organization
    (is_user_admin() AND contact_id IN (
      SELECT id FROM public.contacts 
      WHERE organization_id = get_user_organization_id()
    ))
    OR
    -- PMs can add contacts to their projects
    (project_id IN (
      SELECT id FROM public.projects
      WHERE project_manager_id = auth.uid()
        AND organization_id = get_user_organization_id()
    ))
    OR
    -- Allow users to add themselves to projects they created
    (project_id IN (
      SELECT id FROM public.projects
      WHERE created_by_user_id = auth.uid()
        AND organization_id = get_user_organization_id()
    ) AND contact_id = get_user_contact_id())
  )
);

-- Project contacts UPDATE
CREATE POLICY "Admins and PMs can update project contacts in their organization"
ON public.project_contacts
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND (
    is_user_admin()
    OR
    (project_id IN (
      SELECT id FROM public.projects
      WHERE project_manager_id = auth.uid()
        AND organization_id = get_user_organization_id()
    ))
  )
);

-- Project contacts DELETE
CREATE POLICY "Admins and PMs can remove project contacts in their organization"
ON public.project_contacts
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND (
    is_user_admin()
    OR
    (project_id IN (
      SELECT id FROM public.projects
      WHERE project_manager_id = auth.uid()
        AND organization_id = get_user_organization_id()
    ))
  )
);

-- ============================================================================
-- STEP 5: VERIFY ORGANIZATION ISOLATION
-- ============================================================================

-- Test query to check if policies are working:
-- SELECT COUNT(*) FROM projects; -- Should only show projects in your org

COMMENT ON FUNCTION get_user_organization_id() IS 'Returns the organization_id of the current user. Used by RLS policies for multi-tenant isolation.';
COMMENT ON FUNCTION get_user_role() IS 'Returns the role name of the current user. Handles both old TEXT role field and new role_id system.';
COMMENT ON FUNCTION is_user_admin() IS 'Returns true if the current user is an admin. Checks both is_super_admin flag and role name.';
COMMENT ON FUNCTION user_has_permission(TEXT) IS 'Checks if the current user has a specific permission in their role.';

-- Migration complete!
-- Users will now only see projects, contacts, and other data from their own organization.
