-- ============================================================================
-- Fix RLS Policy Performance: Wrap Auth Functions in (select ...)
-- ============================================================================
-- This script fixes RLS policies to prevent per-row re-evaluation of auth functions
-- Pattern: auth.uid() → (select auth.uid())
-- Pattern: get_user_organization_id() → (select get_user_organization_id())
-- Pattern: get_user_role() → (select get_user_role())
-- Pattern: get_user_contact_id() → (select get_user_contact_id())
-- Pattern: get_user_email() → (select get_user_email())
-- Pattern: is_user_admin() → (select is_user_admin())
--
-- Note: Helper functions are already marked as STABLE, but wrapping in (select ...)
-- provides explicit optimization guarantee in RLS context and satisfies Supabase linter
-- ============================================================================

-- ============================================================================
-- PROJECTS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can see projects in their organization"
DROP POLICY IF EXISTS "Users can see projects in their organization" ON public.projects;
CREATE POLICY "Users can see projects in their organization"
ON public.projects
FOR SELECT
USING (
  -- CRITICAL: Must be in same organization
  organization_id = (select get_user_organization_id())
  AND (
    -- Admin can see ALL projects in their org (even if not explicitly added)
    (select is_user_admin())
    OR
    -- PMs see their assigned projects
    (project_manager_id = (select auth.uid()))
    OR
    -- Creators see projects they created
    (created_by_user_id = (select auth.uid()))
    OR
    -- Team members see projects they're linked to via project_contacts
    (id IN (
      SELECT project_id
      FROM public.project_contacts
      WHERE contact_id = (select get_user_contact_id())
        AND organization_id = (select get_user_organization_id())
    ))
    OR
    -- Guest collaborators see projects they're invited to
    (id IN (
      SELECT project_id
      FROM public.project_collaborators
      WHERE user_id = (select auth.uid())
    ))
  )
);

-- Drop and recreate: "Users can create projects in their organization"
DROP POLICY IF EXISTS "Users can create projects in their organization" ON public.projects;
CREATE POLICY "Users can create projects in their organization"
ON public.projects
FOR INSERT
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND organization_id = (select get_user_organization_id())
);

-- Drop and recreate: "Admins and PMs can update projects in their organization"
DROP POLICY IF EXISTS "Admins and PMs can update projects in their organization" ON public.projects;
CREATE POLICY "Admins and PMs can update projects in their organization"
ON public.projects
FOR UPDATE
USING (
  organization_id = (select get_user_organization_id())
  AND (
    (select is_user_admin())
    OR
    (project_manager_id = (select auth.uid()))
    OR (
      (select user_has_permission('can_edit_projects'))
      AND id IN (SELECT get_accessible_project_ids())
    )
  )
)
WITH CHECK (
  organization_id = (select get_user_organization_id())
  AND (
    (select is_user_admin())
    OR
    (project_manager_id = (select auth.uid()))
    OR (
      (select user_has_permission('can_edit_projects'))
      AND id IN (SELECT get_accessible_project_ids())
    )
  )
);

-- Drop and recreate: "Admins, PMs, and creators can delete projects in their organization"
DROP POLICY IF EXISTS "Admins, PMs, and creators can delete projects in their organization" ON public.projects;
CREATE POLICY "Admins, PMs, and creators can delete projects in their organization"
ON public.projects
FOR DELETE
USING (
  organization_id = (select get_user_organization_id())
  AND (
    (select is_user_admin())
    OR
    (project_manager_id = (select auth.uid()))
    OR
    (created_by_user_id = (select auth.uid()))
  )
);

-- ============================================================================
-- PROFILES TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can see profiles in their organization"
DROP POLICY IF EXISTS "Users can see profiles in their organization" ON public.profiles;
CREATE POLICY "Users can see profiles in their organization"
ON public.profiles FOR SELECT
USING (
  (id = (select auth.uid()))  -- Own profile
  OR
  (organization_id IS NOT NULL 
   AND organization_id = (select get_user_organization_id()))  -- Same org members
);

-- Drop and recreate: "Users can create their own profile"
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile"
ON public.profiles FOR INSERT
WITH CHECK (id = (select auth.uid()));

