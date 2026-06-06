-- SiteWeave Database Schema
-- Complete production schema with RLS implementation
-- This is the single source of truth for the database structure

-- ============================================================================
-- TABLE DEFINITIONS
-- ============================================================================

-- Organizations Table (Multi-tenant B2B architecture)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by_user_id UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS progress_report_send_hour INTEGER NOT NULL DEFAULT 8;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS progress_report_timezone TEXT NOT NULL DEFAULT 'America/New_York';

-- Roles Table (Dynamic roles with JSONB permissions)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{}',
    is_system_role BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(organization_id, name)
);

-- Project Collaborators Table (Guest access for subcontractors)
CREATE TABLE IF NOT EXISTS project_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invited_by_user_id UUID REFERENCES auth.users(id),
    access_level TEXT DEFAULT 'viewer' CHECK (access_level IN ('viewer', 'editor', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(project_id, user_id)
);

-- Projects Table (Main entity)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    status TEXT,
    status_color TEXT,
    project_type TEXT,
    due_date DATE,
    next_milestone TEXT,
    milestones JSONB,
    notification_count INTEGER DEFAULT 0,
    color TEXT,
    dependency_scheduling_mode TEXT NOT NULL DEFAULT 'auto' CHECK (dependency_scheduling_mode IN ('auto', 'manual')),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Contacts Table
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT,
    type TEXT NOT NULL,
    company TEXT,
    trade TEXT,
    status TEXT DEFAULT 'Available',
    avatar_url TEXT,
    email TEXT,
    phone TEXT,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
);

-- Profiles Table (Links auth.users to contacts and stores roles)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'Team' CHECK (role IN ('Admin', 'PM', 'Team', 'Client')),
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
    is_super_admin BOOLEAN DEFAULT false,
    must_change_password BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Calendar Events Table
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    color TEXT,
    description TEXT,
    category TEXT DEFAULT 'other',
    location TEXT DEFAULT 'Austin',
    attendees TEXT,
    is_all_day BOOLEAN DEFAULT false,
    recurrence TEXT,
    user_id UUID,
    external_id TEXT,
    external_source TEXT
);

-- Event Categories Table
CREATE TABLE IF NOT EXISTS event_categories (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Files Table
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT,
    file_url TEXT,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    size_kb INTEGER
);

-- Issue Comments Table
CREATE TABLE IF NOT EXISTS issue_comments (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER,
    step_id INTEGER,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID,
    user_name VARCHAR(255) NOT NULL,
    comment TEXT NOT NULL,
    comment_type VARCHAR(20) DEFAULT 'comment',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Issue Files Table
CREATE TABLE IF NOT EXISTS issue_files (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER,
    step_id INTEGER,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size_kb INTEGER,
    uploaded_by_user_id UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Issue Steps Table
CREATE TABLE IF NOT EXISTS issue_steps (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    description TEXT NOT NULL,
    assigned_to_user_id UUID,
    assigned_to_name VARCHAR(255) NOT NULL,
    assigned_to_role VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by_user_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    assigned_to_contact_id UUID
);

-- Message Channels Table
CREATE TABLE IF NOT EXISTS message_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID,
    topic TEXT NOT NULL,
    extension TEXT NOT NULL,
    content TEXT,
    file_url TEXT,
    payload JSONB,
    file_name TEXT,
    event TEXT,
    type TEXT DEFAULT 'text',
    private BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    inserted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Message Reactions Table
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(message_id, user_id, emoji)
);

-- Typing Indicators Table
CREATE TABLE IF NOT EXISTS typing_indicators (
    channel_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    is_typing BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (channel_id, user_id)
);

-- Message Reads Table (tracks which messages each user has read)
CREATE TABLE IF NOT EXISTS message_reads (
    message_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);

-- Channel Reads Table (tracks last read message per channel per user)
CREATE TABLE IF NOT EXISTS channel_reads (
    user_id UUID NOT NULL,
    channel_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    last_read_message_id UUID,
    last_read_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (user_id, channel_id)
);

-- Project Contacts Junction Table
CREATE TABLE IF NOT EXISTS project_contacts (
    project_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, contact_id)
);

-- Project Issues Table
CREATE TABLE IF NOT EXISTS project_issues (
    id SERIAL PRIMARY KEY,
    project_id UUID,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    current_step_id INTEGER,
    priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    due_date DATE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_by_user_id UUID REFERENCES auth.users(id)
);

-- Project Phases Table
CREATE TABLE IF NOT EXISTS project_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    budget NUMERIC DEFAULT 0,
    "order" INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    due_date DATE,
    priority TEXT,
    completed BOOLEAN DEFAULT false,
    assignee_id UUID,
    recurrence TEXT,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    is_recurring_instance BOOLEAN DEFAULT false,
    start_date DATE,
    duration_days INTEGER,
    is_milestone BOOLEAN DEFAULT false,
    percent_complete INTEGER CHECK (percent_complete IS NULL OR (percent_complete >= 0 AND percent_complete <= 100)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Task Dependencies Table (Gantt: predecessor/successor links)
CREATE TABLE IF NOT EXISTS task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    successor_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL DEFAULT 'finish_to_start'
        CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
    lag_days INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT task_dependencies_no_self CHECK (task_id != successor_task_id),
    CONSTRAINT task_dependencies_unique UNIQUE (task_id, successor_task_id)
);

-- Project Templates Table (reusable project structure: phases, tasks, dependencies)
CREATE TABLE IF NOT EXISTS project_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    structure JSONB NOT NULL DEFAULT '{}'
);

-- Schedule import templates (Microsoft Project XML field mapping, org-scoped)
CREATE TABLE IF NOT EXISTS schedule_import_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'ms_project_xml',
    config JSONB NOT NULL DEFAULT '{}',
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Activity Log Table (for tracking user actions)
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- 'project', 'task', 'file', 'message', 'issue', etc.
    entity_id UUID,
    entity_name TEXT, -- Human-readable name of the entity
    project_id UUID REFERENCES projects(id),
    details JSONB, -- Additional context about the action
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Invitations Table (for inviting external users to projects and tasks)
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
    project_id UUID,
    issue_id INTEGER,
    step_id INTEGER,
    invited_by_user_id UUID,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    invitation_token TEXT UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '7 days'),
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    onboarding_completed BOOLEAN DEFAULT false,
    onboarding_step INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- ADD NEW COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add email and phone columns to contacts table (if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contacts' AND column_name = 'email') THEN
        ALTER TABLE contacts ADD COLUMN email TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contacts' AND column_name = 'phone') THEN
        ALTER TABLE contacts ADD COLUMN phone TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'contacts' AND column_name = 'created_by_user_id') THEN
        ALTER TABLE contacts ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Add missing columns to messages table (if they don't exist)
DO $$ 
BEGIN
    -- Add topic column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public'
                     AND table_name = 'messages' 
                     AND column_name = 'topic') THEN
        -- Add as nullable first to handle existing rows
        ALTER TABLE messages ADD COLUMN topic TEXT;
        -- Update existing rows with default value
        UPDATE messages SET topic = 'General' WHERE topic IS NULL;
        -- Now make it NOT NULL with default
        ALTER TABLE messages ALTER COLUMN topic SET NOT NULL;
        ALTER TABLE messages ALTER COLUMN topic SET DEFAULT '';
    END IF;
    
    -- Add extension column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public'
                     AND table_name = 'messages' 
                     AND column_name = 'extension') THEN
        -- Add as nullable first to handle existing rows
        ALTER TABLE messages ADD COLUMN extension TEXT;
        -- Update existing rows with default value
        UPDATE messages SET extension = 'txt' WHERE extension IS NULL;
        -- Now make it NOT NULL with default
        ALTER TABLE messages ALTER COLUMN extension SET NOT NULL;
        ALTER TABLE messages ALTER COLUMN extension SET DEFAULT 'txt';
    END IF;
    
    -- Add updated_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public'
                     AND table_name = 'messages' 
                     AND column_name = 'updated_at') THEN
        ALTER TABLE messages ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
    END IF;
    
    -- Add inserted_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public'
                     AND table_name = 'messages' 
                     AND column_name = 'inserted_at') THEN
        ALTER TABLE messages ADD COLUMN inserted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
    END IF;
