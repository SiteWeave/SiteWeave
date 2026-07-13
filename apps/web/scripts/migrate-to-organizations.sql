-- Migration Script: Multi-Tenant B2B Architecture
-- This script migrates the database from single-user (B2C) to Organization-based Multi-Tenant (B2B) model
-- Note: Fresh start approach - existing data will be orphaned

-- ============================================================================
-- STEP 1: CREATE NEW TABLES
-- ============================================================================

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by_user_id UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Roles table (dynamic roles with JSONB permissions)
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

-- Project Collaborators table (guest access for subcontractors)
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

-- ============================================================================
-- STEP 2: ADD ORGANIZATION_ID COLUMNS (NULLABLE INITIALLY)
-- ============================================================================

-- Add organization_id to all data tables (nullable initially for migration)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE event_categories ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE files ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE issue_comments ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE issue_files ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE issue_steps ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE message_channels ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE typing_indicators ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE message_reads ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE channel_reads ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE project_contacts ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE project_issues ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Update profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_id UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- Drop old role constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- ============================================================================
-- STEP 3: UPDATE FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Add foreign key constraints for organization_id columns
DO $$ 
BEGIN
    -- Projects
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_organization_id') THEN
        ALTER TABLE projects ADD CONSTRAINT fk_projects_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Contacts
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contacts_organization_id') THEN
        ALTER TABLE contacts ADD CONSTRAINT fk_contacts_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Calendar Events
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_events_organization_id') THEN
        ALTER TABLE calendar_events ADD CONSTRAINT fk_calendar_events_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Event Categories
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_event_categories_organization_id') THEN
        ALTER TABLE event_categories ADD CONSTRAINT fk_event_categories_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Files
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_files_organization_id') THEN
        ALTER TABLE files ADD CONSTRAINT fk_files_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Issue Comments
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_comments_organization_id') THEN
        ALTER TABLE issue_comments ADD CONSTRAINT fk_issue_comments_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Issue Files
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_files_organization_id') THEN
        ALTER TABLE issue_files ADD CONSTRAINT fk_issue_files_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Issue Steps
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_steps_organization_id') THEN
        ALTER TABLE issue_steps ADD CONSTRAINT fk_issue_steps_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Message Channels
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_channels_organization_id') THEN
        ALTER TABLE message_channels ADD CONSTRAINT fk_message_channels_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Messages
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_organization_id') THEN
        ALTER TABLE messages ADD CONSTRAINT fk_messages_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Message Reactions
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_reactions_organization_id') THEN
        ALTER TABLE message_reactions ADD CONSTRAINT fk_message_reactions_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Typing Indicators
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_typing_indicators_organization_id') THEN
        ALTER TABLE typing_indicators ADD CONSTRAINT fk_typing_indicators_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Message Reads
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_reads_organization_id') THEN
        ALTER TABLE message_reads ADD CONSTRAINT fk_message_reads_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Channel Reads
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_channel_reads_organization_id') THEN
        ALTER TABLE channel_reads ADD CONSTRAINT fk_channel_reads_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Project Contacts
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_contacts_organization_id') THEN
        ALTER TABLE project_contacts ADD CONSTRAINT fk_project_contacts_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Project Issues
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_issues_organization_id') THEN
        ALTER TABLE project_issues ADD CONSTRAINT fk_project_issues_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Project Phases
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_phases_organization_id') THEN
        ALTER TABLE project_phases ADD CONSTRAINT fk_project_phases_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Tasks
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_organization_id') THEN
        ALTER TABLE tasks ADD CONSTRAINT fk_tasks_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Activity Log
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_activity_log_organization_id') THEN
        ALTER TABLE activity_log ADD CONSTRAINT fk_activity_log_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Invitations
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invitations_organization_id') THEN
        ALTER TABLE invitations ADD CONSTRAINT fk_invitations_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Profiles
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_profiles_role_id') THEN
        ALTER TABLE profiles ADD CONSTRAINT fk_profiles_role_id FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_profiles_organization_id') THEN
        ALTER TABLE profiles ADD CONSTRAINT fk_profiles_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
    END IF;
    
    -- Project Collaborators
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_collaborators_project_id') THEN
        ALTER TABLE project_collaborators ADD CONSTRAINT fk_project_collaborators_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_collaborators_organization_id') THEN
        ALTER TABLE project_collaborators ADD CONSTRAINT fk_project_collaborators_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- STEP 4: CLEANUP ORPHANED DATA (Fresh Start Approach)
-- ============================================================================

-- Since we're doing a fresh start, delete all existing data
-- This ensures clean migration without orphaned records

-- Delete all data from tables (in reverse dependency order)
DELETE FROM activity_log;
DELETE FROM invitations;
DELETE FROM tasks;
DELETE FROM project_phases;
DELETE FROM project_issues;
DELETE FROM project_contacts;
DELETE FROM channel_reads;
DELETE FROM message_reads;
DELETE FROM typing_indicators;
DELETE FROM message_reactions;
DELETE FROM messages;
DELETE FROM message_channels;
DELETE FROM issue_steps;
DELETE FROM issue_files;
DELETE FROM issue_comments;
DELETE FROM files;
DELETE FROM event_categories;
DELETE FROM calendar_events;
DELETE FROM contacts;
DELETE FROM projects;
DELETE FROM project_collaborators;
DELETE FROM profiles;
DELETE FROM roles;
DELETE FROM organizations;

-- ============================================================================
-- STEP 5: ADD NOT NULL CONSTRAINTS
-- ============================================================================

-- Now that data is clean, add NOT NULL constraints
ALTER TABLE projects ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE calendar_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE event_categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE files ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE issue_comments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE issue_files ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE issue_steps ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE message_channels ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE message_reactions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE typing_indicators ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE message_reads ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE channel_reads ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE project_contacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE project_issues ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE project_phases ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE activity_log ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE invitations ALTER COLUMN organization_id SET NOT NULL;

-- ============================================================================
-- STEP 6: CREATE INDEXES
-- ============================================================================

-- Organization indexes
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_roles_organization_id ON roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_project_id ON project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_user_id ON project_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_organization_id ON project_collaborators(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);

-- Organization_id indexes for all tables
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
CREATE INDEX IF NOT EXISTS idx_project_contacts_organization_id ON project_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_issues_organization_id ON project_issues(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_organization_id ON project_phases(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_organization_id ON activity_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_organization_id ON invitations(organization_id);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Note: RLS policies and helper functions should be updated separately
-- See ../../../schema.sql for complete RLS policy definitions