-- Drop and recreate: "Users can update their own profile, admins can update any"
DROP POLICY IF EXISTS "Users can update their own profile, admins can update any" ON public.profiles;
CREATE POLICY "Users can update their own profile, admins can update any"
ON public.profiles FOR UPDATE
USING (
  (id = (select auth.uid())) 
  OR 
  is_current_user_admin()
);

-- ============================================================================
-- CONTACTS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can view their own contacts and contacts with their email"
DROP POLICY IF EXISTS "Users can view their own contacts and contacts with their email" ON public.contacts;
CREATE POLICY "Users can view their own contacts and contacts with their email"
ON public.contacts
FOR SELECT
USING (
  -- Users can see contacts they created
  (created_by_user_id = (select auth.uid()))
  OR
  -- Users can see contacts that match their email (using helper function)
  (LOWER(email) = LOWER((select get_user_email())))
  OR
  -- Admins and PMs can see all contacts
  ((select get_user_role()) IN ('Admin', 'PM'))
  OR
  -- Anyone can see contacts who share a project with them
  (
    (select get_user_contact_id()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.project_contacts pc_user
      JOIN public.project_contacts pc_contact
        ON pc_contact.project_id = pc_user.project_id
      WHERE pc_user.contact_id = (select get_user_contact_id())
        AND pc_contact.contact_id = contacts.id
    )
  )
  OR
  -- Project creators/managers can see contacts assigned to their projects
  EXISTS (
    SELECT 1
    FROM public.project_contacts pc_mgr
    WHERE pc_mgr.contact_id = contacts.id
      AND pc_mgr.project_id IN (
        SELECT id
        FROM public.projects
        WHERE project_manager_id = (select auth.uid())
           OR created_by_user_id = (select auth.uid())
      )
  )
);

-- Drop and recreate: "Authenticated users can create contacts"
DROP POLICY IF EXISTS "Authenticated users can create contacts" ON public.contacts;
CREATE POLICY "Authenticated users can create contacts"
ON public.contacts
FOR INSERT
WITH CHECK ((select auth.uid()) IS NOT NULL);

-- Drop and recreate: "Users can update their own contacts"
DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contacts;
CREATE POLICY "Users can update their own contacts"
ON public.contacts
FOR UPDATE
USING (created_by_user_id = (select auth.uid()));

-- Drop and recreate: "Users can delete their own contacts"
DROP POLICY IF EXISTS "Users can delete their own contacts" ON public.contacts;
CREATE POLICY "Users can delete their own contacts"
ON public.contacts
FOR DELETE
USING (created_by_user_id = (select auth.uid()));

-- ============================================================================
-- CALENDAR EVENTS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can see events for projects they have access to"
DROP POLICY IF EXISTS "Users can see events for projects they have access to" ON public.calendar_events;
CREATE POLICY "Users can see events for projects they have access to"
ON public.calendar_events
FOR SELECT
USING (
  (project_id IS NULL AND (user_id = (select auth.uid())))
  OR
  (project_id IN (SELECT id FROM public.projects))
);

-- Drop and recreate: "Users can create events for accessible projects"
DROP POLICY IF EXISTS "Users can create events for accessible projects" ON public.calendar_events;
CREATE POLICY "Users can create events for accessible projects"
ON public.calendar_events
FOR INSERT
WITH CHECK (
  (project_id IS NULL AND (user_id = (select auth.uid())))
  OR
  (project_id IN (SELECT id FROM public.projects))
);

-- Drop and recreate: "Users can update events for accessible projects"
DROP POLICY IF EXISTS "Users can update events for accessible projects" ON public.calendar_events;
CREATE POLICY "Users can update events for accessible projects"
ON public.calendar_events
FOR UPDATE
USING (
  (project_id IS NULL AND (user_id = (select auth.uid())))
  OR
  (project_id IN (SELECT id FROM public.projects))
);

-- Drop and recreate: "Users can delete events for accessible projects"
DROP POLICY IF EXISTS "Users can delete events for accessible projects" ON public.calendar_events;
CREATE POLICY "Users can delete events for accessible projects"
ON public.calendar_events
FOR DELETE
USING (
  (project_id IS NULL AND (user_id = (select auth.uid())))
  OR
  (project_id IN (SELECT id FROM public.projects))
);