END $$;

-- Add created_at column to message_channels table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public'
                     AND table_name = 'message_channels' 
                     AND column_name = 'created_at') THEN
        ALTER TABLE message_channels ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT now();
        -- Update existing rows with current timestamp
        UPDATE message_channels SET created_at = now() WHERE created_at IS NULL;
    END IF;
END $$;

-- ============================================================================
-- ADD AUDIT FIELDS TO EXISTING TABLES
-- ============================================================================

-- Add RLS audit fields to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_manager_id UUID;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_user_id UUID;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_by_user_id UUID;

-- Add RLS audit fields to calendar_events table
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS created_by_user_id UUID;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS updated_by_user_id UUID;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Add external calendar sync fields
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS external_source TEXT;

-- Add RLS audit fields to files table
ALTER TABLE files ADD COLUMN IF NOT EXISTS created_by_user_id UUID;
ALTER TABLE files ADD COLUMN IF NOT EXISTS updated_by_user_id UUID;
ALTER TABLE files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Add RLS audit fields to issue_steps table
ALTER TABLE issue_steps ADD COLUMN IF NOT EXISTS created_by_user_id UUID;
ALTER TABLE issue_steps ADD COLUMN IF NOT EXISTS updated_by_user_id UUID;

-- Add recurrence fields to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring_instance BOOLEAN DEFAULT false;

-- Add workflow steps to tasks table (stored as JSONB)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_steps JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_workflow_step INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_steps_legacy JSONB;
COMMENT ON COLUMN tasks.workflow_steps IS 'Deprecated: legacy workflow JSON migrated to task_dependencies.';
COMMENT ON COLUMN tasks.current_workflow_step IS 'Deprecated: legacy workflow pointer no longer used.';
COMMENT ON COLUMN tasks.workflow_steps_legacy IS 'Read-only archive of deprecated workflow steps captured during migration.';

-- Add Gantt/schedule fields to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_days INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS percent_complete INTEGER;

-- ============================================================================
-- DATA CLEANUP BEFORE FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Clean up invalid user_id references before adding foreign key constraints
-- Set invalid user_id values to NULL to avoid foreign key violations

-- Clean calendar_events user_id references
UPDATE calendar_events 
SET user_id = NULL 
WHERE user_id IS NOT NULL 
  AND user_id NOT IN (SELECT id FROM auth.users);

-- Clean issue_comments user_id references
UPDATE issue_comments 
SET user_id = NULL 
WHERE user_id IS NOT NULL 
  AND user_id NOT IN (SELECT id FROM auth.users);

-- Clean issue_files uploaded_by_user_id references
UPDATE issue_files 
SET uploaded_by_user_id = NULL 
WHERE uploaded_by_user_id IS NOT NULL 
  AND uploaded_by_user_id NOT IN (SELECT id FROM auth.users);

-- Clean issue_steps assigned_to_user_id references
UPDATE issue_steps 
SET assigned_to_user_id = NULL 
WHERE assigned_to_user_id IS NOT NULL 
  AND assigned_to_user_id NOT IN (SELECT id FROM auth.users);

-- Clean issue_steps completed_by_user_id references
UPDATE issue_steps 
SET completed_by_user_id = NULL 
WHERE completed_by_user_id IS NOT NULL 
  AND completed_by_user_id NOT IN (SELECT id FROM auth.users);

-- Clean messages user_id references
UPDATE messages 
SET user_id = NULL 
WHERE user_id IS NOT NULL 
  AND user_id NOT IN (SELECT id FROM auth.users);

-- Clean project_issues created_by_user_id references
UPDATE project_issues 
SET created_by_user_id = NULL 
WHERE created_by_user_id IS NOT NULL 
  AND created_by_user_id NOT IN (SELECT id FROM auth.users);

-- Clean tasks assignee_id references
UPDATE tasks 
SET assignee_id = NULL 
WHERE assignee_id IS NOT NULL 
  AND assignee_id NOT IN (SELECT id FROM auth.users);