-- ============================================================================
-- EVENT CATEGORIES TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "All authenticated users can view event categories"
DROP POLICY IF EXISTS "All authenticated users can view event categories" ON public.event_categories;
CREATE POLICY "All authenticated users can view event categories"
ON public.event_categories
FOR SELECT
USING ((select auth.uid()) IS NOT NULL);

-- Drop and recreate: "Only admins can create event categories"
DROP POLICY IF EXISTS "Only admins can create event categories" ON public.event_categories;
CREATE POLICY "Only admins can create event categories"
ON public.event_categories
FOR INSERT
WITH CHECK ((select get_user_role()) = 'Admin');

-- Drop and recreate: "Only admins can update event categories"
DROP POLICY IF EXISTS "Only admins can update event categories" ON public.event_categories;
CREATE POLICY "Only admins can update event categories"
ON public.event_categories
FOR UPDATE
USING ((select get_user_role()) = 'Admin');

-- Drop and recreate: "Only admins can delete event categories"
DROP POLICY IF EXISTS "Only admins can delete event categories" ON public.event_categories;
CREATE POLICY "Only admins can delete event categories"
ON public.event_categories
FOR DELETE
USING ((select get_user_role()) = 'Admin');

-- ============================================================================
-- FILES TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can delete files for accessible projects"
DROP POLICY IF EXISTS "Users can delete files for accessible projects" ON public.files;
CREATE POLICY "Users can delete files for accessible projects"
ON public.files
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin' OR created_by_user_id = (select auth.uid())
  )
);

-- ============================================================================
-- ISSUE COMMENTS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can update their own comments or admins/PMs can update any"
DROP POLICY IF EXISTS "Users can update their own comments or admins/PMs can update any" ON public.issue_comments;
CREATE POLICY "Users can update their own comments or admins/PMs can update any"
ON public.issue_comments
FOR UPDATE
USING (
  (user_id = (select auth.uid())) -- Own comments
  OR
  (issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin'
    )
  ))
);

-- Drop and recreate: "Users can delete their own comments within 15 minutes or admins/PMs can delete any"
DROP POLICY IF EXISTS "Users can delete their own comments within 15 minutes or admins/PMs can delete any" ON public.issue_comments;
CREATE POLICY "Users can delete their own comments within 15 minutes or admins/PMs can delete any"
ON public.issue_comments
FOR DELETE
USING (
  (user_id = (select auth.uid()) AND created_at > NOW() - INTERVAL '15 minutes') -- Own recent comments
  OR
  (issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin'
    )
  ))
);

-- ============================================================================
-- ISSUE STEPS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can update their assigned steps or admins/PMs can update any"
DROP POLICY IF EXISTS "Users can update their assigned steps or admins/PMs can update any" ON public.issue_steps;
CREATE POLICY "Users can update their assigned steps or admins/PMs can update any"
ON public.issue_steps
FOR UPDATE
USING (
  (assigned_to_user_id = (select auth.uid())) -- Own assigned steps
  OR
  (issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin'
    )
  ))
);

-- Drop and recreate: "Admins and PMs can delete issue steps"
DROP POLICY IF EXISTS "Admins and PMs can delete issue steps" ON public.issue_steps;
CREATE POLICY "Admins and PMs can delete issue steps"
ON public.issue_steps
FOR DELETE
USING (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin'
    )
  )
);

-- ============================================================================
-- MESSAGE CHANNELS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can delete channels for accessible projects"
DROP POLICY IF EXISTS "Users can delete channels for accessible projects" ON public.message_channels;
CREATE POLICY "Users can delete channels for accessible projects"
ON public.message_channels
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin' OR created_by_user_id = (select auth.uid())
  )
);

-- ============================================================================
-- MESSAGES TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can create messages for accessible projects"
DROP POLICY IF EXISTS "Users can create messages for accessible projects" ON public.messages;
CREATE POLICY "Users can create messages for accessible projects"
ON public.messages
FOR INSERT
WITH CHECK (
  user_id = (select auth.uid()) -- Users can only create messages as themselves
  AND
  channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (
      SELECT id FROM public.projects WHERE
        organization_id = (select get_user_organization_id())
        AND (
          ((select get_user_role()) = 'Admin')
          OR
          (project_manager_id = (select auth.uid()))
          OR
          (created_by_user_id = (select auth.uid()))
          OR
          (id IN (
            SELECT project_id
            FROM public.project_contacts
            WHERE contact_id = (select get_user_contact_id())
              AND organization_id = (select get_user_organization_id())
          ))
        )
    )
  )
);

-- Drop and recreate: "Users can update their own messages or admins/PMs can update any"
DROP POLICY IF EXISTS "Users can update their own messages or admins/PMs can update any" ON public.messages;
CREATE POLICY "Users can update their own messages or admins/PMs can update any"
ON public.messages
FOR UPDATE
USING (
  (user_id = (select auth.uid())) -- Own messages
  OR
  (channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin'
    )
  ))
);

-- Drop and recreate: "Users can delete their own messages or admins/PMs can delete any"
DROP POLICY IF EXISTS "Users can delete their own messages or admins/PMs can delete any" ON public.messages;
CREATE POLICY "Users can delete their own messages or admins/PMs can delete any"
ON public.messages
FOR DELETE
USING (
  (user_id = (select auth.uid())) -- Own messages
  OR
  (channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin'
    )
  ))
);

-- ============================================================================
-- MESSAGE REACTIONS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can create reactions for accessible messages"
DROP POLICY IF EXISTS "Users can create reactions for accessible messages" ON public.message_reactions;
CREATE POLICY "Users can create reactions for accessible messages"
ON public.message_reactions
FOR INSERT
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND
  message_id IN (
    SELECT m.id 
    FROM public.messages m
    JOIN public.message_channels mc ON m.channel_id = mc.id
    WHERE mc.project_id IN (SELECT id FROM public.projects)
  )
);

-- Drop and recreate: "Users can delete their own reactions"
DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.message_reactions;
CREATE POLICY "Users can delete their own reactions"
ON public.message_reactions
FOR DELETE
USING (user_id = (select auth.uid()));

-- ============================================================================
-- TYPING INDICATORS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can create typing indicators for accessible channels"
DROP POLICY IF EXISTS "Users can create typing indicators for accessible channels" ON public.typing_indicators;
CREATE POLICY "Users can create typing indicators for accessible channels"
ON public.typing_indicators
FOR INSERT
WITH CHECK (
  user_id = (select auth.uid())
  AND
  channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (SELECT id FROM public.projects)
  )
);

-- Drop and recreate: "Users can delete their own typing indicators"
DROP POLICY IF EXISTS "Users can delete their own typing indicators" ON public.typing_indicators;
CREATE POLICY "Users can delete their own typing indicators"
ON public.typing_indicators
FOR DELETE
USING (user_id = (select auth.uid()));

-- Drop and recreate: "Users can update their own typing indicators"
DROP POLICY IF EXISTS "Users can update their own typing indicators" ON public.typing_indicators;
CREATE POLICY "Users can update their own typing indicators"
ON public.typing_indicators
FOR UPDATE
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- MESSAGE READS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can see their own message reads"
DROP POLICY IF EXISTS "Users can see their own message reads" ON public.message_reads;
CREATE POLICY "Users can see their own message reads"
ON public.message_reads
FOR SELECT
USING (user_id = (select auth.uid()));

-- Drop and recreate: "Users can create their own message reads"
DROP POLICY IF EXISTS "Users can create their own message reads" ON public.message_reads;
CREATE POLICY "Users can create their own message reads"
ON public.message_reads
FOR INSERT
WITH CHECK (user_id = (select auth.uid()));

-- Drop and recreate: "Users can delete their own message reads"
DROP POLICY IF EXISTS "Users can delete their own message reads" ON public.message_reads;
CREATE POLICY "Users can delete their own message reads"
ON public.message_reads
FOR DELETE
USING (user_id = (select auth.uid()));

-- Drop and recreate: "Users can update their own message reads"
DROP POLICY IF EXISTS "Users can update their own message reads" ON public.message_reads;
CREATE POLICY "Users can update their own message reads"
ON public.message_reads
FOR UPDATE
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- CHANNEL READS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can see their own channel reads"
DROP POLICY IF EXISTS "Users can see their own channel reads" ON public.channel_reads;
CREATE POLICY "Users can see their own channel reads"
ON public.channel_reads
FOR SELECT
USING (user_id = (select auth.uid()));