-- Clean user_preferences user_id references
UPDATE user_preferences 
SET user_id = NULL 
WHERE user_id IS NOT NULL 
  AND user_id NOT IN (SELECT id FROM auth.users);

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Projects constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_project_manager') THEN
        ALTER TABLE projects ADD CONSTRAINT fk_projects_project_manager FOREIGN KEY (project_manager_id) REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_created_by') THEN
        ALTER TABLE projects ADD CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_updated_by') THEN
        ALTER TABLE projects ADD CONSTRAINT fk_projects_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Profiles constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_profiles_contact') THEN
        ALTER TABLE profiles ADD CONSTRAINT fk_profiles_contact FOREIGN KEY (contact_id) REFERENCES contacts(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_profiles_role_id') THEN
        ALTER TABLE profiles ADD CONSTRAINT fk_profiles_role_id FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_profiles_organization_id') THEN
        ALTER TABLE profiles ADD CONSTRAINT fk_profiles_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Contacts constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contacts_created_by') THEN
        ALTER TABLE contacts ADD CONSTRAINT fk_contacts_created_by FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Calendar events constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_events_project_id') THEN
ALTER TABLE calendar_events ADD CONSTRAINT fk_calendar_events_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_events_user_id') THEN
ALTER TABLE calendar_events ADD CONSTRAINT fk_calendar_events_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_events_created_by') THEN
        ALTER TABLE calendar_events ADD CONSTRAINT fk_calendar_events_created_by FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_events_updated_by') THEN
        ALTER TABLE calendar_events ADD CONSTRAINT fk_calendar_events_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Files constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_files_project_id') THEN
ALTER TABLE files ADD CONSTRAINT fk_files_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_files_created_by') THEN
        ALTER TABLE files ADD CONSTRAINT fk_files_created_by FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_files_updated_by') THEN
        ALTER TABLE files ADD CONSTRAINT fk_files_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Issue comments constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_comments_issue_id') THEN
ALTER TABLE issue_comments ADD CONSTRAINT fk_issue_comments_issue_id FOREIGN KEY (issue_id) REFERENCES project_issues(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_comments_step_id') THEN
ALTER TABLE issue_comments ADD CONSTRAINT fk_issue_comments_step_id FOREIGN KEY (step_id) REFERENCES issue_steps(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_comments_user_id') THEN
ALTER TABLE issue_comments ADD CONSTRAINT fk_issue_comments_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Issue files constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_files_issue_id') THEN
ALTER TABLE issue_files ADD CONSTRAINT fk_issue_files_issue_id FOREIGN KEY (issue_id) REFERENCES project_issues(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_files_step_id') THEN
ALTER TABLE issue_files ADD CONSTRAINT fk_issue_files_step_id FOREIGN KEY (step_id) REFERENCES issue_steps(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_files_uploaded_by') THEN
ALTER TABLE issue_files ADD CONSTRAINT fk_issue_files_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Issue steps constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_steps_issue_id') THEN
ALTER TABLE issue_steps ADD CONSTRAINT fk_issue_steps_issue_id FOREIGN KEY (issue_id) REFERENCES project_issues(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_steps_assigned_to_user') THEN
ALTER TABLE issue_steps ADD CONSTRAINT fk_issue_steps_assigned_to_user FOREIGN KEY (assigned_to_user_id) REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_steps_assigned_to_contact') THEN
ALTER TABLE issue_steps ADD CONSTRAINT fk_issue_steps_assigned_to_contact FOREIGN KEY (assigned_to_contact_id) REFERENCES contacts(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_steps_created_by') THEN
        ALTER TABLE issue_steps ADD CONSTRAINT fk_issue_steps_created_by FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_steps_updated_by') THEN
        ALTER TABLE issue_steps ADD CONSTRAINT fk_issue_steps_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Message channels constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_channels_project_id') THEN
ALTER TABLE message_channels ADD CONSTRAINT fk_message_channels_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Messages constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_channel_id') THEN
        ALTER TABLE messages ADD CONSTRAINT fk_messages_channel_id FOREIGN KEY (channel_id) REFERENCES message_channels(id) ON DELETE CASCADE;
    END IF;
    -- Drop and recreate the user_id constraint to ensure it references auth.users, not contacts
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_user_id') THEN
        ALTER TABLE messages DROP CONSTRAINT fk_messages_user_id;
    END IF;
    -- Also drop if it exists with the default PostgreSQL naming
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_user_id_fkey;
    -- Recreate the constraint to reference auth.users(id)
    ALTER TABLE messages ADD CONSTRAINT fk_messages_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id);
END $$;

-- Message reactions constraints
DO $$ 
DECLARE
    message_id_type TEXT;
    message_reactions_exists BOOLEAN;
BEGIN
    -- Check if message_reactions table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'message_reactions'
    ) INTO message_reactions_exists;
    
    -- Only proceed if table exists
    IF message_reactions_exists THEN
        -- Get the actual data type of messages.id column
        SELECT data_type INTO message_id_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'id';
        
        -- Add constraints only if they don't exist
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_reactions_message_id') THEN
            ALTER TABLE message_reactions ADD CONSTRAINT fk_message_reactions_message_id FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_reactions_user_id') THEN
            ALTER TABLE message_reactions ADD CONSTRAINT fk_message_reactions_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Typing indicators constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_typing_indicators_channel_id') THEN
        ALTER TABLE typing_indicators ADD CONSTRAINT fk_typing_indicators_channel_id FOREIGN KEY (channel_id) REFERENCES message_channels(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_typing_indicators_user_id') THEN
        ALTER TABLE typing_indicators ADD CONSTRAINT fk_typing_indicators_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Message reads constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_reads_message_id') THEN
        ALTER TABLE message_reads ADD CONSTRAINT fk_message_reads_message_id FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_reads_user_id') THEN
        ALTER TABLE message_reads ADD CONSTRAINT fk_message_reads_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Channel reads constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_channel_reads_user_id') THEN
        ALTER TABLE channel_reads ADD CONSTRAINT fk_channel_reads_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_channel_reads_channel_id') THEN
        ALTER TABLE channel_reads ADD CONSTRAINT fk_channel_reads_channel_id FOREIGN KEY (channel_id) REFERENCES message_channels(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_channel_reads_last_read_message_id') THEN
        ALTER TABLE channel_reads ADD CONSTRAINT fk_channel_reads_last_read_message_id FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Project contacts constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_contacts_project_id') THEN
ALTER TABLE project_contacts ADD CONSTRAINT fk_project_contacts_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_contacts_contact_id') THEN
ALTER TABLE project_contacts ADD CONSTRAINT fk_project_contacts_contact_id FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_contacts_organization_id') THEN
ALTER TABLE project_contacts ADD CONSTRAINT fk_project_contacts_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Project collaborators constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_collaborators_project_id') THEN
        ALTER TABLE project_collaborators ADD CONSTRAINT fk_project_collaborators_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_collaborators_organization_id') THEN
        ALTER TABLE project_collaborators ADD CONSTRAINT fk_project_collaborators_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_collaborators_invited_by') THEN
        ALTER TABLE project_collaborators ADD CONSTRAINT fk_project_collaborators_invited_by FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Project issues constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_issues_project_id') THEN
ALTER TABLE project_issues ADD CONSTRAINT fk_project_issues_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_issues_current_step') THEN
ALTER TABLE project_issues ADD CONSTRAINT fk_project_issues_current_step FOREIGN KEY (current_step_id) REFERENCES issue_steps(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_issues_created_by') THEN
        ALTER TABLE project_issues ADD CONSTRAINT fk_project_issues_created_by FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Project phases constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_phases_project_id') THEN
        ALTER TABLE project_phases ADD CONSTRAINT fk_project_phases_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Tasks constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_project_id') THEN
        ALTER TABLE tasks ADD CONSTRAINT fk_tasks_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    -- Drop and recreate the assignee_id constraint to ensure it references contacts, not users
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_assignee_id') THEN
        ALTER TABLE tasks DROP CONSTRAINT fk_tasks_assignee_id;
    END IF;
    -- Also drop if it exists with the default PostgreSQL naming
    ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
    -- Recreate the constraint to reference contacts(id)
    ALTER TABLE tasks ADD CONSTRAINT fk_tasks_assignee_id FOREIGN KEY (assignee_id) REFERENCES contacts(id) ON DELETE SET NULL;
END $$;

-- User preferences constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_preferences_user_id') THEN
        ALTER TABLE user_preferences ADD CONSTRAINT fk_user_preferences_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Activity log constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_activity_log_user_id') THEN
        ALTER TABLE activity_log ADD CONSTRAINT fk_activity_log_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    -- Drop and recreate the project_id constraint with CASCADE to allow project deletion
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_activity_log_project_id') THEN
        ALTER TABLE activity_log DROP CONSTRAINT fk_activity_log_project_id;
    END IF;
    ALTER TABLE activity_log ADD CONSTRAINT fk_activity_log_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
END $$;

-- Invitations constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_organization_id') THEN
        ALTER TABLE invitations ADD CONSTRAINT fk_invitations_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_role_id') THEN
        ALTER TABLE invitations ADD CONSTRAINT fk_invitations_role_id FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_project_id') THEN
        ALTER TABLE invitations ADD CONSTRAINT fk_invitations_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_issue_id') THEN
        ALTER TABLE invitations ADD CONSTRAINT fk_invitations_issue_id FOREIGN KEY (issue_id) REFERENCES project_issues(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_step_id') THEN
        ALTER TABLE invitations ADD CONSTRAINT fk_invitations_step_id FOREIGN KEY (step_id) REFERENCES issue_steps(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_invited_by') THEN
        ALTER TABLE invitations ADD CONSTRAINT fk_invitations_invited_by FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get the organization_id of the currently logged-in user
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Gets the role of the currently logged-in user
-- Handles both old TEXT role field and new role_id system
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

-- Gets the contact_id of the currently logged-in user
CREATE OR REPLACE FUNCTION get_user_contact_id()
RETURNS UUID AS $$
  SELECT contact_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns project IDs the current user can access (same logic as projects SELECT policy).
-- Use in child-table RLS to avoid re-evaluating the full projects policy per row.
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

-- True when the user's role grants View Activity History (used by activity_log SELECT RLS).
CREATE OR REPLACE FUNCTION public.user_can_view_activity_history()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE((r.permissions->>'can_view_activity_history')::boolean, false)
      FROM public.profiles p
      LEFT JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
      LIMIT 1
    ),
    false
  );
$$;

-- Gets the email of the currently logged-in user
CREATE OR REPLACE FUNCTION get_user_email()
RETURNS TEXT AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if current user is admin
-- Checks both is_super_admin flag and role name (handles both old and new role systems)
CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    false
  ) OR get_user_role() = 'Admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if current user can view a specific role
-- Uses SECURITY DEFINER to bypass RLS when checking profiles table
CREATE OR REPLACE FUNCTION user_can_view_role(check_role_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_org_id UUID;
  user_role_id UUID;
BEGIN
  -- Get user's organization_id and role_id (bypasses RLS via SECURITY DEFINER)
  SELECT organization_id, role_id INTO user_org_id, user_role_id
  FROM public.profiles
  WHERE id = auth.uid();
  
  -- User can view role if:
  -- 1. Role is in their organization
  -- 2. Role is their own assigned role
  RETURN (
    -- Check if role is in user's organization
    (user_org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.roles 
      WHERE id = check_role_id 
      AND organization_id = user_org_id
    ))
    OR
    -- Check if role is user's assigned role
    (user_role_id IS NOT NULL AND check_role_id = user_role_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to check if current user can view a specific organization
-- Uses SECURITY DEFINER to bypass RLS when checking profiles table
CREATE OR REPLACE FUNCTION user_can_view_organization(check_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_org_id UUID;
BEGIN
  -- Get user's organization_id (bypasses RLS via SECURITY DEFINER)
  SELECT organization_id INTO user_org_id
  FROM public.profiles
  WHERE id = auth.uid();
  
  -- User can view organization if it's their own organization
  RETURN (user_org_id IS NOT NULL AND user_org_id = check_org_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to check if current user is admin (bypasses RLS via SECURITY DEFINER)
-- This is safe because it doesn't call get_user_role(), avoiding recursion
-- Kept for backward compatibility, but is_user_admin() is preferred
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role = 'Admin' OR is_super_admin = true)
  );
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

-- Helper function to check if current user can manage roles
-- Uses SECURITY DEFINER to bypass RLS when checking profiles and roles tables
CREATE OR REPLACE FUNCTION user_can_manage_roles(check_organization_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_org_id UUID;
  user_role_id UUID;
  role_permissions JSONB;
  role_count INTEGER;
BEGIN
  -- Get user's organization_id
  SELECT organization_id INTO user_org_id
  FROM public.profiles
  WHERE id = auth.uid();

  -- Must be in the same organization
  IF user_org_id IS NULL OR user_org_id != check_organization_id THEN
    RETURN FALSE;
  END IF;

  -- Get user's role_id
  SELECT role_id INTO user_role_id
  FROM public.profiles
  WHERE id = auth.uid();

  -- Special case: If user has no role assigned, check if they're creating the first role
  -- This allows initial setup where roles are being created for the first time
  IF user_role_id IS NULL THEN
    -- Count existing roles in the organization
    SELECT COUNT(*) INTO role_count
    FROM public.roles
    WHERE organization_id = check_organization_id;
    
    -- Allow if this is the first role being created (initial setup scenario)
    IF role_count = 0 THEN
      RETURN TRUE;
    END IF;
    
    RETURN FALSE;
  END IF;

  -- Get role permissions (bypass RLS via SECURITY DEFINER)
  SELECT permissions INTO role_permissions
  FROM public.roles
  WHERE id = user_role_id;

  IF role_permissions IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN COALESCE((role_permissions->>'can_manage_roles')::boolean, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  contact_uuid UUID;
BEGIN
  -- Attempt to find an existing contact by email and link it
  SELECT id INTO contact_uuid
  FROM public.contacts
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  INSERT INTO public.profiles (id, role, contact_id)
  VALUES (NEW.id, 'Team', contact_uuid);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-add project creator to project_contacts when project is created
CREATE OR REPLACE FUNCTION auto_add_project_creator()
RETURNS TRIGGER AS $$
DECLARE
  creator_contact_id UUID;
  project_org_id UUID;
BEGIN
  -- Get creator's contact_id from their profile
  SELECT contact_id INTO creator_contact_id
  FROM public.profiles
  WHERE id = NEW.created_by_user_id;
  
  -- Get project's organization_id (it's in NEW since we just inserted it)
  project_org_id := NEW.organization_id;
  
  -- Auto-add creator to project_contacts if contact_id exists and org_id is set
  IF creator_contact_id IS NOT NULL AND project_org_id IS NOT NULL THEN
    INSERT INTO public.project_contacts (project_id, contact_id, organization_id)
    VALUES (NEW.id, creator_contact_id, project_org_id)
    ON CONFLICT (project_id, contact_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it already exists to avoid conflicts
DROP TRIGGER IF EXISTS trigger_auto_add_project_creator ON public.projects;

CREATE TRIGGER trigger_auto_add_project_creator
AFTER INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION auto_add_project_creator();

-- ============================================================================
-- ROLE AND STRUCTURE UPDATES FOR SHARING MODEL
-- ============================================================================

-- Ensure profiles.role allows 'Client'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('Admin', 'PM', 'Team', 'Client'));

-- Add optional per-project role on project_contacts
ALTER TABLE project_contacts ADD COLUMN IF NOT EXISTS role TEXT;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can see projects based on their role" ON public.projects;
DROP POLICY IF EXISTS "Only admins can create projects" ON public.projects;
DROP POLICY IF EXISTS "Admins and PMs can create projects" ON public.projects;
DROP POLICY IF EXISTS "All authenticated users can create projects" ON public.projects;
DROP POLICY IF EXISTS "Admins and PMs can update projects" ON public.projects;
DROP POLICY IF EXISTS "Admins and PMs can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Admins, PMs, and creators can delete projects" ON public.projects;

DROP POLICY IF EXISTS "Users can see their own profile and admins see all" ON public.profiles;
DROP POLICY IF EXISTS "Users can see their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can see profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "All authenticated users can see profiles" ON public.profiles;
DROP POLICY IF EXISTS "Only system can create profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile, admins can update any" ON public.profiles;
DROP POLICY IF EXISTS "Only admins can delete profiles" ON public.profiles;

DROP POLICY IF EXISTS "All authenticated users can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can view their own contacts and contacts with their email" ON public.contacts;
DROP POLICY IF EXISTS "Only admins can create contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can create contacts" ON public.contacts;
DROP POLICY IF EXISTS "Only admins can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Only admins can delete contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can delete their own contacts" ON public.contacts;

DROP POLICY IF EXISTS "Users can see events for projects they have access to" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can create events for accessible projects" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can update events for accessible projects" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can delete events for accessible projects" ON public.calendar_events;

DROP POLICY IF EXISTS "All authenticated users can view event categories" ON public.event_categories;
DROP POLICY IF EXISTS "Only admins can create event categories" ON public.event_categories;
DROP POLICY IF EXISTS "Only admins can update event categories" ON public.event_categories;
DROP POLICY IF EXISTS "Only admins can delete event categories" ON public.event_categories;

DROP POLICY IF EXISTS "Users can see files for projects they have access to" ON public.files;
DROP POLICY IF EXISTS "Users can upload files to accessible projects" ON public.files;
DROP POLICY IF EXISTS "Users can update files for accessible projects" ON public.files;
DROP POLICY IF EXISTS "Users can delete files for accessible projects" ON public.files;

DROP POLICY IF EXISTS "Users can see comments for accessible projects" ON public.issue_comments;
DROP POLICY IF EXISTS "Users can create comments for accessible projects" ON public.issue_comments;
DROP POLICY IF EXISTS "Users can update their own comments or admins/PMs can update any" ON public.issue_comments;
DROP POLICY IF EXISTS "Users can delete their own comments within 15 minutes or admins/PMs can delete any" ON public.issue_comments;

DROP POLICY IF EXISTS "Users can see issue files for accessible projects" ON public.issue_files;
DROP POLICY IF EXISTS "Users can upload issue files for accessible projects" ON public.issue_files;
DROP POLICY IF EXISTS "Users can update issue files for accessible projects" ON public.issue_files;
DROP POLICY IF EXISTS "Users can delete issue files for accessible projects" ON public.issue_files;

DROP POLICY IF EXISTS "Users can see issue steps for accessible projects" ON public.issue_steps;
DROP POLICY IF EXISTS "Users can create issue steps for accessible projects" ON public.issue_steps;
DROP POLICY IF EXISTS "Users can update their assigned steps or admins/PMs can update any" ON public.issue_steps;
DROP POLICY IF EXISTS "Admins and PMs can delete issue steps" ON public.issue_steps;

DROP POLICY IF EXISTS "Users can see channels for projects they have access to" ON public.message_channels;
DROP POLICY IF EXISTS "Users can create channels for accessible projects" ON public.message_channels;
DROP POLICY IF EXISTS "Users can update channels for accessible projects" ON public.message_channels;
DROP POLICY IF EXISTS "Users can delete channels for accessible projects" ON public.message_channels;

DROP POLICY IF EXISTS "Users can see messages for accessible projects" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages for accessible projects" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages or admins/PMs can update any" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages or admins/PMs can delete any" ON public.messages;

DROP POLICY IF EXISTS "Users can see reactions for accessible messages" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can create reactions for accessible messages" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.message_reactions;

DROP POLICY IF EXISTS "Users can see typing indicators for accessible channels" ON public.typing_indicators;
DROP POLICY IF EXISTS "Users can create typing indicators for accessible channels" ON public.typing_indicators;
DROP POLICY IF EXISTS "Users can update their own typing indicators" ON public.typing_indicators;
DROP POLICY IF EXISTS "Users can delete their own typing indicators" ON public.typing_indicators;

DROP POLICY IF EXISTS "Users can see their own message reads" ON public.message_reads;
DROP POLICY IF EXISTS "Users can create their own message reads" ON public.message_reads;
DROP POLICY IF EXISTS "Users can update their own message reads" ON public.message_reads;
DROP POLICY IF EXISTS "Users can delete their own message reads" ON public.message_reads;

DROP POLICY IF EXISTS "Users can see their own channel reads" ON public.channel_reads;
DROP POLICY IF EXISTS "Users can create their own channel reads" ON public.channel_reads;
DROP POLICY IF EXISTS "Users can update their own channel reads" ON public.channel_reads;
DROP POLICY IF EXISTS "Users can delete their own channel reads" ON public.channel_reads;

DROP POLICY IF EXISTS "Users can see project contacts for accessible projects" ON public.project_contacts;
DROP POLICY IF EXISTS "Admins and PMs can assign contacts to projects" ON public.project_contacts;
DROP POLICY IF EXISTS "Admins and PMs can update project contacts" ON public.project_contacts;
DROP POLICY IF EXISTS "Admins and PMs can remove contacts from projects" ON public.project_contacts;

DROP POLICY IF EXISTS "Users can see issues for projects they have access to" ON public.project_issues;
DROP POLICY IF EXISTS "Users can create issues for accessible projects" ON public.project_issues;
DROP POLICY IF EXISTS "Users can update issues for accessible projects" ON public.project_issues;
DROP POLICY IF EXISTS "Admins and PMs can delete issues" ON public.project_issues;
DROP POLICY IF EXISTS "Admins, PMs, and creators can delete issues" ON public.project_issues;

DROP POLICY IF EXISTS "Users can see phases for projects they have access to" ON public.project_phases;
DROP POLICY IF EXISTS "Users can create phases for accessible projects" ON public.project_phases;
DROP POLICY IF EXISTS "Users can update phases for accessible projects" ON public.project_phases;
DROP POLICY IF EXISTS "Users can delete phases for accessible projects" ON public.project_phases;

DROP POLICY IF EXISTS "Users can see tasks for projects they have access to" ON public.tasks;
DROP POLICY IF EXISTS "Users can create tasks for accessible projects" ON public.tasks;
DROP POLICY IF EXISTS "Users can update their assigned tasks or admins/PMs can update any" ON public.tasks;
DROP POLICY IF EXISTS "Admins and PMs can delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins, PMs, and creators can delete tasks" ON public.tasks;

DROP POLICY IF EXISTS "Users can only see their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can create their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.user_preferences;

DROP POLICY IF EXISTS "Users can see activity for projects they have access to" ON public.activity_log;
DROP POLICY IF EXISTS "Users can see activity with permission and scope" ON public.activity_log;
DROP POLICY IF EXISTS "Users can create activity logs for accessible projects" ON public.activity_log;
DROP POLICY IF EXISTS "Users can create activity logs for accessible scope" ON public.activity_log;
DROP POLICY IF EXISTS "Users can update their own activity logs" ON public.activity_log;
DROP POLICY IF EXISTS "Users can delete their own activity logs" ON public.activity_log;

DROP POLICY IF EXISTS "Users can see invitations they sent or received" ON public.invitations;
DROP POLICY IF EXISTS "Public can view invitations by token" ON public.invitations;
DROP POLICY IF EXISTS "Authenticated users can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can update their sent invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can accept their own invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can delete their sent invitations" ON public.invitations;

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ROLES TABLE POLICIES
-- ============================================================================

-- Drop ALL existing roles policies to avoid conflicts
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'roles'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.roles', r.policyname);
  END LOOP;
END $$;

-- Users can view ALL roles in their organization or their own assigned role
-- This allows profile queries with roles relationship to work and setup wizard to function
CREATE POLICY "Users can view roles in their organization"
ON public.roles
FOR SELECT
TO authenticated
USING (
  -- Users can view ALL roles in their organization
  organization_id IN (
    SELECT organization_id
    FROM public.profiles
    WHERE id = auth.uid()
    AND organization_id IS NOT NULL
  )
  OR
  -- Users can always view their own assigned role
  (id IN (
    SELECT role_id
    FROM public.profiles
    WHERE id = auth.uid()
    AND role_id IS NOT NULL
  ))
);

-- Public (unauthenticated) users can read roles for pending invitations
CREATE POLICY "Public can view roles for invitations"
ON public.roles
FOR SELECT
TO anon
USING (
  id IN (
    SELECT role_id 
    FROM public.invitations 
    WHERE status = 'pending' 
    AND invitation_token IS NOT NULL
    AND role_id IS NOT NULL
  )
);

-- Roles INSERT Policy: Users with can_manage_roles permission can create roles
CREATE POLICY "Users with can_manage_roles can create roles"
ON public.roles
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_can_manage_roles(organization_id)
);

-- Roles UPDATE Policy: Users with can_manage_roles permission can update roles
CREATE POLICY "Users with can_manage_roles can update roles"
ON public.roles
FOR UPDATE
USING (user_can_manage_roles(organization_id))
WITH CHECK (user_can_manage_roles(organization_id));

-- Roles DELETE Policy: Users with can_manage_roles permission can delete non-system roles
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

-- Drop ALL existing organizations policies to avoid conflicts
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'organizations' AND schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organizations', r.policyname);
  END LOOP;
END $$;

-- Users can view their own organization
CREATE POLICY "Users can view their own organization"
ON public.organizations
FOR SELECT
USING (
  -- Use helper function to check access (bypasses RLS via SECURITY DEFINER)
  user_can_view_organization(id)
);

-- Public (unauthenticated) users can read organizations for pending invitations
CREATE POLICY "Public can view organizations for invitations"
ON public.organizations
FOR SELECT
TO anon
USING (
  id IN (
    SELECT organization_id 
    FROM public.invitations 
    WHERE status = 'pending' 
    AND invitation_token IS NOT NULL
    AND organization_id IS NOT NULL
  )
);

-- Admins can update their organization
CREATE POLICY "Admins can update their organization"
ON public.organizations
FOR UPDATE
USING (
  id = get_user_organization_id()
  AND is_user_admin()
);

-- Only super admins can create organizations
CREATE POLICY "Only super admins can create organizations"
ON public.organizations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND is_super_admin = true
  )
);

-- Only super admins can delete organizations
CREATE POLICY "Only super admins can delete organizations"
ON public.organizations
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND is_super_admin = true
  )
);

-- ============================================================================
-- PROJECTS TABLE POLICIES
-- ============================================================================

-- Drop ALL existing projects policies to avoid conflicts
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
-- PROFILES TABLE POLICIES
-- ============================================================================

-- Profiles SELECT policy: Users can see their own profile and profiles in their organization
CREATE POLICY "Users can see profiles in their organization"
ON public.profiles FOR SELECT
USING (
  (id = auth.uid())  -- Own profile
  OR
  (organization_id IS NOT NULL 
   AND organization_id = get_user_organization_id())  -- Same org members
);

-- Profiles INSERT policy: Only allow trigger function or users creating their own profile
-- The trigger function uses SECURITY DEFINER so it bypasses RLS
CREATE POLICY "Users can create their own profile"
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

-- Profiles UPDATE policy: Users can update their own profile, admins can update any
-- Note: Admin check uses is_current_user_admin() which bypasses RLS, avoiding recursion
CREATE POLICY "Users can update their own profile, admins can update any"
ON public.profiles FOR UPDATE
USING (
  (id = auth.uid()) 
  OR 
  is_current_user_admin()
);

-- Profiles DELETE policy: Only admins can delete profiles
CREATE POLICY "Only admins can delete profiles"
ON public.profiles FOR DELETE
USING (is_current_user_admin());

-- ============================================================================
-- CONTACTS TABLE POLICIES
-- ============================================================================

-- Contacts SELECT policy
-- Simplified to avoid infinite recursion by removing cross-table queries
-- Users can see contacts in their organization, their own contact, or contacts they created
CREATE POLICY "Users can view contacts in their organization"
ON public.contacts
FOR SELECT
USING (
  -- Contacts in same organization (primary access method - avoids recursion)
  organization_id = get_user_organization_id()
  OR
  -- Users can see their own contact (by email match, even if org is different - for collaborators)
  (LOWER(email) = LOWER(get_user_email()))
  OR
  -- Users can see contacts they created (even if org is different)
  (created_by_user_id = auth.uid())
);

-- Contacts INSERT policy
CREATE POLICY "Authenticated users can create contacts"
ON public.contacts
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Contacts UPDATE policy
CREATE POLICY "Users can update their own contacts"
ON public.contacts
FOR UPDATE
USING (created_by_user_id = auth.uid());

-- Contacts DELETE policy
CREATE POLICY "Users can delete their own contacts"
ON public.contacts
FOR DELETE
USING (created_by_user_id = auth.uid());

-- ============================================================================
-- CALENDAR EVENTS TABLE POLICIES
-- ============================================================================

-- Calendar events SELECT policy
CREATE POLICY "Users can see events for projects they have access to"
ON public.calendar_events
FOR SELECT
USING (
  (project_id IS NULL AND (user_id = auth.uid()))
  OR
  (project_id IN (SELECT get_accessible_project_ids()))
);

-- Calendar events INSERT policy
CREATE POLICY "Users can create events for accessible projects"
ON public.calendar_events
FOR INSERT
WITH CHECK (
  (project_id IS NULL AND (user_id = auth.uid()))
  OR
  (project_id IN (SELECT get_accessible_project_ids()))
);

-- Calendar events UPDATE policy
CREATE POLICY "Users can update events for accessible projects"
ON public.calendar_events
FOR UPDATE
USING (
  (project_id IS NULL AND (user_id = auth.uid()))
  OR
  (project_id IN (SELECT get_accessible_project_ids()))
);

-- Calendar events DELETE policy
CREATE POLICY "Users can delete events for accessible projects"
ON public.calendar_events
FOR DELETE
USING (
  (project_id IS NULL AND (user_id = auth.uid()))
  OR
  (project_id IN (SELECT get_accessible_project_ids()))
);

-- ============================================================================
-- EVENT CATEGORIES TABLE POLICIES
-- ============================================================================

-- Event categories SELECT policy
CREATE POLICY "All authenticated users can view event categories"
ON public.event_categories
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Event categories INSERT policy
CREATE POLICY "Only admins can create event categories"
ON public.event_categories
FOR INSERT
WITH CHECK (get_user_role() = 'Admin');

-- Event categories UPDATE policy
CREATE POLICY "Only admins can update event categories"
ON public.event_categories
FOR UPDATE
USING (get_user_role() = 'Admin');

-- Event categories DELETE policy
CREATE POLICY "Only admins can delete event categories"
ON public.event_categories
FOR DELETE
USING (get_user_role() = 'Admin');

-- ============================================================================
-- FILES TABLE POLICIES
-- ============================================================================

-- Files SELECT policy
CREATE POLICY "Users can see files for projects they have access to"
ON public.files
FOR SELECT
USING (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Files INSERT policy
CREATE POLICY "Users can upload files to accessible projects"
ON public.files
FOR INSERT
WITH CHECK (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Files UPDATE policy
CREATE POLICY "Users can update files for accessible projects"
ON public.files
FOR UPDATE
USING (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Files DELETE policy
CREATE POLICY "Users can delete files for accessible projects"
ON public.files
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin' OR created_by_user_id = auth.uid()
  )
);

-- ============================================================================
-- ISSUE COMMENTS TABLE POLICIES
-- ============================================================================

-- Issue comments SELECT policy
CREATE POLICY "Users can see comments for accessible projects"
ON public.issue_comments
FOR SELECT
USING (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Issue comments INSERT policy
CREATE POLICY "Users can create comments for accessible projects"
ON public.issue_comments
FOR INSERT
WITH CHECK (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Issue comments UPDATE policy
CREATE POLICY "Users can update their own comments or admins/PMs can update any"
ON public.issue_comments
FOR UPDATE
USING (
  (user_id = auth.uid()) -- Own comments
  OR
  (issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin'
    )
  ))
);

-- Issue comments DELETE policy
CREATE POLICY "Users can delete their own comments within 15 minutes or admins/PMs can delete any"
ON public.issue_comments
FOR DELETE
USING (
  (user_id = auth.uid() AND created_at > NOW() - INTERVAL '15 minutes') -- Own recent comments
  OR
  (issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin'
    )
  ))
);

-- ============================================================================
-- ISSUE FILES TABLE POLICIES
-- ============================================================================

-- Issue files SELECT policy
CREATE POLICY "Users can see issue files for accessible projects"
ON public.issue_files
FOR SELECT
USING (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Issue files INSERT policy
CREATE POLICY "Users can upload issue files for accessible projects"
ON public.issue_files
FOR INSERT
WITH CHECK (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Issue files UPDATE policy
CREATE POLICY "Users can update issue files for accessible projects"
ON public.issue_files
FOR UPDATE
USING (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Issue files DELETE policy
CREATE POLICY "Users can delete issue files for accessible projects"
ON public.issue_files
FOR DELETE
USING (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- ============================================================================
-- ISSUE STEPS TABLE POLICIES
-- ============================================================================

-- Issue steps SELECT policy
CREATE POLICY "Users can see issue steps for accessible projects"
ON public.issue_steps
FOR SELECT
USING (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Issue steps INSERT policy
CREATE POLICY "Users can create issue steps for accessible projects"
ON public.issue_steps
FOR INSERT
WITH CHECK (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Issue steps UPDATE policy
CREATE POLICY "Users can update their assigned steps or admins/PMs can update any"
ON public.issue_steps
FOR UPDATE
USING (
  (assigned_to_user_id = auth.uid()) -- Own assigned steps
  OR
  (issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin'
    )
  ))
);

-- Issue steps DELETE policy
CREATE POLICY "Admins and PMs can delete issue steps"
ON public.issue_steps
FOR DELETE
USING (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin'
    )
  )
);

-- ============================================================================
-- MESSAGE CHANNELS TABLE POLICIES
-- ============================================================================

-- Message channels SELECT policy
CREATE POLICY "Users can see channels for projects they have access to"
ON public.message_channels
FOR SELECT
USING (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Message channels INSERT policy
CREATE POLICY "Users can create channels for accessible projects"
ON public.message_channels
FOR INSERT
WITH CHECK (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Message channels UPDATE policy
CREATE POLICY "Users can update channels for accessible projects"
ON public.message_channels
FOR UPDATE
USING (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Message channels DELETE policy
CREATE POLICY "Users can delete channels for accessible projects"
ON public.message_channels
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin' OR created_by_user_id = auth.uid()
  )
);

-- ============================================================================
-- MESSAGES TABLE POLICIES
-- ============================================================================

-- Messages SELECT policy
CREATE POLICY "Users can see messages for accessible projects"
ON public.messages
FOR SELECT
USING (
  channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Messages INSERT policy
-- Use the same access logic as message_channels SELECT policy
CREATE POLICY "Users can create messages for accessible projects"
ON public.messages
FOR INSERT
WITH CHECK (
  user_id = auth.uid() -- Users can only create messages as themselves
  AND
  channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (
      SELECT id FROM public.projects WHERE
        organization_id = get_user_organization_id()
        AND (
          (get_user_role() = 'Admin')
          OR
          (project_manager_id = auth.uid())
          OR
          (created_by_user_id = auth.uid())
          OR
          (id IN (
            SELECT project_id
            FROM public.project_contacts
            WHERE contact_id = get_user_contact_id()
              AND organization_id = get_user_organization_id()
          ))
        )
    )
  )
);

-- Messages UPDATE policy
CREATE POLICY "Users can update their own messages or admins/PMs can update any"
ON public.messages
FOR UPDATE
USING (
  (user_id = auth.uid()) -- Own messages
  OR
  (channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin'
    )
  ))
);

-- Messages DELETE policy
CREATE POLICY "Users can delete their own messages or admins/PMs can delete any"
ON public.messages
FOR DELETE
USING (
  (user_id = auth.uid()) -- Own messages
  OR
  (channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (
      SELECT id FROM public.projects 
      WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin'
    )
  ))
);

-- ============================================================================
-- MESSAGE REACTIONS TABLE POLICIES
-- ============================================================================

-- Message reactions SELECT policy
CREATE POLICY "Users can see reactions for accessible messages"
ON public.message_reactions
FOR SELECT
USING (
  message_id IN (
    SELECT m.id 
    FROM public.messages m
    JOIN public.message_channels mc ON m.channel_id = mc.id
    WHERE mc.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Message reactions INSERT policy
CREATE POLICY "Users can create reactions for accessible messages"
ON public.message_reactions
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND
  message_id IN (
    SELECT m.id 
    FROM public.messages m
    JOIN public.message_channels mc ON m.channel_id = mc.id
    WHERE mc.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Message reactions DELETE policy
CREATE POLICY "Users can delete their own reactions"
ON public.message_reactions
FOR DELETE
USING (user_id = auth.uid());

-- ============================================================================
-- TYPING INDICATORS TABLE POLICIES
-- ============================================================================

-- Typing indicators SELECT policy
CREATE POLICY "Users can see typing indicators for accessible channels"
ON public.typing_indicators
FOR SELECT
USING (
  channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Typing indicators INSERT policy
CREATE POLICY "Users can create typing indicators for accessible channels"
ON public.typing_indicators
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND
  channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Typing indicators UPDATE policy
CREATE POLICY "Users can update their own typing indicators"
ON public.typing_indicators
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Typing indicators DELETE policy
CREATE POLICY "Users can delete their own typing indicators"
ON public.typing_indicators
FOR DELETE
USING (user_id = auth.uid());

-- ============================================================================
-- MESSAGE READS TABLE POLICIES
-- ============================================================================

-- Message reads SELECT policy
CREATE POLICY "Users can see their own message reads"
ON public.message_reads
FOR SELECT
USING (user_id = auth.uid());

-- Message reads INSERT policy
CREATE POLICY "Users can create their own message reads"
ON public.message_reads
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Message reads UPDATE policy
CREATE POLICY "Users can update their own message reads"
ON public.message_reads
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Message reads DELETE policy
CREATE POLICY "Users can delete their own message reads"
ON public.message_reads
FOR DELETE
USING (user_id = auth.uid());

-- ============================================================================
-- CHANNEL READS TABLE POLICIES
-- ============================================================================

-- Channel reads SELECT policy
CREATE POLICY "Users can see their own channel reads"
ON public.channel_reads
FOR SELECT
USING (user_id = auth.uid());

-- Channel reads INSERT policy
CREATE POLICY "Users can create their own channel reads"
ON public.channel_reads
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND
  channel_id IN (
    SELECT mc.id 
    FROM public.message_channels mc 
    WHERE mc.project_id IN (SELECT get_accessible_project_ids())
  )
);

-- Channel reads UPDATE policy
CREATE POLICY "Users can update their own channel reads"
ON public.channel_reads
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Channel reads DELETE policy
CREATE POLICY "Users can delete their own channel reads"
ON public.channel_reads
FOR DELETE
USING (user_id = auth.uid());

-- ============================================================================
-- PROJECT CONTACTS TABLE POLICIES
-- ============================================================================

-- Drop ALL existing project_contacts policies to avoid conflicts
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
-- Admins can add any contact in their organization
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
-- PROJECT ISSUES TABLE POLICIES
-- ============================================================================

-- Project issues SELECT policy
CREATE POLICY "Users can see issues for projects they have access to"
ON public.project_issues
FOR SELECT
USING (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Project issues INSERT policy
CREATE POLICY "Users can create issues for accessible projects"
ON public.project_issues
FOR INSERT
WITH CHECK (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Project issues UPDATE policy
CREATE POLICY "Users can update issues for accessible projects"
ON public.project_issues
FOR UPDATE
USING (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Project issues DELETE policy
CREATE POLICY "Admins, PMs, and creators can delete issues"
ON public.project_issues
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects 
    WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin' OR created_by_user_id = auth.uid()
  )
);

-- ============================================================================
-- PROJECT PHASES TABLE POLICIES
-- ============================================================================

-- Project phases SELECT policy
CREATE POLICY "Users can see phases for projects they have access to"
ON public.project_phases
FOR SELECT
USING (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Project phases INSERT policy
CREATE POLICY "Users can create phases for accessible projects"
ON public.project_phases
FOR INSERT
WITH CHECK (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Project phases UPDATE policy
CREATE POLICY "Users can update phases for accessible projects"
ON public.project_phases
FOR UPDATE
USING (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Project phases DELETE policy
CREATE POLICY "Users can delete phases for accessible projects"
ON public.project_phases
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin' OR created_by_user_id = auth.uid()
  )
);

-- ============================================================================
-- TASKS TABLE POLICIES
-- ============================================================================

-- Tasks SELECT policy
CREATE POLICY "Users can see tasks for projects they have access to"
ON public.tasks
FOR SELECT
USING (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Tasks INSERT policy
CREATE POLICY "Users can create tasks for accessible projects"
ON public.tasks
FOR INSERT
WITH CHECK (
  project_id IN (SELECT get_accessible_project_ids())
);

-- Tasks UPDATE policy
CREATE POLICY "Users can update their assigned tasks or admins/PMs can update any"
ON public.tasks
FOR UPDATE
USING (
  (assignee_id IN (SELECT contact_id FROM public.profiles WHERE id = auth.uid() AND contact_id IS NOT NULL)) -- Own assigned tasks (via contact_id)
  OR
  (project_id IN (
    SELECT id FROM public.projects 
    WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin'
  ))
);

-- Tasks DELETE policy
CREATE POLICY "Admins, PMs, and creators can delete tasks"
ON public.tasks
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects 
    WHERE project_manager_id = auth.uid() OR get_user_role() = 'Admin' OR created_by_user_id = auth.uid()
  )
);

-- ============================================================================
-- TASK DEPENDENCIES TABLE POLICIES
-- ============================================================================

-- Task dependencies SELECT policy
CREATE POLICY "Users can view task dependencies they have access to"
ON public.task_dependencies
FOR SELECT
USING (
  task_id IN (SELECT id FROM public.tasks)
  AND successor_task_id IN (SELECT id FROM public.tasks)
);

-- Task dependencies INSERT policy
CREATE POLICY "Users can create task dependencies for accessible tasks"
ON public.task_dependencies
FOR INSERT
WITH CHECK (
  task_id IN (SELECT id FROM public.tasks)
  AND successor_task_id IN (SELECT id FROM public.tasks)
);

-- Task dependencies UPDATE policy
CREATE POLICY "Users can update task dependencies for accessible tasks"
ON public.task_dependencies
FOR UPDATE
USING (
  task_id IN (SELECT id FROM public.tasks)
  AND successor_task_id IN (SELECT id FROM public.tasks)
);

-- Task dependencies DELETE policy
CREATE POLICY "Users can delete task dependencies for accessible tasks"
ON public.task_dependencies
FOR DELETE
USING (
  task_id IN (SELECT id FROM public.tasks)
  AND successor_task_id IN (SELECT id FROM public.tasks)
);

-- ============================================================================
-- PROJECT TEMPLATES TABLE POLICIES
-- ============================================================================

-- Project templates SELECT policy
CREATE POLICY "Users can view their organization templates"
ON public.project_templates
FOR SELECT
USING (organization_id = (SELECT get_user_organization_id()));

-- Project templates INSERT policy
CREATE POLICY "Users can create templates for their organization"
ON public.project_templates
FOR INSERT
WITH CHECK (organization_id = (SELECT get_user_organization_id()));

-- Project templates UPDATE policy
CREATE POLICY "Users can update their organization templates"
ON public.project_templates
FOR UPDATE
USING (organization_id = (SELECT get_user_organization_id()));

-- Project templates DELETE policy
CREATE POLICY "Users can delete their organization templates"
ON public.project_templates
FOR DELETE
USING (organization_id = (SELECT get_user_organization_id()));

-- ============================================================================
-- SCHEDULE IMPORT TEMPLATES TABLE POLICIES
-- ============================================================================

ALTER TABLE public.schedule_import_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization schedule import templates"
ON public.schedule_import_templates
FOR SELECT
USING (organization_id = (SELECT get_user_organization_id()));

CREATE POLICY "Users can create schedule import templates for their organization"
ON public.schedule_import_templates
FOR INSERT
WITH CHECK (organization_id = (SELECT get_user_organization_id()));

CREATE POLICY "Users can update their organization schedule import templates"
ON public.schedule_import_templates
FOR UPDATE
USING (organization_id = (SELECT get_user_organization_id()));

CREATE POLICY "Users can delete their organization schedule import templates"
ON public.schedule_import_templates
FOR DELETE
USING (organization_id = (SELECT get_user_organization_id()));

-- ============================================================================
-- USER PREFERENCES TABLE POLICIES
-- ============================================================================

-- User preferences SELECT policy
CREATE POLICY "Users can only see their own preferences"
ON public.user_preferences
FOR SELECT
USING (user_id = auth.uid());

-- User preferences INSERT policy
CREATE POLICY "Users can create their own preferences"
ON public.user_preferences
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- User preferences UPDATE policy
CREATE POLICY "Users can update their own preferences"
ON public.user_preferences
FOR UPDATE
USING (user_id = auth.uid());

-- User preferences DELETE policy
CREATE POLICY "Users can delete their own preferences"
ON public.user_preferences
FOR DELETE
USING (user_id = auth.uid());

-- ============================================================================
-- ACTIVITY LOG TABLE POLICIES
-- ============================================================================

-- Activity log SELECT policy (requires role permission or org admin; supports NULL project_id org rows)
CREATE POLICY "Users can see activity with permission and scope"
ON public.activity_log
FOR SELECT
TO authenticated
USING (
  (
    user_can_view_activity_history()
    OR is_user_admin()
  )
  AND (
    (
      project_id IS NOT NULL
      AND project_id IN (SELECT get_accessible_project_ids())
    )
    OR (
      project_id IS NULL
      AND organization_id = get_user_organization_id()
    )
  )
);

-- Activity log INSERT policy (project rows or org-only rows in user's org)
CREATE POLICY "Users can create activity logs for accessible scope"
ON public.activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  (
    project_id IS NOT NULL
    AND project_id IN (SELECT get_accessible_project_ids())
  )
  OR (
    project_id IS NULL
    AND organization_id = get_user_organization_id()
  )
);

-- Activity log UPDATE policy (rarely used, but allow users to update their own logs)
CREATE POLICY "Users can update their own activity logs"
ON public.activity_log
FOR UPDATE
USING (user_id = auth.uid());

-- Activity log DELETE policy (rarely used, but allow users to delete their own logs)
CREATE POLICY "Users can delete their own activity logs"
ON public.activity_log
FOR DELETE
USING (user_id = auth.uid());

-- ============================================================================
-- INVITATIONS TABLE POLICIES
-- ============================================================================

-- Invitations SELECT policy (simplified and more permissive)
-- Public users: can read pending invitations by token (for invite acceptance)
-- Authenticated users: can see invitations they sent or that match their email
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
    auth.uid() IS NOT NULL
    AND invited_by_user_id = auth.uid()
  )
  OR
  -- Authenticated users can see invitations sent to their email (via contacts, not auth.users)
  (
    auth.uid() IS NOT NULL
    AND email IN (
      SELECT c.email
      FROM public.profiles p
      JOIN public.contacts c ON p.contact_id = c.id
      WHERE p.id = auth.uid()
    )
  )
);

-- Invitations INSERT policy
CREATE POLICY "Authenticated users can create invitations"
ON public.invitations
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    invited_by_user_id = auth.uid() -- Can only create invitations as themselves
  )
);

-- Invitations UPDATE policy
-- More permissive: allow updates by token or by email match
CREATE POLICY "Users can accept their own invitations"
ON public.invitations
FOR UPDATE
USING (
  (invited_by_user_id = auth.uid()) -- Sender can cancel/update
  OR
  (status = 'pending' AND invitation_token IS NOT NULL) -- Anyone with token can accept (for public invite flow)
  OR
  (email = get_user_email() AND status = 'pending') -- Recipient can accept by email match
)
WITH CHECK (
  (invited_by_user_id = auth.uid()) -- Sender can cancel/update
  OR
  (status IN ('pending', 'accepted')) -- Can update to accepted status
);

-- Invitations DELETE policy
CREATE POLICY "Users can delete their sent invitations"
ON public.invitations
FOR DELETE
USING (invited_by_user_id = auth.uid());

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Existing indexes
CREATE INDEX IF NOT EXISTS idx_calendar_events_project_id ON calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON issue_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_step_id ON issue_comments(step_id);
CREATE INDEX IF NOT EXISTS idx_issue_files_issue_id ON issue_files(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_files_step_id ON issue_files(step_id);
CREATE INDEX IF NOT EXISTS idx_issue_steps_issue_id ON issue_steps(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_steps_status ON issue_steps(status);
CREATE INDEX IF NOT EXISTS idx_issue_steps_assigned_to_user ON issue_steps(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_message_channels_project_id ON message_channels(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_channel_id ON typing_indicators(channel_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_user_id ON typing_indicators(user_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_updated_at ON typing_indicators(updated_at);
CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user_id ON message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_reads_user_id ON channel_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_reads_channel_id ON channel_reads(channel_id);
CREATE INDEX IF NOT EXISTS idx_project_issues_project_id ON project_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_project_issues_status ON project_issues(status);
CREATE INDEX IF NOT EXISTS idx_project_issues_priority ON project_issues(priority);

-- RLS-specific indexes
CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id ON projects(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_contact_id ON profiles(contact_id);
CREATE INDEX IF NOT EXISTS idx_project_contacts_project_id ON project_contacts(project_id);
CREATE INDEX IF NOT EXISTS idx_project_contacts_contact_id ON project_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Audit field indexes
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_files_created_by ON files(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_issue_steps_created_by ON issue_steps(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_project_issues_created_by ON project_issues(created_by_user_id);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity_type ON activity_log(entity_type);

-- Invitations indexes
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_invitations_organization_id ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_role_id ON invitations(role_id);
CREATE INDEX IF NOT EXISTS idx_invitations_project_id ON invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations(invited_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_pending ON invitations(status, invitation_token) WHERE status = 'pending';

-- Organization and role indexes for RLS performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_role ON profiles(organization_id, role_id);
CREATE INDEX IF NOT EXISTS idx_roles_organization_id ON roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_project_id ON project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_user_id ON project_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_organization_id ON project_collaborators(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_contacts_org_contact ON project_contacts(organization_id, contact_id);

-- Organization_id indexes for all data tables (critical for RLS performance)
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_organization_id ON calendar_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_event_categories_organization_id ON event_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_files_organization_id ON files(organization_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_organization_id ON issue_comments(organization_id);
CREATE INDEX IF NOT EXISTS idx_issue_files_organization_id ON issue_files(organization_id);
CREATE INDEX IF NOT EXISTS idx_issue_steps_organization_id ON issue_steps(organization_id);
CREATE INDEX IF NOT EXISTS idx_message_channels_organization_id ON message_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_organization_id ON messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_organization_id ON message_reactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_organization_id ON typing_indicators(organization_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_organization_id ON message_reads(organization_id);
CREATE INDEX IF NOT EXISTS idx_channel_reads_organization_id ON channel_reads(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_issues_organization_id ON project_issues(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_organization_id ON project_phases(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_organization_id ON activity_log(organization_id);

-- Task dependencies indexes
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_successor_task_id ON task_dependencies(successor_task_id);

-- View: task_dependencies by project_id (enables parallel Gantt fetch in app)
CREATE OR REPLACE VIEW task_dependencies_by_project AS
SELECT td.id, td.task_id, td.successor_task_id, td.dependency_type, td.lag_days, td.created_at, t.project_id
FROM task_dependencies td
JOIN tasks t ON t.id = td.task_id;

-- Gantt schedule field indexes on tasks
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON tasks(start_date) WHERE start_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_is_milestone ON tasks(is_milestone) WHERE is_milestone = true;

-- Project templates indexes
CREATE INDEX IF NOT EXISTS idx_project_templates_organization_id ON project_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_templates_created_at ON project_templates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_import_templates_organization_id ON schedule_import_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedule_import_templates_created_at ON schedule_import_templates(created_at DESC);