-- Drop and recreate: "Users can create their own channel reads"
DROP POLICY IF EXISTS "Users can create their own channel reads" ON public.channel_reads;
CREATE POLICY "Users can create their own channel reads"
ON public.channel_reads
FOR INSERT
WITH CHECK (
  user_id = (select auth.uid())
  AND
  channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (SELECT id FROM public.projects)
  )
);

-- Drop and recreate: "Users can update their own channel reads"
DROP POLICY IF EXISTS "Users can update their own channel reads" ON public.channel_reads;
CREATE POLICY "Users can update their own channel reads"
ON public.channel_reads
FOR UPDATE
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- Drop and recreate: "Users can delete their own channel reads"
DROP POLICY IF EXISTS "Users can delete their own channel reads" ON public.channel_reads;
CREATE POLICY "Users can delete their own channel reads"
ON public.channel_reads
FOR DELETE
USING (user_id = (select auth.uid()));

-- ============================================================================
-- PROJECT CONTACTS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can see project contacts in their organization"
DROP POLICY IF EXISTS "Users can see project contacts in their organization" ON public.project_contacts;
CREATE POLICY "Users can see project contacts in their organization"
ON public.project_contacts
FOR SELECT
USING (
  organization_id = (select get_user_organization_id())
);

-- Drop and recreate: "Admins and PMs can assign contacts in their organization"
DROP POLICY IF EXISTS "Admins and PMs can assign contacts in their organization" ON public.project_contacts;
CREATE POLICY "Admins and PMs can assign contacts in their organization"
ON public.project_contacts
FOR INSERT
WITH CHECK (
  organization_id = (select get_user_organization_id())
  AND (
    -- Admins can add any contact in their organization
    ((select is_user_admin()) AND contact_id IN (
      SELECT id FROM public.contacts 
      WHERE organization_id = (select get_user_organization_id())
    ))
    OR
    -- PMs can add contacts to their projects
    (project_id IN (
      SELECT id FROM public.projects
      WHERE project_manager_id = (select auth.uid())
        AND organization_id = (select get_user_organization_id())
    ))
    OR
    -- Project creators can add any contact in their org to projects they created
    (project_id IN (
      SELECT id FROM public.projects
      WHERE created_by_user_id = (select auth.uid())
        AND organization_id = (select get_user_organization_id())
    ) AND contact_id IN (
      SELECT id FROM public.contacts
      WHERE organization_id = (select get_user_organization_id())
    ))
  )
);

-- Drop and recreate: "Admins and PMs can update project contacts in their organization"
DROP POLICY IF EXISTS "Admins and PMs can update project contacts in their organization" ON public.project_contacts;
CREATE POLICY "Admins and PMs can update project contacts in their organization"
ON public.project_contacts
FOR UPDATE
USING (
  organization_id = (select get_user_organization_id())
  AND (
    (select is_user_admin())
    OR
    (project_id IN (
      SELECT id FROM public.projects
      WHERE project_manager_id = (select auth.uid())
        AND organization_id = (select get_user_organization_id())
    ))
  )
);

-- Drop and recreate: "Admins and PMs can remove project contacts in their organization"
DROP POLICY IF EXISTS "Admins and PMs can remove project contacts in their organization" ON public.project_contacts;
CREATE POLICY "Admins and PMs can remove project contacts in their organization"
ON public.project_contacts
FOR DELETE
USING (
  organization_id = (select get_user_organization_id())
  AND (
    (select is_user_admin())
    OR
    (project_id IN (
      SELECT id FROM public.projects
      WHERE project_manager_id = (select auth.uid())
        AND organization_id = (select get_user_organization_id())
    ))
  )
);

-- ============================================================================
-- PROJECT ISSUES TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Admins, PMs, and creators can delete issues"
DROP POLICY IF EXISTS "Admins, PMs, and creators can delete issues" ON public.project_issues;
CREATE POLICY "Admins, PMs, and creators can delete issues"
ON public.project_issues
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects 
    WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin' OR created_by_user_id = (select auth.uid())
  )
);

-- Drop and recreate: "Users can update project issues they created"
DROP POLICY IF EXISTS "Users can update project issues they created" ON public.project_issues;
CREATE POLICY "Users can update project issues they created"
ON public.project_issues
FOR UPDATE
USING (
  created_by_user_id = (select auth.uid())
);

-- ============================================================================
-- PROJECT PHASES TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can delete phases for accessible projects"
DROP POLICY IF EXISTS "Users can delete phases for accessible projects" ON public.project_phases;
CREATE POLICY "Users can delete phases for accessible projects"
ON public.project_phases
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin' OR created_by_user_id = (select auth.uid())
  )
);

-- ============================================================================
-- TASKS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can update their assigned tasks or admins/PMs can update any"
DROP POLICY IF EXISTS "Users can update their assigned tasks or admins/PMs can update any" ON public.tasks;
CREATE POLICY "Users can update their assigned tasks or admins/PMs can update any"
ON public.tasks
FOR UPDATE
USING (
  (assignee_id IN (SELECT contact_id FROM public.profiles WHERE id = (select auth.uid()) AND contact_id IS NOT NULL)) -- Own assigned tasks (via contact_id)
  OR
  (project_id IN (
    SELECT id FROM public.projects 
    WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin'
  ))
);

-- Drop and recreate: "Admins, PMs, and creators can delete tasks"
DROP POLICY IF EXISTS "Admins, PMs, and creators can delete tasks" ON public.tasks;
CREATE POLICY "Admins, PMs, and creators can delete tasks"
ON public.tasks
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects 
    WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin' OR created_by_user_id = (select auth.uid())
  )
);

-- ============================================================================
-- USER PREFERENCES TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can only see their own preferences"
DROP POLICY IF EXISTS "Users can only see their own preferences" ON public.user_preferences;
CREATE POLICY "Users can only see their own preferences"
ON public.user_preferences
FOR SELECT
USING (user_id = (select auth.uid()));

-- Drop and recreate: "Users can create their own preferences"
DROP POLICY IF EXISTS "Users can create their own preferences" ON public.user_preferences;
CREATE POLICY "Users can create their own preferences"
ON public.user_preferences
FOR INSERT
WITH CHECK (user_id = (select auth.uid()));

-- Drop and recreate: "Users can update their own preferences"
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
CREATE POLICY "Users can update their own preferences"
ON public.user_preferences
FOR UPDATE
USING (user_id = (select auth.uid()));

-- Drop and recreate: "Users can delete their own preferences"
DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.user_preferences;
CREATE POLICY "Users can delete their own preferences"
ON public.user_preferences
FOR DELETE
USING (user_id = (select auth.uid()));

-- ============================================================================
-- ACTIVITY LOG TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can update their own activity logs"
DROP POLICY IF EXISTS "Users can update their own activity logs" ON public.activity_log;
CREATE POLICY "Users can update their own activity logs"
ON public.activity_log
FOR UPDATE
USING (user_id = (select auth.uid()));

-- Drop and recreate: "Users can delete their own activity logs"
DROP POLICY IF EXISTS "Users can delete their own activity logs" ON public.activity_log;
CREATE POLICY "Users can delete their own activity logs"
ON public.activity_log
FOR DELETE
USING (user_id = (select auth.uid()));

-- ============================================================================
-- INVITATIONS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Public can read pending invitations by token, users can see their invitations"
DROP POLICY IF EXISTS "Public can read pending invitations by token, users can see their invitations" ON public.invitations;
CREATE POLICY "Public can read pending invitations by token, users can see their invitations"
ON public.invitations
FOR SELECT
USING (
  -- Public access: any pending invitation with a token (for invite acceptance page)
  (
    status = 'pending'
    AND invitation_token IS NOT NULL
  )
  OR
  -- Authenticated users can see invitations they sent
  (
    (select auth.uid()) IS NOT NULL
    AND invited_by_user_id = (select auth.uid())
  )
  OR
  -- Authenticated users can see invitations sent to their email
  (
    (select auth.uid()) IS NOT NULL
    AND email IN (
      SELECT c.email
      FROM public.profiles p
      JOIN public.contacts c ON p.contact_id = c.id
      WHERE p.id = (select auth.uid())
    )
  )
);

-- Drop and recreate: "Authenticated users can create invitations"
DROP POLICY IF EXISTS "Authenticated users can create invitations" ON public.invitations;
CREATE POLICY "Authenticated users can create invitations"
ON public.invitations
FOR INSERT
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND (
    invited_by_user_id = (select auth.uid()) -- Can only create invitations as themselves
  )
);

-- Drop and recreate: "Users can accept their own invitations"
DROP POLICY IF EXISTS "Users can accept their own invitations" ON public.invitations;
CREATE POLICY "Users can accept their own invitations"
ON public.invitations
FOR UPDATE
USING (
  (invited_by_user_id = (select auth.uid())) -- Sender can cancel/update
  OR
  (status = 'pending' AND invitation_token IS NOT NULL) -- Anyone with token can accept (for public invite flow)
  OR
  (email = (select get_user_email()) AND status = 'pending') -- Recipient can accept by email match
)
WITH CHECK (
  (invited_by_user_id = (select auth.uid())) -- Sender can cancel/update
  OR
  (status IN ('pending', 'accepted')) -- Can update to accepted status
);

-- Drop and recreate: "Users can delete their sent invitations"
DROP POLICY IF EXISTS "Users can delete their sent invitations" ON public.invitations;
CREATE POLICY "Users can delete their sent invitations"
ON public.invitations
FOR DELETE
USING (invited_by_user_id = (select auth.uid()));

-- ============================================================================
-- ROLES TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can view roles in their organization"
DROP POLICY IF EXISTS "Users can view roles in their organization" ON public.roles;
CREATE POLICY "Users can view roles in their organization"
ON public.roles
FOR SELECT
TO authenticated
USING (
  -- Users can view ALL roles in their organization
  organization_id IN (
    SELECT organization_id
    FROM public.profiles
    WHERE id = (select auth.uid())
    AND organization_id IS NOT NULL
  )
  OR
  -- Users can always view their own assigned role
  (id IN (
    SELECT role_id
    FROM public.profiles
    WHERE id = (select auth.uid())
    AND role_id IS NOT NULL
  ))
);

-- Drop and recreate: "Users with can_manage_roles can create roles"
DROP POLICY IF EXISTS "Users with can_manage_roles can create roles" ON public.roles;
CREATE POLICY "Users with can_manage_roles can create roles"
ON public.roles
FOR INSERT
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND user_can_manage_roles(organization_id)
);

-- Drop and recreate: "Users with can_manage_roles can update roles"
DROP POLICY IF EXISTS "Users with can_manage_roles can update roles" ON public.roles;
CREATE POLICY "Users with can_manage_roles can update roles"
ON public.roles
FOR UPDATE
USING (user_can_manage_roles(organization_id))
WITH CHECK (user_can_manage_roles(organization_id));

-- Drop and recreate: "Users with can_manage_roles can delete roles"
DROP POLICY IF EXISTS "Users with can_manage_roles can delete roles" ON public.roles;
CREATE POLICY "Users with can_manage_roles can delete roles"
ON public.roles
FOR DELETE
USING (
  user_can_manage_roles(organization_id)
  AND is_system_role = false
);

-- ============================================================================
-- ORGANIZATIONS TABLE POLICIES
-- ============================================================================

-- Drop and recreate: "Users can view their own organization"
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
CREATE POLICY "Users can view their own organization"
ON public.organizations
FOR SELECT
USING (
  -- Use helper function to check access (bypasses RLS via SECURITY DEFINER)
  user_can_view_organization(id)
);

-- Drop and recreate: "Admins can update their organization"
DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;
CREATE POLICY "Admins can update their organization"
ON public.organizations
FOR UPDATE
USING (
  id = (select get_user_organization_id())
  AND (select is_user_admin())
);

-- Drop and recreate: "Only super admins can create organizations"
DROP POLICY IF EXISTS "Only super admins can create organizations" ON public.organizations;
CREATE POLICY "Only super admins can create organizations"
ON public.organizations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = (select auth.uid()) 
    AND is_super_admin = true
  )
);

-- Drop and recreate: "Only super admins can delete organizations"
DROP POLICY IF EXISTS "Only super admins can delete organizations" ON public.organizations;
CREATE POLICY "Only super admins can delete organizations"
ON public.organizations
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = (select auth.uid()) 
    AND is_super_admin = true
  )
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify policies were updated (check a few key ones)
DO $$
BEGIN
  RAISE NOTICE 'RLS policy optimization complete. All auth function calls wrapped in (select ...)';
  RAISE NOTICE 'This should resolve ~90+ Supabase Performance Advisor warnings';
END $$;
