-- SiteWeave Database Schema
-- Complete production schema with RLS implementation
-- This is the single source of truth for the database structure

-- ============================================================================
-- TABLE DEFINITIONS
-- ============================================================================

-- Organizations Table (Multi-tenant B2B architecture)
-- setup_wizard_completed_at: set when the founding admin finishes or skips the first-run setup wizard (NULL = pending).
-- One-time backfill for existing production orgs is in supabase/migrations (not repeated here) so fresh installs behave correctly.
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    task_start_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    task_start_notification_lead_days INTEGER[] NOT NULL DEFAULT ARRAY[14, 7],
    workspace_type TEXT NOT NULL DEFAULT 'business' CHECK (workspace_type IN ('personal', 'business')),
    max_projects INTEGER,
    lifetime_projects_created INTEGER NOT NULL DEFAULT 0,
    max_guest_collaborators_per_project INTEGER,
    notification_email_batching_enabled BOOLEAN NOT NULL DEFAULT true,
    notification_batch_window_minutes INTEGER NOT NULL DEFAULT 5,
    progress_report_send_hour INTEGER NOT NULL DEFAULT 8 CHECK (progress_report_send_hour >= 0 AND progress_report_send_hour <= 23),
    progress_report_timezone TEXT NOT NULL DEFAULT 'America/New_York',
    default_send_assignment_email BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by_user_id UUID REFERENCES auth.users(id),
    setup_wizard_completed_at TIMESTAMPTZ,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

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
    project_number TEXT,
    due_date DATE,
    start_date DATE,
    next_milestone TEXT,
    milestones JSONB,
    notification_count INTEGER DEFAULT 0,
    color TEXT,
    task_notifications_use_org_defaults BOOLEAN NOT NULL DEFAULT true,
    task_start_notifications_enabled BOOLEAN,
    task_start_notification_lead_days INTEGER[],
    dependency_scheduling_mode TEXT NOT NULL DEFAULT 'auto' CHECK (dependency_scheduling_mode IN ('auto', 'manual')),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Smart Task Notification delivery log (idempotency + audit)
CREATE TABLE IF NOT EXISTS task_notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    lead_days INTEGER NOT NULL,
    notification_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'skipped', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(task_id, lead_days, notification_date)
);

-- Dependency unlock notification delivery log
CREATE TABLE IF NOT EXISTS task_dependency_notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    successor_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'skipped', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(trigger_task_id, successor_task_id, recipient_email)
);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS task_start_notifications_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS task_start_notification_lead_days INTEGER[] NOT NULL DEFAULT ARRAY[14, 7];

-- Founding-admin setup wizard completion timestamp (see organizations.setup_wizard_completed_at above)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS setup_wizard_completed_at TIMESTAMPTZ;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS workspace_type TEXT NOT NULL DEFAULT 'business';

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS max_projects INTEGER;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS lifetime_projects_created INTEGER NOT NULL DEFAULT 0;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS max_guest_collaborators_per_project INTEGER;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS notification_email_batching_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS notification_batch_window_minutes INTEGER NOT NULL DEFAULT 5;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS progress_report_send_hour INTEGER NOT NULL DEFAULT 8;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS progress_report_timezone TEXT NOT NULL DEFAULT 'America/New_York';

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS default_send_assignment_email BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_workspace_type_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_workspace_type_check
      CHECK (workspace_type IN ('personal', 'business'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_progress_report_send_hour_range') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_progress_report_send_hour_range
      CHECK (progress_report_send_hour >= 0 AND progress_report_send_hour <= 23);
  END IF;
END $$;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS account_intent TEXT NOT NULL DEFAULT 'workspace_owner';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_intent_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_intent_check
      CHECK (account_intent IN ('workspace_owner', 'guest_only'));
  END IF;
END $$;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS start_date DATE;

COMMENT ON COLUMN public.projects.start_date IS 'Planned project start (baseline); with due_date defines the schedule window for progress report day X of Y.';

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS percent_complete INTEGER;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS project_phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS notify_assignee_email BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_percent_complete_range') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_percent_complete_range
      CHECK (percent_complete IS NULL OR (percent_complete >= 0 AND percent_complete <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.tasks.percent_complete IS '0-100 schedule progress; when set, completed should reflect percent_complete >= 100';
COMMENT ON COLUMN public.tasks.project_phase_id IS 'Optional project phase; when set, phase progress is derived from completed/total tasks for that phase.';

CREATE INDEX IF NOT EXISTS idx_tasks_project_phase_id ON public.tasks(project_id, project_phase_id)
WHERE project_phase_id IS NOT NULL;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS task_notifications_use_org_defaults BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS task_start_notifications_enabled BOOLEAN;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS task_start_notification_lead_days INTEGER[];

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS dependency_scheduling_mode TEXT NOT NULL DEFAULT 'auto';

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
    account_intent TEXT NOT NULL DEFAULT 'workspace_owner' CHECK (account_intent IN ('workspace_owner', 'guest_only')),
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
    parent_message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
    thread_reply_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    inserted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
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
    start_date DATE,
    end_date DATE,
    "order" INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Weather / schedule impact log (manual reporting; optional date shift)
CREATE TABLE IF NOT EXISTS weather_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    impact_type TEXT NOT NULL DEFAULT 'weather' CHECK (impact_type IN ('weather', 'other')),
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    days_lost INTEGER NOT NULL CHECK (days_lost > 0),
    affected_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    affected_phase_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    apply_cascade BOOLEAN NOT NULL DEFAULT false,
    schedule_shift_applied BOOLEAN NOT NULL DEFAULT false,
    applied_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_impacts_project_id ON public.weather_impacts(project_id);
CREATE INDEX IF NOT EXISTS idx_weather_impacts_organization_id ON public.weather_impacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_weather_impacts_created_at ON public.weather_impacts(created_at DESC);

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
    parent_task_id UUID REFERENCES tasks(id),
    is_recurring_instance BOOLEAN DEFAULT false,
    start_date DATE,
    duration_days INTEGER,
    is_milestone BOOLEAN DEFAULT false,
    percent_complete INTEGER,
    project_phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
    notify_assignee_email BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Task Photos Table
CREATE TABLE IF NOT EXISTS task_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    storage_bucket TEXT NOT NULL DEFAULT 'task_photos',
    storage_path TEXT NOT NULL UNIQUE,
    thumbnail_path TEXT,
    caption TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_completion_photo BOOLEAN NOT NULL DEFAULT false,
    uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    mime_type TEXT,
    original_filename TEXT,
    file_size_bytes INTEGER,
    captured_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE task_photos IS 'Stores task photo metadata and private storage paths for originals and thumbnails.';
COMMENT ON COLUMN task_photos.storage_path IS 'Private path to the uploaded original image in Supabase Storage.';
COMMENT ON COLUMN task_photos.thumbnail_path IS 'Private path to the derived thumbnail image in Supabase Storage.';
COMMENT ON COLUMN task_photos.is_completion_photo IS 'Marks photos that should be emphasized as completion evidence.';
COMMENT ON COLUMN task_photos.captured_at IS 'When the photo was taken (from EXIF DateTimeOriginal/CreateDate when available), not upload time. GPS is not stored; client strips location by re-encoding.';

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
    user_id UUID NOT NULL,
    onboarding_completed BOOLEAN DEFAULT false,
    onboarding_step INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- ADDITIONAL TABLES (migrations Apr–May 2026)
-- ============================================================================

-- Project access invites (token-based guest access; supabase/migrations/20260517120000)
CREATE TABLE IF NOT EXISTS public.project_access_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    invited_email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    short_code TEXT,
    access_level TEXT NOT NULL DEFAULT 'viewer'
        CHECK (access_level IN ('viewer', 'editor', 'admin')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_access_invites_token_hash
    ON public.project_access_invites (token_hash)
    WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_access_invites_short_code_pending
    ON public.project_access_invites (short_code)
    WHERE status = 'pending' AND short_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_access_invites_invited_email_pending
    ON public.project_access_invites (lower(invited_email))
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_project_access_invites_project_id
    ON public.project_access_invites (project_id);

-- Project stream (replaces channel chat; supabase/migrations/20260520120000)
CREATE TABLE IF NOT EXISTS public.project_stream_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_type TEXT NOT NULL DEFAULT 'general'
        CHECK (post_type IN ('general', 'daily_log', 'announcement', 'milestone')),
    title TEXT,
    body TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    file_url TEXT,
    file_name TEXT,
    legacy_message_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_posts_legacy_message
    ON public.project_stream_posts(legacy_message_id)
    WHERE legacy_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stream_posts_project_created
    ON public.project_stream_posts(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_posts_org_project
    ON public.project_stream_posts(organization_id, project_id);

CREATE TABLE IF NOT EXISTS public.project_stream_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.project_stream_posts(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    legacy_message_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_replies_legacy_message
    ON public.project_stream_replies(legacy_message_id)
    WHERE legacy_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stream_replies_post_created
    ON public.project_stream_replies(post_id, created_at ASC);

-- Task comments (supabase/migrations/20260520120000)
CREATE TABLE IF NOT EXISTS public.task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'internal')),
    parent_comment_id UUID REFERENCES public.task_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_created
    ON public.task_comments(task_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_task_comments_project
    ON public.task_comments(project_id);

-- MS Project import templates (supabase/migrations/20260410120000)
CREATE TABLE IF NOT EXISTS public.schedule_import_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'ms_project_xml',
    config JSONB NOT NULL DEFAULT '{}',
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_import_templates_org
    ON public.schedule_import_templates(organization_id);

CREATE INDEX IF NOT EXISTS idx_schedule_import_templates_created_at
    ON public.schedule_import_templates(created_at DESC);

-- Task notification guest shares (supabase/migrations/20260511120000)
CREATE TABLE IF NOT EXISTS public.task_notification_guest_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    task_ids UUID[] NOT NULL,
    source TEXT NOT NULL DEFAULT 'task_start',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_notification_guest_shares IS 'Hashed tokens granting time-limited guest access to specific tasks for notification links.';

CREATE INDEX IF NOT EXISTS idx_task_notification_guest_shares_project
    ON public.task_notification_guest_shares(project_id);

CREATE INDEX IF NOT EXISTS idx_task_notification_guest_shares_expires
    ON public.task_notification_guest_shares(expires_at);

-- SMS phone consent (supabase/migrations/20260512120000)
CREATE TABLE IF NOT EXISTS public.sms_phone_consent (
    phone_e164 TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'none'
        CHECK (status IN ('none', 'pending', 'confirmed', 'opted_out')),
    pending_token TEXT,
    pending_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    pending_sent_at TIMESTAMPTZ,
    last_opt_in_sent_at TIMESTAMPTZ,
    last_opt_in_resend_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    opted_out_at TIMESTAMPTZ,
    last_opt_in_message_sid TEXT,
    last_confirm_inbound_sid TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sms_phone_consent_pending_token_uidx
    ON public.sms_phone_consent (pending_token)
    WHERE pending_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_phone_consent_status_idx
    ON public.sms_phone_consent (status);

COMMENT ON TABLE public.sms_phone_consent IS 'Twilio SMS double opt-in: one row per E.164; status drives substantive SMS sends.';

-- Progress reports (scripts/migrations/add-progress-reports.sql + migrations)
CREATE TABLE IF NOT EXISTS public.progress_report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    included_project_ids UUID[] DEFAULT NULL,
    name TEXT NOT NULL,
    report_audience_type TEXT NOT NULL CHECK (report_audience_type IN ('client', 'internal', 'executive')),
    template_type TEXT NOT NULL CHECK (template_type IN ('client_standard', 'internal_detailed', 'executive_summary', 'custom')),
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'bi-weekly', 'monthly', 'custom', 'manual')),
    frequency_value INTEGER,
    custom_subject TEXT,
    custom_message TEXT,
    report_sections JSONB DEFAULT '{"status_changes": true, "task_completion": true, "phase_changes": true, "executive_summary": false}',
    requires_approval BOOLEAN DEFAULT false,
    approval_status TEXT DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_review', 'approved', 'rejected')),
    approved_by_user_id UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    include_branding BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_sent_at TIMESTAMP WITH TIME ZONE,
    next_send_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.progress_report_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES public.progress_report_schedules(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    recipient_type TEXT NOT NULL DEFAULT 'to' CHECK (recipient_type IN ('to', 'cc', 'bcc')),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.progress_report_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES public.progress_report_schedules(id) ON DELETE CASCADE,
    report_audience_type TEXT NOT NULL CHECK (report_audience_type IN ('client', 'internal', 'executive')),
    report_type TEXT NOT NULL CHECK (report_type IN ('project', 'organization')),
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    recipient_emails TEXT[] NOT NULL,
    report_data JSONB NOT NULL,
    filtered_data JSONB NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    sent_by_user_id UUID REFERENCES auth.users(id),
    email_id TEXT,
    was_manual_send BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.organization_branding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#3B82F6',
    secondary_color TEXT DEFAULT '#10B981',
    company_footer TEXT,
    email_signature TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_progress_report_schedules_organization_id ON public.progress_report_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_progress_report_schedules_project_id ON public.progress_report_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_report_schedules_next_send ON public.progress_report_schedules(next_send_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_progress_report_schedules_approval_status ON public.progress_report_schedules(approval_status) WHERE requires_approval = true;
CREATE INDEX IF NOT EXISTS idx_progress_report_recipients_schedule_id ON public.progress_report_recipients(schedule_id);
CREATE INDEX IF NOT EXISTS idx_progress_report_recipients_contact_id ON public.progress_report_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_progress_report_history_schedule_id ON public.progress_report_history(schedule_id);
CREATE INDEX IF NOT EXISTS idx_progress_report_history_organization_id ON public.progress_report_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_progress_report_history_sent_at ON public.progress_report_history(sent_at DESC);

COMMENT ON TABLE public.progress_report_schedules IS 'Stores scheduled progress report configurations';
COMMENT ON TABLE public.progress_report_recipients IS 'Stores recipient email addresses for each report schedule';
COMMENT ON TABLE public.progress_report_history IS 'Stores history of sent progress reports';
COMMENT ON TABLE public.organization_branding IS 'Stores branding configuration for organization email reports';

-- Moderation (schema-moderation-features.sql)
CREATE TABLE IF NOT EXISTS public.content_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN ('message', 'profile', 'project', 'task', 'comment', 'file', 'stream_post', 'task_comment')),
    content_id UUID NOT NULL,
    reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'violence', 'hate_speech', 'other')),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id != blocked_user_id)
);

CREATE TABLE IF NOT EXISTS public.terms_of_service_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    ip_address TEXT,
    user_agent TEXT,
    UNIQUE(user_id, version)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_reported_by ON public.content_reports(reported_by_user_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_reported_user ON public.content_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON public.content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_content_type ON public.content_reports(content_type);
CREATE INDEX IF NOT EXISTS idx_content_reports_created_at ON public.content_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON public.blocked_users(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_tos_acceptances_user ON public.terms_of_service_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_tos_acceptances_version ON public.terms_of_service_acceptances(version);

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
        ALTER TABLE messages ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
    END IF;
    
    -- Add inserted_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public'
                     AND table_name = 'messages' 
                     AND column_name = 'inserted_at') THEN
        ALTER TABLE messages ADD COLUMN inserted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
    END IF;
END $$;

-- Migrate messages.updated_at and inserted_at to TIMESTAMP WITH TIME ZONE (if currently WITHOUT)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'updated_at')
       AND (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'updated_at') = 'timestamp without time zone' THEN
        ALTER TABLE messages ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE USING updated_at AT TIME ZONE 'UTC';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'inserted_at')
       AND (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'inserted_at') = 'timestamp without time zone' THEN
        ALTER TABLE messages ALTER COLUMN inserted_at TYPE TIMESTAMP WITH TIME ZONE USING inserted_at AT TIME ZONE 'UTC';
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
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring_instance BOOLEAN DEFAULT false;

-- Add schedule/Gantt fields to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_days INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT false;

-- Add workflow steps to tasks table (stored as JSONB)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_steps JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_workflow_step INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_steps_legacy JSONB;
COMMENT ON COLUMN tasks.workflow_steps IS 'Deprecated: legacy workflow JSON migrated to task_dependencies.';
COMMENT ON COLUMN tasks.current_workflow_step IS 'Deprecated: legacy workflow pointer no longer used.';
COMMENT ON COLUMN tasks.workflow_steps_legacy IS 'Read-only archive of deprecated workflow steps captured during migration.';

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
ALTER TABLE issue_comments ADD CONSTRAINT fk_issue_comments_issue_id FOREIGN KEY (issue_id) REFERENCES project_issues(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_comments_step_id') THEN
ALTER TABLE issue_comments ADD CONSTRAINT fk_issue_comments_step_id FOREIGN KEY (step_id) REFERENCES issue_steps(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_comments_user_id') THEN
ALTER TABLE issue_comments ADD CONSTRAINT fk_issue_comments_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Issue files constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_files_issue_id') THEN
ALTER TABLE issue_files ADD CONSTRAINT fk_issue_files_issue_id FOREIGN KEY (issue_id) REFERENCES project_issues(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_files_step_id') THEN
ALTER TABLE issue_files ADD CONSTRAINT fk_issue_files_step_id FOREIGN KEY (step_id) REFERENCES issue_steps(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_files_uploaded_by') THEN
ALTER TABLE issue_files ADD CONSTRAINT fk_issue_files_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Issue steps constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_issue_steps_issue_id') THEN
ALTER TABLE issue_steps ADD CONSTRAINT fk_issue_steps_issue_id FOREIGN KEY (issue_id) REFERENCES project_issues(id);
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
ALTER TABLE project_contacts ADD CONSTRAINT fk_project_contacts_contact_id FOREIGN KEY (contact_id) REFERENCES contacts(id);
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
        ALTER TABLE project_collaborators ADD CONSTRAINT fk_project_collaborators_invited_by FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id);
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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_project_phases_date_order') THEN
        ALTER TABLE project_phases ADD CONSTRAINT ck_project_phases_date_order CHECK (
            start_date IS NULL
            OR end_date IS NULL
            OR end_date >= start_date
        );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.calculate_project_phase_schedule_progress(
    phase_start_date DATE,
    phase_end_date DATE,
    as_of DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    total_days INTEGER;
    elapsed_days INTEGER;
BEGIN
    IF phase_start_date IS NULL OR phase_end_date IS NULL THEN
        RETURN 0;
    END IF;

    IF as_of < phase_start_date THEN
        RETURN 0;
    END IF;

    IF as_of >= phase_end_date THEN
        RETURN 100;
    END IF;

    total_days := phase_end_date - phase_start_date;
    IF total_days <= 0 THEN
        RETURN 100;
    END IF;

    elapsed_days := as_of - phase_start_date;
    RETURN GREATEST(0, LEAST(100, ROUND((elapsed_days::NUMERIC * 100) / total_days)::INTEGER));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_project_phase_schedule_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  task_count int;
  v_progress int;
BEGIN
  SELECT count(*)::int INTO task_count
  FROM public.tasks
  WHERE project_phase_id = NEW.id;

  IF task_count > 0 THEN
    SELECT ROUND((100.0 * count(*) FILTER (WHERE completed)) / NULLIF(count(*), 0))::int
    INTO v_progress
    FROM public.tasks
    WHERE project_phase_id = NEW.id;
    NEW.progress := GREATEST(0, LEAST(100, COALESCE(v_progress, 0)));
    RETURN NEW;
  END IF;

  IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.progress := public.calculate_project_phase_schedule_progress(
    NEW.start_date,
    NEW.end_date,
    CURRENT_DATE
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_project_phase_schedule_progress ON public.project_phases;
CREATE TRIGGER trg_set_project_phase_schedule_progress
BEFORE INSERT OR UPDATE OF start_date, end_date ON public.project_phases
FOR EACH ROW
EXECUTE FUNCTION public.set_project_phase_schedule_progress();

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
    ALTER TABLE tasks ADD CONSTRAINT fk_tasks_assignee_id FOREIGN KEY (assignee_id) REFERENCES contacts(id);
END $$;

-- User preferences constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_preferences_user_id') THEN
        ALTER TABLE user_preferences ADD CONSTRAINT fk_user_preferences_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- Enforce user_preferences.user_id NOT NULL (remove orphaned rows then set constraint)
DO $$
BEGIN
    DELETE FROM user_preferences WHERE user_id IS NULL;
    IF (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'user_id') = 'YES' THEN
        ALTER TABLE user_preferences ALTER COLUMN user_id SET NOT NULL;
    END IF;
END $$;

-- Activity log constraints
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_activity_log_user_id') THEN
        ALTER TABLE activity_log ADD CONSTRAINT fk_activity_log_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id);
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
        ALTER TABLE invitations ADD CONSTRAINT fk_invitations_invited_by FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id);
    END IF;
END $$;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get the organization_id of the currently logged-in user
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

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
     WHERE id = (select auth.uid()))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Gets the contact_id of the currently logged-in user
CREATE OR REPLACE FUNCTION get_user_contact_id()
RETURNS UUID AS $$
  SELECT contact_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Gets the email of the currently logged-in user
CREATE OR REPLACE FUNCTION get_user_email()
RETURNS TEXT AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Helper function to check if current user is admin
-- Super admin, legacy "Admin" role name, or canonical "Org Admin" role name (required for org UPDATE RLS, e.g. setup_wizard_completed_at)
CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    false
  ) OR COALESCE((SELECT get_user_role()) IN ('Admin', 'Org Admin'), false);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Helper function to check if current user is admin (bypasses RLS via SECURITY DEFINER)
-- This is safe because it doesn't call get_user_role(), avoiding recursion
-- Kept for backward compatibility, but is_user_admin() is preferred
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = (select auth.uid()) AND (role = 'Admin' OR is_super_admin = true)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

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
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
-- WORKSPACE TIER ENFORCEMENT (supabase/migrations/20260518120000)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_personal_workspace_project_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_row public.organizations%ROWTYPE;
  cap INTEGER;
BEGIN
  SELECT * INTO org_row FROM public.organizations WHERE id = NEW.organization_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF org_row.workspace_type IS DISTINCT FROM 'personal' THEN
    RETURN NEW;
  END IF;

  cap := COALESCE(org_row.max_projects, 2);

  IF COALESCE(org_row.lifetime_projects_created, 0) >= cap THEN
    RAISE EXCEPTION 'PROJECT_LIMIT_REACHED'
      USING ERRCODE = 'P0001',
        MESSAGE = 'Personal workspace project limit reached';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_org_lifetime_projects_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.organizations
  SET lifetime_projects_created = COALESCE(lifetime_projects_created, 0) + 1
  WHERE id = NEW.organization_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_personal_workspace_project_limit ON public.projects;
CREATE TRIGGER trg_enforce_personal_workspace_project_limit
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_personal_workspace_project_limit();

DROP TRIGGER IF EXISTS trg_increment_lifetime_projects ON public.projects;
CREATE TRIGGER trg_increment_lifetime_projects
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_org_lifetime_projects_created();

CREATE OR REPLACE FUNCTION public.count_project_guest_seats(p_project_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (SELECT COUNT(*)::INTEGER FROM public.project_collaborators WHERE project_id = p_project_id)
    + (SELECT COUNT(*)::INTEGER FROM public.project_access_invites
       WHERE project_id = p_project_id AND status = 'pending')
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_personal_workspace_guest_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_row public.organizations%ROWTYPE;
  cap INTEGER;
  seats INTEGER;
  pid UUID;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT o.* INTO org_row
  FROM public.organizations o
  JOIN public.projects p ON p.organization_id = o.id
  WHERE p.id = pid;

  IF NOT FOUND OR org_row.workspace_type IS DISTINCT FROM 'personal' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  cap := COALESCE(org_row.max_guest_collaborators_per_project, 5);
  seats := public.count_project_guest_seats(pid);

  IF seats >= cap THEN
    RAISE EXCEPTION 'GUEST_COLLABORATOR_LIMIT_REACHED'
      USING ERRCODE = 'P0001',
        MESSAGE = 'Personal workspace guest collaborator limit reached for this project';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_personal_guest_cap_collaborators ON public.project_collaborators;
CREATE TRIGGER trg_enforce_personal_guest_cap_collaborators
  BEFORE INSERT ON public.project_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_personal_workspace_guest_cap();

DROP TRIGGER IF EXISTS trg_enforce_personal_guest_cap_invites ON public.project_access_invites;
CREATE TRIGGER trg_enforce_personal_guest_cap_invites
  BEFORE INSERT ON public.project_access_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_personal_workspace_guest_cap();

-- ============================================================================
-- TASK / PHASE ROLLUP (supabase/migrations/20260412140000)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tasks_validate_project_phase_same_project()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_phase_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_phases pp
    WHERE pp.id = NEW.project_phase_id
      AND pp.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'tasks.project_phase_id must reference a phase on the same project';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_validate_project_phase ON public.tasks;
CREATE TRIGGER trg_tasks_validate_project_phase
BEFORE INSERT OR UPDATE OF project_id, project_phase_id ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.tasks_validate_project_phase_same_project();

CREATE OR REPLACE FUNCTION public.recompute_project_phase_progress(p_phase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_done int;
  v_start date;
  v_end date;
  v_progress int;
BEGIN
  IF p_phase_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::int, count(*) FILTER (WHERE t.completed = true)::int
  INTO v_total, v_done
  FROM public.tasks t
  WHERE t.project_phase_id = p_phase_id;

  IF v_total > 0 THEN
    v_progress := ROUND((100.0 * v_done) / v_total)::int;
    v_progress := GREATEST(0, LEAST(100, v_progress));
  ELSE
    SELECT pp.start_date, pp.end_date
    INTO v_start, v_end
    FROM public.project_phases pp
    WHERE pp.id = p_phase_id;

    IF v_start IS NULL OR v_end IS NULL THEN
      v_progress := 0;
    ELSE
      v_progress := public.calculate_project_phase_schedule_progress(v_start, v_end, CURRENT_DATE);
    END IF;
  END IF;

  UPDATE public.project_phases
  SET progress = v_progress,
      updated_at = now()
  WHERE id = p_phase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tasks_after_change_refresh_phase_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  op text := TG_OP;
BEGIN
  IF op = 'DELETE' THEN
    IF OLD.project_phase_id IS NOT NULL THEN
      PERFORM public.recompute_project_phase_progress(OLD.project_phase_id);
    END IF;
    RETURN OLD;
  END IF;

  IF op = 'UPDATE' AND OLD.project_phase_id IS DISTINCT FROM NEW.project_phase_id THEN
    IF OLD.project_phase_id IS NOT NULL THEN
      PERFORM public.recompute_project_phase_progress(OLD.project_phase_id);
    END IF;
  END IF;

  IF op IN ('INSERT', 'UPDATE') AND NEW.project_phase_id IS NOT NULL THEN
    PERFORM public.recompute_project_phase_progress(NEW.project_phase_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_refresh_phase_progress ON public.tasks;
CREATE TRIGGER trg_tasks_refresh_phase_progress
AFTER INSERT OR DELETE OR UPDATE OF completed, project_phase_id, project_id ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.tasks_after_change_refresh_phase_progress();

-- ============================================================================
-- ACTIVITY HISTORY PERMISSION (supabase/migrations/20260502140000)
-- ============================================================================

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

-- ============================================================================
-- PROJECT CONTACTS RLS HELPERS (supabase/migrations/20260503120000)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.project_contact_insert_allowed(
  p_project_id uuid,
  p_contact_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_org uuid;
BEGIN
  v_user_org := public.get_user_organization_id();
  IF v_user_org IS NULL OR p_org_id IS DISTINCT FROM v_user_org THEN
    RETURN false;
  END IF;

  IF public.is_user_admin() AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = p_contact_id AND c.organization_id = v_user_org
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND p.organization_id = v_user_org
      AND p.project_manager_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND p.organization_id = v_user_org
      AND p.created_by_user_id = auth.uid()
  ) AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = p_contact_id AND c.organization_id = v_user_org
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_contact_user_can_manage_project(
  p_project_id uuid,
  p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.get_user_organization_id() IS NOT NULL
    AND p_org_id = public.get_user_organization_id()
    AND (
      public.is_user_admin()
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = p_project_id
          AND p.organization_id = p_org_id
          AND p.project_manager_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.project_contact_insert_allowed(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_contact_user_can_manage_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_contact_insert_allowed(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_contact_user_can_manage_project(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- STREAM / TASK COMMENTS (supabase/migrations/20260520120000)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_is_org_member_for_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects pr
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE pr.id = p_project_id
      AND p.organization_id IS NOT NULL
      AND p.organization_id = pr.organization_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_org_member_for_project(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stream_posts_updated_at ON public.project_stream_posts;
CREATE TRIGGER trg_stream_posts_updated_at
BEFORE UPDATE ON public.project_stream_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_stream_replies_updated_at ON public.project_stream_replies;
CREATE TRIGGER trg_stream_replies_updated_at
BEFORE UPDATE ON public.project_stream_replies
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_task_comments_updated_at ON public.task_comments;
CREATE TRIGGER trg_task_comments_updated_at
BEFORE UPDATE ON public.task_comments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Moderation helpers (schema-moderation-features.sql)
CREATE OR REPLACE FUNCTION public.is_user_blocked(blocker_id UUID, blocked_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blocked_users
    WHERE blocker_user_id = blocker_id
      AND blocked_user_id = blocked_id
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_accepted_latest_tos(user_id UUID, tos_version TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.terms_of_service_acceptances
    WHERE user_id = has_accepted_latest_tos.user_id
      AND version = tos_version
  );
$$ LANGUAGE sql SECURITY DEFINER;


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
DROP POLICY IF EXISTS "Users can view contacts in their organization" ON public.contacts;
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

DROP POLICY IF EXISTS "Users can see weather impacts for accessible projects" ON public.weather_impacts;
DROP POLICY IF EXISTS "Users can create weather impacts for accessible projects" ON public.weather_impacts;
DROP POLICY IF EXISTS "Users can update weather impacts for accessible projects" ON public.weather_impacts;
DROP POLICY IF EXISTS "Admins PMs creators can delete weather impacts" ON public.weather_impacts;

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
DROP POLICY IF EXISTS "Users can create activity logs for accessible projects" ON public.activity_log;
DROP POLICY IF EXISTS "Users can update their own activity logs" ON public.activity_log;
DROP POLICY IF EXISTS "Users can delete their own activity logs" ON public.activity_log;

DROP POLICY IF EXISTS "Users can see invitations they sent or received" ON public.invitations;
DROP POLICY IF EXISTS "Public can view invitations by token" ON public.invitations;
DROP POLICY IF EXISTS "Public can read pending invitations by token, users can see their invitations" ON public.invitations;
DROP POLICY IF EXISTS "Authenticated users can see their invitations" ON public.invitations;
DROP POLICY IF EXISTS "Authenticated users can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can update their sent invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can accept their own invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can delete their sent invitations" ON public.invitations;

DROP POLICY IF EXISTS "Users can see task dependencies for tasks they can see" ON public.task_dependencies;
DROP POLICY IF EXISTS "Users can create task dependencies for tasks they can update" ON public.task_dependencies;
DROP POLICY IF EXISTS "Users can update task dependencies for tasks they can update" ON public.task_dependencies;
DROP POLICY IF EXISTS "Users can delete task dependencies for tasks they can update" ON public.task_dependencies;

DROP POLICY IF EXISTS "Users can view templates in their organization" ON public.project_templates;
DROP POLICY IF EXISTS "Users can create templates in their organization" ON public.project_templates;
DROP POLICY IF EXISTS "Users can update templates in their organization" ON public.project_templates;
DROP POLICY IF EXISTS "Users can delete templates in their organization" ON public.project_templates;

DROP POLICY IF EXISTS "Users can view task notification history for their organization" ON public.task_notification_history;
DROP POLICY IF EXISTS "Org members can view project access invites" ON public.project_access_invites;
DROP POLICY IF EXISTS "Org members can manage project access invites" ON public.project_access_invites;
DROP POLICY IF EXISTS "stream_posts_select" ON public.project_stream_posts;
DROP POLICY IF EXISTS "stream_posts_insert" ON public.project_stream_posts;
DROP POLICY IF EXISTS "stream_posts_update" ON public.project_stream_posts;
DROP POLICY IF EXISTS "stream_posts_delete" ON public.project_stream_posts;
DROP POLICY IF EXISTS "stream_replies_select" ON public.project_stream_replies;
DROP POLICY IF EXISTS "stream_replies_insert" ON public.project_stream_replies;
DROP POLICY IF EXISTS "stream_replies_update" ON public.project_stream_replies;
DROP POLICY IF EXISTS "stream_replies_delete" ON public.project_stream_replies;
DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_insert" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_update" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_delete" ON public.task_comments;
DROP POLICY IF EXISTS "messages_read_only_deprecated" ON public.messages;
DROP POLICY IF EXISTS "message_channels_read_only_deprecated" ON public.message_channels;
DROP POLICY IF EXISTS "Users can see their own reports" ON public.content_reports;
DROP POLICY IF EXISTS "Admins can see all reports" ON public.content_reports;
DROP POLICY IF EXISTS "Users can create reports" ON public.content_reports;
DROP POLICY IF EXISTS "Admins can update reports" ON public.content_reports;
DROP POLICY IF EXISTS "Users can see their own blocks" ON public.blocked_users;
DROP POLICY IF EXISTS "Users can create blocks" ON public.blocked_users;
DROP POLICY IF EXISTS "Users can delete their own blocks" ON public.blocked_users;
DROP POLICY IF EXISTS "Users can see their own ToS acceptances" ON public.terms_of_service_acceptances;
DROP POLICY IF EXISTS "Users can create their own ToS acceptances" ON public.terms_of_service_acceptances;
DROP POLICY IF EXISTS "Admins can see all ToS acceptances" ON public.terms_of_service_acceptances;
DROP POLICY IF EXISTS "Users with permission can view schedules" ON public.progress_report_schedules;
DROP POLICY IF EXISTS "Users with permission can create schedules" ON public.progress_report_schedules;
DROP POLICY IF EXISTS "Users with permission can update schedules" ON public.progress_report_schedules;
DROP POLICY IF EXISTS "Users with permission can delete schedules" ON public.progress_report_schedules;
DROP POLICY IF EXISTS "Users with permission can view recipients" ON public.progress_report_recipients;
DROP POLICY IF EXISTS "Users with permission can insert recipients" ON public.progress_report_recipients;
DROP POLICY IF EXISTS "Users with permission can update recipients" ON public.progress_report_recipients;
DROP POLICY IF EXISTS "Users with permission can delete recipients" ON public.progress_report_recipients;
DROP POLICY IF EXISTS "Users with permission can view history" ON public.progress_report_history;
DROP POLICY IF EXISTS "Users can view branding in their organization" ON public.organization_branding;
DROP POLICY IF EXISTS "Users with permission can manage branding" ON public.organization_branding;
DROP POLICY IF EXISTS "Users can view their organization schedule import templates" ON public.schedule_import_templates;
DROP POLICY IF EXISTS "Users can create schedule import templates for their organization" ON public.schedule_import_templates;
DROP POLICY IF EXISTS "Users can update their organization schedule import templates" ON public.schedule_import_templates;
DROP POLICY IF EXISTS "Users can delete their organization schedule import templates" ON public.schedule_import_templates;
DROP POLICY IF EXISTS "sms_phone_consent_select_authenticated" ON public.sms_phone_consent;
DROP POLICY IF EXISTS "Users can see activity with permission and scope" ON public.activity_log;
DROP POLICY IF EXISTS "Users can create activity logs for accessible scope" ON public.activity_log;


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
ALTER TABLE weather_impacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependency_notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_access_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_stream_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_stream_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_import_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notification_guest_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_phone_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_report_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms_of_service_acceptances ENABLE ROW LEVEL SECURITY;


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
  id = (select get_user_organization_id())
  AND (select is_user_admin())
);

-- Only super admins can create organizations
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

-- Only super admins can delete organizations
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

-- Projects SELECT policy - WITH ORGANIZATION ISOLATION (OPTIMIZED)
-- All auth function calls wrapped in (select ...) for RLS performance
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
    -- Check both by contact_id (if profile has contact_id) and by email (fallback)
    (id IN (
      SELECT project_id
      FROM public.project_contacts
      WHERE (
        -- Match by contact_id if user's profile has one
        (contact_id = (select get_user_contact_id()) AND (select get_user_contact_id()) IS NOT NULL)
        OR
        -- Match by email if contact_id is not set (handles cases where user was added but profile contact_id not set)
        (contact_id IN (
          SELECT id 
          FROM public.contacts 
          WHERE LOWER(email) = LOWER((select get_user_email()))
            AND organization_id = (select get_user_organization_id())
        ))
      )
      AND organization_id = (select get_user_organization_id())
    ))
    OR
    -- Guest collaborators see projects they're invited to
    (id IN (
      SELECT project_id
      FROM public.project_collaborators
      WHERE user_id = (select auth.uid())
        AND organization_id = (select get_user_organization_id())
    ))
  )
);

-- Guest collaborators (no org) access their invited projects
DROP POLICY IF EXISTS "Guest collaborators can see their projects" ON public.projects;
CREATE POLICY "Guest collaborators can see their projects"
ON public.projects
FOR SELECT
USING (
  id IN (
    SELECT project_id
    FROM public.project_collaborators
    WHERE user_id = (SELECT auth.uid())
  )
);

-- Projects INSERT policy - must set organization_id to user's org (OPTIMIZED)
CREATE POLICY "Users can create projects in their organization"
ON public.projects
FOR INSERT
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND organization_id = (select get_user_organization_id())
);

-- Projects UPDATE policy - can only update projects in their org (OPTIMIZED)
CREATE POLICY "Admins and PMs can update projects in their organization"
ON public.projects
FOR UPDATE
USING (
  organization_id = (select get_user_organization_id())
  AND (
    (select is_user_admin())
    OR
    (project_manager_id = (select auth.uid()))
  )
);

-- Projects DELETE policy - can only delete projects in their org (OPTIMIZED)
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

-- Profiles SELECT policy: Users can see their own profile and profiles in their organization (OPTIMIZED)
CREATE POLICY "Users can see profiles in their organization"
ON public.profiles FOR SELECT
USING (
  (id = (select auth.uid()))  -- Own profile
  OR
  (organization_id IS NOT NULL 
   AND organization_id = (select get_user_organization_id()))  -- Same org members
);

-- Profiles INSERT policy: Only allow trigger function or users creating their own profile (OPTIMIZED)
-- The trigger function uses SECURITY DEFINER so it bypasses RLS
CREATE POLICY "Users can create their own profile"
ON public.profiles FOR INSERT
WITH CHECK (id = (select auth.uid()));

-- Profiles UPDATE policy: Users can update their own profile, admins can update any (OPTIMIZED)
-- Note: Admin check uses is_user_admin() so role_id (new role system) is respected
CREATE POLICY "Users can update their own profile, admins can update any"
ON public.profiles FOR UPDATE
USING (
  (id = (select auth.uid())) 
  OR 
  (select is_user_admin())
);

-- Profiles DELETE policy: Only admins can delete profiles
CREATE POLICY "Only admins can delete profiles"
ON public.profiles FOR DELETE
USING ((select is_user_admin()));

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
  organization_id = (select get_user_organization_id())
  OR
  (LOWER(email) = LOWER((select get_user_email())))
  OR
  (created_by_user_id = (select auth.uid()))
);

-- Contacts INSERT policy (OPTIMIZED)
CREATE POLICY "Authenticated users can create contacts"
ON public.contacts
FOR INSERT
WITH CHECK ((select auth.uid()) IS NOT NULL);

-- Contacts UPDATE policy (FIXED: admins and PMs can update any contact in their org)
CREATE POLICY "Users can update their own contacts"
ON public.contacts
FOR UPDATE
USING (
  -- Creator can always update their own contacts
  (created_by_user_id = (select auth.uid()))
  OR
  -- Admins and PMs can update any contact in their organization
  (
    organization_id = (select get_user_organization_id())
    AND (
      (select is_user_admin())
      OR (select get_user_role()) = 'PM'
    )
  )
);

-- Contacts DELETE policy (FIXED: admins can delete any contact in their org)
CREATE POLICY "Users can delete their own contacts"
ON public.contacts
FOR DELETE
USING (
  -- Creator can delete their own contacts
  (created_by_user_id = (select auth.uid()))
  OR
  -- Admins can delete any contact in their organization
  (
    organization_id = (select get_user_organization_id())
    AND (select is_user_admin())
  )
);

-- ============================================================================
-- CALENDAR EVENTS TABLE POLICIES
-- ============================================================================

-- Calendar events SELECT policy
CREATE POLICY "Users can see events for projects they have access to"
ON public.calendar_events
FOR SELECT
USING (
  (project_id IS NULL AND (user_id = (select auth.uid())))
  OR
  (project_id IN (SELECT id FROM public.projects))
);

-- Calendar events INSERT policy
CREATE POLICY "Users can create events for accessible projects"
ON public.calendar_events
FOR INSERT
WITH CHECK (
  (project_id IS NULL AND (user_id = (select auth.uid())))
  OR
  (project_id IN (SELECT id FROM public.projects))
);

-- Calendar events UPDATE policy
CREATE POLICY "Users can update events for accessible projects"
ON public.calendar_events
FOR UPDATE
USING (
  (project_id IS NULL AND (user_id = (select auth.uid())))
  OR
  (project_id IN (SELECT id FROM public.projects))
);

-- Calendar events DELETE policy
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

-- Event categories SELECT policy
CREATE POLICY "All authenticated users can view event categories"
ON public.event_categories
FOR SELECT
USING ((select auth.uid()) IS NOT NULL);

-- Event categories INSERT policy
CREATE POLICY "Only admins can create event categories"
ON public.event_categories
FOR INSERT
WITH CHECK ((select get_user_role()) = 'Admin');

-- Event categories UPDATE policy
CREATE POLICY "Only admins can update event categories"
ON public.event_categories
FOR UPDATE
USING ((select get_user_role()) = 'Admin');

-- Event categories DELETE policy
CREATE POLICY "Only admins can delete event categories"
ON public.event_categories
FOR DELETE
USING ((select get_user_role()) = 'Admin');

-- ============================================================================
-- FILES TABLE POLICIES
-- ============================================================================

-- Files SELECT policy
CREATE POLICY "Users can see files for projects they have access to"
ON public.files
FOR SELECT
USING (
  project_id IN (SELECT id FROM public.projects)
);

-- Files INSERT policy
CREATE POLICY "Users can upload files to accessible projects"
ON public.files
FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM public.projects)
);

-- Files UPDATE policy
CREATE POLICY "Users can update files for accessible projects"
ON public.files
FOR UPDATE
USING (
  project_id IN (SELECT id FROM public.projects)
);

-- Files DELETE policy
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

-- Issue comments SELECT policy
CREATE POLICY "Users can see comments for accessible projects"
ON public.issue_comments
FOR SELECT
USING (
  issue_id IN (
    SELECT pi.id 
    FROM public.project_issues pi 
    WHERE pi.project_id IN (SELECT id FROM public.projects)
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
    WHERE pi.project_id IN (SELECT id FROM public.projects)
  )
);

-- Issue comments UPDATE policy
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

-- Issue comments DELETE policy
CREATE POLICY "Users can delete their own comments within 15 minutes or admins/PMs can delete any"
ON public.issue_comments
FOR DELETE
USING (
  (user_id = (select auth.uid()) AND created_at > NOW() - INTERVAL '15 minutes')
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
    WHERE pi.project_id IN (SELECT id FROM public.projects)
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
    WHERE pi.project_id IN (SELECT id FROM public.projects)
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
    WHERE pi.project_id IN (SELECT id FROM public.projects)
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
    WHERE pi.project_id IN (SELECT id FROM public.projects)
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
    WHERE pi.project_id IN (SELECT id FROM public.projects)
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
    WHERE pi.project_id IN (SELECT id FROM public.projects)
  )
);

-- Issue steps UPDATE policy
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
      WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin'
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
  project_id IN (SELECT id FROM public.projects)
);

-- Message channels INSERT policy
-- Legacy channel chat archived: read-only (writes go to project_stream_*)
CREATE POLICY "message_channels_read_only_deprecated"
ON public.message_channels
FOR INSERT
TO authenticated
WITH CHECK (false);

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
    WHERE mc.project_id IN (SELECT id FROM public.projects)
  )
);

-- Legacy messages archived: read-only (writes go to project_stream_*)
CREATE POLICY "messages_read_only_deprecated"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (false);

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
    WHERE mc.project_id IN (SELECT id FROM public.projects)
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
    WHERE mc.project_id IN (SELECT id FROM public.projects)
  )
);

-- Message reactions DELETE policy
CREATE POLICY "Users can delete their own reactions"
ON public.message_reactions
FOR DELETE
USING (user_id = (select auth.uid()));

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
    WHERE mc.project_id IN (SELECT id FROM public.projects)
  )
);

-- Typing indicators INSERT policy
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

-- Typing indicators UPDATE policy
CREATE POLICY "Users can update their own typing indicators"
ON public.typing_indicators
FOR UPDATE
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- Typing indicators DELETE policy
CREATE POLICY "Users can delete their own typing indicators"
ON public.typing_indicators
FOR DELETE
USING (user_id = (select auth.uid()));

-- ============================================================================
-- MESSAGE READS TABLE POLICIES
-- ============================================================================

-- Message reads SELECT policy
CREATE POLICY "Users can see their own message reads"
ON public.message_reads
FOR SELECT
USING (user_id = (select auth.uid()));

-- Message reads INSERT policy
CREATE POLICY "Users can create their own message reads"
ON public.message_reads
FOR INSERT
WITH CHECK (user_id = (select auth.uid()));

-- Message reads UPDATE policy
CREATE POLICY "Users can update their own message reads"
ON public.message_reads
FOR UPDATE
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- Message reads DELETE policy
CREATE POLICY "Users can delete their own message reads"
ON public.message_reads
FOR DELETE
USING (user_id = (select auth.uid()));

-- ============================================================================
-- CHANNEL READS TABLE POLICIES
-- ============================================================================

-- Channel reads SELECT policy
CREATE POLICY "Users can see their own channel reads"
ON public.channel_reads
FOR SELECT
USING (user_id = (select auth.uid()));

-- Channel reads INSERT policy
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

-- Channel reads UPDATE policy
CREATE POLICY "Users can update their own channel reads"
ON public.channel_reads
FOR UPDATE
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- Channel reads DELETE policy
CREATE POLICY "Users can delete their own channel reads"
ON public.channel_reads
FOR DELETE
USING (user_id = (select auth.uid()));

-- ============================================================================
-- PROJECT COLLABORATORS TABLE POLICIES
-- ============================================================================

-- Drop ALL existing project_collaborators policies to avoid conflicts
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'project_collaborators' AND schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.project_collaborators', r.policyname);
  END LOOP;
END $$;

-- Project collaborators SELECT - users can see their own collaborator records and admins see all in their org
CREATE POLICY "Users can see project collaborators in their organization"
ON public.project_collaborators
FOR SELECT
USING (
  -- Users can always see their own collaborator records (critical for project access subqueries)
  user_id = (select auth.uid())
  OR
  -- Org members can see all collaborators in their org
  organization_id = (select get_user_organization_id())
);

-- Project collaborators INSERT - admins and PMs can invite collaborators
CREATE POLICY "Admins and PMs can add project collaborators"
ON public.project_collaborators
FOR INSERT
WITH CHECK (
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

-- Project collaborators UPDATE - admins and PMs can update collaborator access levels
CREATE POLICY "Admins and PMs can update project collaborators"
ON public.project_collaborators
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

-- Project collaborators DELETE - admins, PMs, and the collaborator themselves can remove
CREATE POLICY "Admins, PMs, and self can remove project collaborators"
ON public.project_collaborators
FOR DELETE
USING (
  user_id = (select auth.uid())  -- Users can remove themselves
  OR
  (
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
  )
);

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
  organization_id = (select get_user_organization_id())
);

-- Project contacts INSERT - must be in same org
-- Admins can add any contact in their organization
CREATE POLICY "Admins and PMs can assign contacts in their organization"
ON public.project_contacts
FOR INSERT
WITH CHECK (
  organization_id = (select public.get_user_organization_id())
  AND public.project_contact_insert_allowed(project_id, contact_id, organization_id)
);

-- Project contacts UPDATE
CREATE POLICY "Admins and PMs can update project contacts in their organization"
ON public.project_contacts
FOR UPDATE
USING (
  public.project_contact_user_can_manage_project(project_id, organization_id)
);

-- Project contacts DELETE
CREATE POLICY "Admins and PMs can remove project contacts in their organization"
ON public.project_contacts
FOR DELETE
USING (
  public.project_contact_user_can_manage_project(project_id, organization_id)
);

-- ============================================================================
-- PROJECT ISSUES TABLE POLICIES
-- ============================================================================

-- Project issues SELECT policy
CREATE POLICY "Users can see issues for projects they have access to"
ON public.project_issues
FOR SELECT
USING (
  project_id IN (SELECT id FROM public.projects)
);

-- Project issues INSERT policy
CREATE POLICY "Users can create issues for accessible projects"
ON public.project_issues
FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM public.projects)
);

-- Project issues UPDATE policy
CREATE POLICY "Users can update issues for accessible projects"
ON public.project_issues
FOR UPDATE
USING (
  project_id IN (SELECT id FROM public.projects)
);

-- Project issues DELETE policy
CREATE POLICY "Admins, PMs, and creators can delete issues"
ON public.project_issues
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects 
    WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin' OR created_by_user_id = (select auth.uid())
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
  project_id IN (SELECT id FROM public.projects)
);

-- Project phases INSERT policy
CREATE POLICY "Users can create phases for accessible projects"
ON public.project_phases
FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM public.projects)
);

-- Project phases UPDATE policy
CREATE POLICY "Users can update phases for accessible projects"
ON public.project_phases
FOR UPDATE
USING (
  project_id IN (SELECT id FROM public.projects)
);

-- Project phases DELETE policy
CREATE POLICY "Users can delete phases for accessible projects"
ON public.project_phases
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin' OR created_by_user_id = (select auth.uid())
  )
);

-- ============================================================================
-- WEATHER_IMPACTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can see weather impacts for accessible projects"
ON public.weather_impacts
FOR SELECT
USING (
  project_id IN (SELECT id FROM public.projects)
);

CREATE POLICY "Users can create weather impacts for accessible projects"
ON public.weather_impacts
FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM public.projects)
);

CREATE POLICY "Users can update weather impacts for accessible projects"
ON public.weather_impacts
FOR UPDATE
USING (
  project_id IN (SELECT id FROM public.projects)
);

CREATE POLICY "Admins PMs creators can delete weather impacts"
ON public.weather_impacts
FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = (select auth.uid())
       OR (select get_user_role()) = 'Admin'
       OR created_by_user_id = (select auth.uid())
  )
);

-- ============================================================================
-- TASKS TABLE POLICIES
-- ============================================================================

-- Tasks SELECT policy
-- Users can see tasks in accessible projects OR tasks directly assigned to them
CREATE POLICY "Users can see tasks for projects they have access to"
ON public.tasks
FOR SELECT
USING (
  project_id IN (SELECT id FROM public.projects)
  OR
  -- "Assigned-to-me" escape hatch: users can always see tasks assigned to their contact_id
  -- This ensures assigned users see their tasks even if project_contacts link is missing
  (
    assignee_id IS NOT NULL
    AND assignee_id = (select get_user_contact_id())
    AND (select get_user_contact_id()) IS NOT NULL
    AND organization_id = (select get_user_organization_id())
  )
);

-- Tasks INSERT policy
CREATE POLICY "Users can create tasks for accessible projects"
ON public.tasks
FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM public.projects)
);

-- Tasks UPDATE policy
CREATE POLICY "Users can update their assigned tasks or admins/PMs can update any"
ON public.tasks
FOR UPDATE
USING (
  (assignee_id IN (SELECT contact_id FROM public.profiles WHERE id = (select auth.uid()) AND contact_id IS NOT NULL))
  OR
  (project_id IN (
    SELECT id FROM public.projects 
    WHERE project_manager_id = (select auth.uid()) OR (select get_user_role()) = 'Admin'
  ))
);

-- Tasks DELETE policy
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
-- TASK_PHOTOS TABLE HELPERS AND POLICIES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_task_photo_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.tasks%ROWTYPE;
BEGIN
  SELECT *
  INTO task_row
  FROM public.tasks
  WHERE id = NEW.task_id;

  IF task_row.id IS NULL THEN
    RAISE EXCEPTION 'Task % not found for task photo', NEW.task_id;
  END IF;

  NEW.project_id := task_row.project_id;
  NEW.organization_id := task_row.organization_id;
  NEW.updated_at := now();

  IF NEW.storage_bucket IS NULL OR btrim(NEW.storage_bucket) = '' THEN
    NEW.storage_bucket := 'task_photos';
  END IF;

  IF NEW.sort_order IS NULL THEN
    NEW.sort_order := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_task_photo_scope ON public.task_photos;
CREATE TRIGGER set_task_photo_scope
BEFORE INSERT OR UPDATE ON public.task_photos
FOR EACH ROW
EXECUTE FUNCTION public.set_task_photo_scope();

CREATE OR REPLACE FUNCTION public.can_view_task(task_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_uuid
      AND (
        t.project_id IN (SELECT id FROM public.projects)
        OR (
          t.assignee_id IS NOT NULL
          AND t.assignee_id = (select get_user_contact_id())
          AND (select get_user_contact_id()) IS NOT NULL
          AND t.organization_id = (select get_user_organization_id())
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_task(task_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_uuid
      AND (
        t.assignee_id IN (
          SELECT p.contact_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.contact_id IS NOT NULL
        )
        OR t.project_id IN (
          SELECT id
          FROM public.projects
          WHERE project_manager_id = auth.uid()
             OR (select get_user_role()) = 'Admin'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_task_photo_object(file_path TEXT, require_manage BOOLEAN DEFAULT false)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  path_parts TEXT[];
  parsed_org_id UUID;
  parsed_project_id UUID;
  parsed_task_id UUID;
  task_org_id UUID;
  task_project_id UUID;
BEGIN
  path_parts := string_to_array(COALESCE(file_path, ''), '/');

  IF array_length(path_parts, 1) < 5 THEN
    RETURN false;
  END IF;

  BEGIN
    parsed_org_id := path_parts[1]::UUID;
    parsed_project_id := path_parts[2]::UUID;
    parsed_task_id := path_parts[3]::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  IF path_parts[4] NOT IN ('original', 'thumb') THEN
    RETURN false;
  END IF;

  SELECT t.organization_id, t.project_id
  INTO task_org_id, task_project_id
  FROM public.tasks t
  WHERE t.id = parsed_task_id;

  IF task_org_id IS NULL OR task_project_id IS NULL THEN
    RETURN false;
  END IF;

  IF task_org_id <> parsed_org_id OR task_project_id <> parsed_project_id THEN
    RETURN false;
  END IF;

  IF require_manage THEN
    RETURN public.can_manage_task(parsed_task_id);
  END IF;

  RETURN public.can_view_task(parsed_task_id);
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task_photos',
  'task_photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload task photos" ON storage.objects;
CREATE POLICY "Users can upload task photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'task_photos'
  AND public.can_access_task_photo_object(name, true)
);

DROP POLICY IF EXISTS "Users can read task photos" ON storage.objects;
CREATE POLICY "Users can read task photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'task_photos'
  AND public.can_access_task_photo_object(name, false)
);

DROP POLICY IF EXISTS "Users can update task photos" ON storage.objects;
CREATE POLICY "Users can update task photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'task_photos'
  AND public.can_access_task_photo_object(name, true)
)
WITH CHECK (
  bucket_id = 'task_photos'
  AND public.can_access_task_photo_object(name, true)
);

DROP POLICY IF EXISTS "Users can delete task photos" ON storage.objects;
CREATE POLICY "Users can delete task photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'task_photos'
  AND public.can_access_task_photo_object(name, true)
);

DROP POLICY IF EXISTS "Users can see task photos for visible tasks" ON public.task_photos;
CREATE POLICY "Users can see task photos for visible tasks"
ON public.task_photos
FOR SELECT
USING (public.can_view_task(task_id));

DROP POLICY IF EXISTS "Users can manage task photos for editable tasks" ON public.task_photos;
CREATE POLICY "Users can manage task photos for editable tasks"
ON public.task_photos
FOR INSERT
WITH CHECK (
  public.can_manage_task(task_id)
  AND uploaded_by_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can update task photos for editable tasks" ON public.task_photos;
CREATE POLICY "Users can update task photos for editable tasks"
ON public.task_photos
FOR UPDATE
USING (public.can_manage_task(task_id))
WITH CHECK (public.can_manage_task(task_id));

DROP POLICY IF EXISTS "Users can delete task photos for editable tasks" ON public.task_photos;
CREATE POLICY "Users can delete task photos for editable tasks"
ON public.task_photos
FOR DELETE
USING (public.can_manage_task(task_id));

-- ============================================================================
-- TASK_DEPENDENCIES TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can see task dependencies for tasks they can see"
ON public.task_dependencies FOR SELECT
USING (
  task_id IN (SELECT id FROM public.tasks)
  AND successor_task_id IN (SELECT id FROM public.tasks)
);

CREATE POLICY "Users can create task dependencies for tasks they can update"
ON public.task_dependencies FOR INSERT
WITH CHECK (
  task_id IN (SELECT id FROM public.tasks)
  AND successor_task_id IN (SELECT id FROM public.tasks)
);

CREATE POLICY "Users can update task dependencies for tasks they can update"
ON public.task_dependencies FOR UPDATE
USING (
  task_id IN (SELECT id FROM public.tasks)
  AND successor_task_id IN (SELECT id FROM public.tasks)
);

CREATE POLICY "Users can delete task dependencies for tasks they can update"
ON public.task_dependencies FOR DELETE
USING (
  task_id IN (SELECT id FROM public.tasks)
  AND successor_task_id IN (SELECT id FROM public.tasks)
);

-- ============================================================================
-- PROJECT_TEMPLATES TABLE POLICIES
-- ============================================================================

CREATE POLICY "Users can view templates in their organization"
ON public.project_templates FOR SELECT
USING (organization_id = (select get_user_organization_id()));

CREATE POLICY "Users can create templates in their organization"
ON public.project_templates FOR INSERT
WITH CHECK (organization_id = (select get_user_organization_id()));

CREATE POLICY "Users can update templates in their organization"
ON public.project_templates FOR UPDATE
USING (organization_id = (select get_user_organization_id()));

CREATE POLICY "Users can delete templates in their organization"
ON public.project_templates FOR DELETE
USING (organization_id = (select get_user_organization_id()));

-- ============================================================================
-- USER PREFERENCES TABLE POLICIES
-- ============================================================================

-- User preferences SELECT policy
CREATE POLICY "Users can only see their own preferences"
ON public.user_preferences
FOR SELECT
USING (user_id = (select auth.uid()));

-- User preferences INSERT policy
CREATE POLICY "Users can create their own preferences"
ON public.user_preferences
FOR INSERT
WITH CHECK (user_id = (select auth.uid()));

-- User preferences UPDATE policy
CREATE POLICY "Users can update their own preferences"
ON public.user_preferences
FOR UPDATE
USING (user_id = (select auth.uid()));

-- User preferences DELETE policy
CREATE POLICY "Users can delete their own preferences"
ON public.user_preferences
FOR DELETE
USING (user_id = (select auth.uid()));

-- ============================================================================
-- ACTIVITY LOG TABLE POLICIES
-- ============================================================================

-- Activity log SELECT policy
CREATE POLICY "Users can see activity with permission and scope"
ON public.activity_log
FOR SELECT
TO authenticated
USING (
  (
    public.user_can_view_activity_history()
    OR public.is_user_admin()
  )
  AND (
    (
      project_id IS NOT NULL
      AND project_id IN (SELECT public.get_accessible_project_ids())
    )
    OR (
      project_id IS NULL
      AND organization_id = public.get_user_organization_id()
    )
  )
);

CREATE POLICY "Users can create activity logs for accessible scope"
ON public.activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  (
    project_id IS NOT NULL
    AND project_id IN (SELECT public.get_accessible_project_ids())
  )
  OR (
    project_id IS NULL
    AND organization_id = public.get_user_organization_id()
  )
);

-- Activity log UPDATE policy (rarely used, but allow users to update their own logs)
CREATE POLICY "Users can update their own activity logs"
ON public.activity_log
FOR UPDATE
USING (user_id = (select auth.uid()));

-- Activity log DELETE policy (rarely used, but allow users to delete their own logs)
CREATE POLICY "Users can delete their own activity logs"
ON public.activity_log
FOR DELETE
USING (user_id = (select auth.uid()));

-- ============================================================================
-- TASK NOTIFICATION HISTORY (edge function writes via service role; clients read by org)
-- ============================================================================

CREATE POLICY "Users can view task notification history for their organization"
ON public.task_notification_history
FOR SELECT
TO authenticated
USING (organization_id = (select get_user_organization_id()));

CREATE POLICY "Users can view dependency notification history for their organization"
ON public.task_dependency_notification_history
FOR SELECT
TO authenticated
USING (organization_id = (select get_user_organization_id()));

CREATE POLICY "Users can create dependency notification history for their organization"
ON public.task_dependency_notification_history
FOR INSERT
TO authenticated
WITH CHECK (organization_id = (select get_user_organization_id()));

CREATE POLICY "Users can delete dependency notification history for their organization"
ON public.task_dependency_notification_history
FOR DELETE
TO authenticated
USING (organization_id = (select get_user_organization_id()));

-- ============================================================================
-- INVITATIONS TABLE POLICIES
-- ============================================================================

-- Invitations SELECT policy: no anon access to list invitations (prevents enumeration).
-- Authenticated users: can see invitations they sent or that match their email.
-- For invite acceptance by token, use RPC get_invitation_by_token(invitation_token) instead.
CREATE POLICY "Authenticated users can see their invitations"
ON public.invitations
FOR SELECT
USING (
  (select auth.uid()) IS NOT NULL
  AND (
    invited_by_user_id = (select auth.uid())
    OR
    email IN (
      SELECT c.email
      FROM public.profiles p
      JOIN public.contacts c ON p.contact_id = c.id
      WHERE p.id = (select auth.uid())
    )
  )
);

-- RPC for invite acceptance page: fetch single invitation by token (anon can call).
-- Use from frontend: supabase.rpc('get_invitation_by_token', { invitation_token: token })
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invitation_token_param TEXT)
RETURNS SETOF public.invitations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.invitations
  WHERE invitation_token = invitation_token_param
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
$$;

-- Invitations INSERT policy
CREATE POLICY "Authenticated users can create invitations"
ON public.invitations
FOR INSERT
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND invited_by_user_id = (select auth.uid())
);

-- Invitations UPDATE policy
-- More permissive: allow updates by token or by email match
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

-- Invitations DELETE policy
CREATE POLICY "Users can delete their sent invitations"
ON public.invitations
FOR DELETE
USING (invited_by_user_id = (select auth.uid()));

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
-- Performance Optimization Indexes
-- These indexes target the most frequently queried columns for 80-90% faster queries

-- ============================================
-- CRITICAL INDEXES (Most frequently used)
-- ============================================

-- Projects: Filter by organization
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);

-- Projects: Filter by status
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Projects: Composite index for organization + status queries
CREATE INDEX IF NOT EXISTS idx_projects_org_status ON projects(organization_id, status);

-- Profiles: Filter by organization
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);

-- Profiles: Lookup by role
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);

-- Profiles: Composite index for organization + role
CREATE INDEX IF NOT EXISTS idx_profiles_org_role ON profiles(organization_id, role_id);

-- Contacts: Filter by organization
CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON contacts(organization_id);

-- Contacts: Lookup by email (for user matching)
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- Contacts: Filter by type
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);

-- Tasks: Filter by project
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

-- Tasks: Filter by assignee
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);

-- Task photos: Filter by task
CREATE INDEX IF NOT EXISTS idx_task_photos_task_id ON task_photos(task_id);

-- Task photos: Filter by project
CREATE INDEX IF NOT EXISTS idx_task_photos_project_id ON task_photos(project_id);

-- Task photos: Filter by organization
CREATE INDEX IF NOT EXISTS idx_task_photos_organization_id ON task_photos(organization_id);

-- Task photos: Stable ordering within a task
CREATE INDEX IF NOT EXISTS idx_task_photos_task_sort_order ON task_photos(task_id, sort_order, created_at);

-- Task photos: Completion evidence
CREATE INDEX IF NOT EXISTS idx_task_photos_completion
ON task_photos(task_id, is_completion_photo)
WHERE is_completion_photo = true;

CREATE INDEX IF NOT EXISTS idx_task_photos_captured_at
ON task_photos(captured_at)
WHERE captured_at IS NOT NULL;

-- Tasks: Filter by completion status
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);

-- Tasks: Composite index for project + completion status queries
CREATE INDEX IF NOT EXISTS idx_tasks_project_completed ON tasks(project_id, completed);

-- ============================================
-- SECONDARY INDEXES (Nice to have)
-- ============================================

-- Files: Filter by project
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);

-- Files: Filter by uploaded user
CREATE INDEX IF NOT EXISTS idx_files_created_by ON files(created_by_user_id);

-- Calendar Events: Filter by project
CREATE INDEX IF NOT EXISTS idx_calendar_events_project_id ON calendar_events(project_id);

-- Calendar Events: Filter by date range
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);

-- Calendar Events: Filter by end date
CREATE INDEX IF NOT EXISTS idx_calendar_events_end_time ON calendar_events(end_time);

-- Calendar Events: Filter by user
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);

-- Messages: Filter by channel
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);

-- Messages: Filter by sender
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

-- Messages: Order by timestamp
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Message Channels: Filter by project
CREATE INDEX IF NOT EXISTS idx_message_channels_project_id ON message_channels(project_id);

-- Project Contacts: Composite index for lookups
CREATE INDEX IF NOT EXISTS idx_project_contacts_project_contact ON project_contacts(project_id, contact_id);

-- Project Contacts: Reverse lookup
CREATE INDEX IF NOT EXISTS idx_project_contacts_contact_project ON project_contacts(contact_id, project_id);

-- ============================================
-- EXISTING INDEXES (Maintained for compatibility)
-- ============================================
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
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_successor_task_id ON task_dependencies(successor_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON tasks(start_date) WHERE start_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_is_milestone ON tasks(is_milestone) WHERE is_milestone = true;
CREATE INDEX IF NOT EXISTS idx_project_templates_organization_id ON project_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_project_templates_created_at ON project_templates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Audit field indexes
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_files_created_by ON files(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_issue_steps_created_by ON issue_steps(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_project_issues_created_by ON project_issues(created_by_user_id);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_organization_id ON activity_log(organization_id) 
WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON activity_log(project_id) 
WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
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
CREATE INDEX IF NOT EXISTS idx_task_notification_history_org_date ON task_notification_history(organization_id, notification_date DESC);
CREATE INDEX IF NOT EXISTS idx_task_notification_history_task ON task_notification_history(task_id, notification_date DESC);
CREATE INDEX IF NOT EXISTS idx_task_dependency_notification_history_trigger ON task_dependency_notification_history(trigger_task_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_dependency_notification_history_org ON task_dependency_notification_history(organization_id, sent_at DESC);

-- ============================================================================
-- ADDITIONAL PERFORMANCE INDEXES (From optimization scripts)
-- ============================================================================

-- Projects: Index for project_number (newly added column)
CREATE INDEX IF NOT EXISTS idx_projects_project_number 
ON projects(project_number)
WHERE project_number IS NOT NULL;

-- Projects: Index for created_at (for sorting/filtering by date)
CREATE INDEX IF NOT EXISTS idx_projects_created_at 
ON projects(created_at DESC);

-- Projects: Index for due_date (for date range queries)
CREATE INDEX IF NOT EXISTS idx_projects_due_date 
ON projects(due_date)
WHERE due_date IS NOT NULL;

-- Projects: Composite index for organization + created_at (common query pattern)
CREATE INDEX IF NOT EXISTS idx_projects_org_created_at 
ON projects(organization_id, created_at DESC);

-- Projects: Composite index for organization + due_date
CREATE INDEX IF NOT EXISTS idx_projects_org_due_date 
ON projects(organization_id, due_date)
WHERE due_date IS NOT NULL;

-- Projects: Partial index for active projects (most common statuses)
CREATE INDEX IF NOT EXISTS idx_projects_active 
ON projects(organization_id, status, created_at DESC) 
WHERE status IN ('Planning', 'In Progress');

-- Projects: Partial index for completed projects (for historical queries)
CREATE INDEX IF NOT EXISTS idx_projects_completed 
ON projects(organization_id, created_at DESC) 
WHERE status = 'Completed';

-- Projects: Composite index for organization + status + created_at (common dashboard query)
CREATE INDEX IF NOT EXISTS idx_projects_org_status_created 
ON projects(organization_id, status, created_at DESC);

-- Contacts: Index for name (for search/filtering)
CREATE INDEX IF NOT EXISTS idx_contacts_name 
ON contacts(name)
WHERE name IS NOT NULL;

-- Contacts: Composite index for organization + name (for org-scoped searches)
CREATE INDEX IF NOT EXISTS idx_contacts_org_name 
ON contacts(organization_id, name)
WHERE name IS NOT NULL;

-- Contacts: Composite index for organization + type + status (common filtering)
CREATE INDEX IF NOT EXISTS idx_contacts_org_type_status 
ON contacts(organization_id, type, status);

-- Tasks: Composite index for organization + completed (common filtering pattern)
CREATE INDEX IF NOT EXISTS idx_tasks_org_completed 
ON tasks(organization_id, completed);

-- Tasks: Partial index for pending tasks (most common query)
CREATE INDEX IF NOT EXISTS idx_tasks_pending 
ON tasks(project_id, assignee_id, due_date) 
WHERE completed = false;

-- Tasks: Partial index for overdue tasks
-- Note: Cannot use CURRENT_DATE in index predicate (must be IMMUTABLE)
-- Index on incomplete tasks with due dates - queries can filter by date
CREATE INDEX IF NOT EXISTS idx_tasks_overdue 
ON tasks(organization_id, due_date) 
WHERE completed = false 
    AND due_date IS NOT NULL;

-- Tasks: Composite index for organization + project + completed + assignee (common filtering)
CREATE INDEX IF NOT EXISTS idx_tasks_org_project_completed_assignee 
ON tasks(organization_id, project_id, completed, assignee_id)
WHERE assignee_id IS NOT NULL;

-- Tasks: Index for due_date if column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tasks' 
        AND column_name = 'due_date'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_tasks_due_date 
        ON tasks(due_date)
        WHERE due_date IS NOT NULL;
        
        -- Composite index for organization + completed + due_date
        CREATE INDEX IF NOT EXISTS idx_tasks_org_completed_due_date 
        ON tasks(organization_id, completed, due_date)
        WHERE due_date IS NOT NULL;
    END IF;
END $$;

-- Messages: Composite index for channel + created_at (for message ordering)
CREATE INDEX IF NOT EXISTS idx_messages_channel_created_at 
ON messages(channel_id, created_at DESC)
WHERE channel_id IS NOT NULL;

-- Messages: Composite index for organization + channel + created_at (for org message feeds)
CREATE INDEX IF NOT EXISTS idx_messages_org_channel_created 
ON messages(organization_id, channel_id, created_at DESC)
WHERE organization_id IS NOT NULL AND channel_id IS NOT NULL;

-- Calendar Events: Composite index for organization + start_time (for org calendar views)
CREATE INDEX IF NOT EXISTS idx_calendar_events_org_start_time 
ON calendar_events(organization_id, start_time);

-- Calendar Events: Composite index for project + start_time
CREATE INDEX IF NOT EXISTS idx_calendar_events_project_start_time 
ON calendar_events(project_id, start_time)
WHERE project_id IS NOT NULL;

-- Calendar Events: Partial index for active calendar events (upcoming)
-- Note: Cannot use CURRENT_TIMESTAMP in index predicate (must be IMMUTABLE)
-- Index all events - queries can filter by start_time >= NOW()
CREATE INDEX IF NOT EXISTS idx_calendar_events_upcoming 
ON calendar_events(organization_id, start_time);

-- Activity Log: Composite index for organization + created_at (for org activity feeds)
CREATE INDEX IF NOT EXISTS idx_activity_log_org_created_at 
ON activity_log(organization_id, created_at DESC)
WHERE organization_id IS NOT NULL;

-- Activity Log: Composite index for project + created_at
CREATE INDEX IF NOT EXISTS idx_activity_log_project_created_at 
ON activity_log(project_id, created_at DESC)
WHERE project_id IS NOT NULL;

-- Files: Index for modified_at (for sorting by modification date)
CREATE INDEX IF NOT EXISTS idx_files_modified_at 
ON files(modified_at DESC);

-- Files: Composite index for project + modified_at
CREATE INDEX IF NOT EXISTS idx_files_project_modified_at 
ON files(project_id, modified_at DESC)
WHERE project_id IS NOT NULL;

-- Invitations: Partial index for pending invitations
CREATE INDEX IF NOT EXISTS idx_invitations_pending_org 
ON invitations(organization_id, created_at DESC) 
WHERE status = 'pending';

-- ============================================================================
-- PERFORMANCE OPTIMIZATION NOTES
-- ============================================================================
-- The indexes above are automatically maintained by PostgreSQL
-- No manual maintenance required
-- They will slow down INSERT/UPDATE/DELETE slightly but dramatically speed up SELECT queries
-- Expected performance improvement: 80-90% faster queries on indexed columns
--
-- To verify indexes are being used, run:
-- EXPLAIN ANALYZE SELECT * FROM projects WHERE organization_id = 'your-org-id';
-- Look for "Index Scan" instead of "Seq Scan" in the output
--
-- To see all indexes and their usage:
-- SELECT tablename, indexname, idx_scan as times_used
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- Desktop notification center foundations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS notification_email_batching_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS notification_batch_window_minutes INTEGER NOT NULL DEFAULT 5;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS progress_report_send_hour INTEGER NOT NULL DEFAULT 8;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS progress_report_timezone TEXT NOT NULL DEFAULT 'America/New_York';

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS default_send_assignment_email BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS notify_assignee_email BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS notification_email_batching_enabled BOOLEAN;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS notification_batch_window_minutes INTEGER;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS dependency_notifications_enabled BOOLEAN;

ALTER TABLE public.task_notification_history
ADD COLUMN IF NOT EXISTS batch_key UUID;

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    recipient_user_id UUID,
    recipient_email TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id UUID,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    read_by_user_id UUID,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_type, source_id, recipient_email)
);

CREATE TABLE IF NOT EXISTS public.notification_action_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.user_notifications(id) ON DELETE CASCADE,
    acted_by_user_id UUID,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_created
ON public.user_notifications(recipient_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_user_created
ON public.user_notifications(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
ON public.user_notifications(recipient_email, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_action_history_notification
ON public.notification_action_history(notification_id, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_action_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.user_notifications;
CREATE POLICY "Users can view own notifications"
ON public.user_notifications
FOR SELECT
TO authenticated
USING (
    organization_id = (SELECT public.get_user_organization_id())
    AND (
        lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR recipient_user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.user_notifications;
CREATE POLICY "Users can update own notifications"
ON public.user_notifications
FOR UPDATE
TO authenticated
USING (
    organization_id = (SELECT public.get_user_organization_id())
    AND (
        lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR recipient_user_id = auth.uid()
    )
)
WITH CHECK (
    organization_id = (SELECT public.get_user_organization_id())
    AND (
        lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR recipient_user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Service role can insert notifications" ON public.user_notifications;
CREATE POLICY "Service role can insert notifications"
ON public.user_notifications
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own notification actions" ON public.notification_action_history;
CREATE POLICY "Users can view own notification actions"
ON public.notification_action_history
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.user_notifications n
        WHERE n.id = notification_action_history.notification_id
          AND n.organization_id = (SELECT public.get_user_organization_id())
          AND (
            lower(n.recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            OR n.recipient_user_id = auth.uid()
          )
    )
);

DROP POLICY IF EXISTS "Service role can insert notification actions" ON public.notification_action_history;
CREATE POLICY "Service role can insert notification actions"
ON public.notification_action_history
FOR INSERT
TO service_role
WITH CHECK (true);


-- ============================================================================
-- PROJECT ACCESS INVITES POLICIES
-- ============================================================================
CREATE POLICY "Org members can view project access invites"
ON public.project_access_invites FOR SELECT
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Org members can manage project access invites"
ON public.project_access_invites FOR ALL
USING (organization_id = public.get_user_organization_id())
WITH CHECK (organization_id = public.get_user_organization_id());

-- ============================================================================
-- PROJECT STREAM + TASK COMMENTS POLICIES
-- ============================================================================
CREATE POLICY "stream_posts_select"
ON public.project_stream_posts FOR SELECT TO authenticated
USING (project_id IN (SELECT public.get_accessible_project_ids()));

CREATE POLICY "stream_posts_insert"
ON public.project_stream_posts FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND project_id IN (SELECT public.get_accessible_project_ids())
  AND organization_id = (SELECT organization_id FROM public.projects WHERE id = project_id)
);

CREATE POLICY "stream_posts_update"
ON public.project_stream_posts FOR UPDATE TO authenticated
USING (
  author_id = auth.uid()
  OR project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = auth.uid() OR public.is_user_admin()
  )
)
WITH CHECK (project_id IN (SELECT public.get_accessible_project_ids()));

CREATE POLICY "stream_posts_delete"
ON public.project_stream_posts FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  OR project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = auth.uid() OR public.is_user_admin()
  )
);

CREATE POLICY "stream_replies_select"
ON public.project_stream_replies FOR SELECT TO authenticated
USING (
  post_id IN (
    SELECT id FROM public.project_stream_posts
    WHERE project_id IN (SELECT public.get_accessible_project_ids())
  )
);

CREATE POLICY "stream_replies_insert"
ON public.project_stream_replies FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND post_id IN (
    SELECT id FROM public.project_stream_posts
    WHERE project_id IN (SELECT public.get_accessible_project_ids())
  )
);

CREATE POLICY "stream_replies_update"
ON public.project_stream_replies FOR UPDATE TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

CREATE POLICY "stream_replies_delete"
ON public.project_stream_replies FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  OR post_id IN (
    SELECT psp.id FROM public.project_stream_posts psp
    JOIN public.projects pr ON pr.id = psp.project_id
    WHERE pr.project_manager_id = auth.uid() OR public.is_user_admin()
  )
);

CREATE POLICY "task_comments_select"
ON public.task_comments FOR SELECT TO authenticated
USING (
  project_id IN (SELECT public.get_accessible_project_ids())
  AND (
    visibility = 'public'
    OR public.user_is_org_member_for_project(project_id)
  )
);

CREATE POLICY "task_comments_insert"
ON public.task_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND project_id IN (SELECT public.get_accessible_project_ids())
  AND (
    visibility = 'public'
    OR (visibility = 'internal' AND public.user_is_org_member_for_project(project_id))
  )
);

CREATE POLICY "task_comments_update"
ON public.task_comments FOR UPDATE TO authenticated
USING (
  author_id = auth.uid()
  OR project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = auth.uid() OR public.is_user_admin()
  )
)
WITH CHECK (
  project_id IN (SELECT public.get_accessible_project_ids())
  AND (
    visibility = 'public'
    OR (visibility = 'internal' AND public.user_is_org_member_for_project(project_id))
  )
);

CREATE POLICY "task_comments_delete"
ON public.task_comments FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  OR project_id IN (
    SELECT id FROM public.projects
    WHERE project_manager_id = auth.uid() OR public.is_user_admin()
  )
);

-- ============================================================================
-- SCHEDULE IMPORT TEMPLATES
-- ============================================================================
CREATE POLICY "Users can view their organization schedule import templates"
ON public.schedule_import_templates FOR SELECT
USING (organization_id = (SELECT public.get_user_organization_id()));

CREATE POLICY "Users can create schedule import templates for their organization"
ON public.schedule_import_templates FOR INSERT
WITH CHECK (organization_id = (SELECT public.get_user_organization_id()));

CREATE POLICY "Users can update their organization schedule import templates"
ON public.schedule_import_templates FOR UPDATE
USING (organization_id = (SELECT public.get_user_organization_id()));

CREATE POLICY "Users can delete their organization schedule import templates"
ON public.schedule_import_templates FOR DELETE
USING (organization_id = (SELECT public.get_user_organization_id()));

-- ============================================================================
-- TASK NOTIFICATION GUEST SHARES (no client policies; service_role only)
-- ============================================================================
REVOKE ALL ON public.task_notification_guest_shares FROM PUBLIC;
REVOKE ALL ON public.task_notification_guest_shares FROM anon, authenticated;

-- ============================================================================
-- SMS PHONE CONSENT
-- ============================================================================
CREATE POLICY "sms_phone_consent_select_authenticated"
ON public.sms_phone_consent FOR SELECT TO authenticated
USING (true);

GRANT SELECT ON TABLE public.sms_phone_consent TO authenticated;
GRANT ALL ON TABLE public.sms_phone_consent TO service_role;

-- ============================================================================
-- MODERATION POLICIES
-- ============================================================================
CREATE POLICY "Users can see their own reports"
ON public.content_reports FOR SELECT
USING (reported_by_user_id = auth.uid());

CREATE POLICY "Admins can see all reports"
ON public.content_reports FOR SELECT
USING (public.get_user_role() = 'Admin');

CREATE POLICY "Users can create reports"
ON public.content_reports FOR INSERT
WITH CHECK (reported_by_user_id = auth.uid());

CREATE POLICY "Admins can update reports"
ON public.content_reports FOR UPDATE
USING (public.get_user_role() = 'Admin')
WITH CHECK (public.get_user_role() = 'Admin');

CREATE POLICY "Users can see their own blocks"
ON public.blocked_users FOR SELECT
USING (blocker_user_id = auth.uid());

CREATE POLICY "Users can create blocks"
ON public.blocked_users FOR INSERT
WITH CHECK (blocker_user_id = auth.uid());

CREATE POLICY "Users can delete their own blocks"
ON public.blocked_users FOR DELETE
USING (blocker_user_id = auth.uid());

CREATE POLICY "Users can see their own ToS acceptances"
ON public.terms_of_service_acceptances FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own ToS acceptances"
ON public.terms_of_service_acceptances FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can see all ToS acceptances"
ON public.terms_of_service_acceptances FOR SELECT
USING (public.get_user_role() = 'Admin');

-- ============================================================================
-- PROGRESS REPORT POLICIES (hardened + org-wide permission; migrations 20260428183500, 20260503180000)
-- ============================================================================
CREATE POLICY "Users with permission can view schedules"
ON public.progress_report_schedules FOR SELECT
USING (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR (
    organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
    AND (
      (
        project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p3
          JOIN public.roles r ON r.id = p3.role_id
          WHERE p3.id = auth.uid()
            AND p3.organization_id = progress_report_schedules.organization_id
            AND (r.permissions->>'can_manage_progress_reports')::boolean = true
        )
      )
      OR (
        project_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p4
          JOIN public.roles r4 ON r4.id = p4.role_id
          WHERE p4.id = auth.uid()
            AND p4.organization_id = progress_report_schedules.organization_id
            AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
        )
      )
    )
  )
);

CREATE POLICY "Users with permission can create schedules"
ON public.progress_report_schedules FOR INSERT
WITH CHECK (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR (
    organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
    AND (
      (
        project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p3
          JOIN public.roles r ON r.id = p3.role_id
          WHERE p3.id = auth.uid()
            AND p3.organization_id = progress_report_schedules.organization_id
            AND (r.permissions->>'can_manage_progress_reports')::boolean = true
        )
      )
      OR (
        project_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p4
          JOIN public.roles r4 ON r4.id = p4.role_id
          WHERE p4.id = auth.uid()
            AND p4.organization_id = progress_report_schedules.organization_id
            AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
        )
      )
    )
  )
);

CREATE POLICY "Users with permission can update schedules"
ON public.progress_report_schedules FOR UPDATE
USING (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR (
    organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
    AND (
      (
        project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p3
          JOIN public.roles r ON r.id = p3.role_id
          WHERE p3.id = auth.uid()
            AND p3.organization_id = progress_report_schedules.organization_id
            AND (r.permissions->>'can_manage_progress_reports')::boolean = true
        )
      )
      OR (
        project_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p4
          JOIN public.roles r4 ON r4.id = p4.role_id
          WHERE p4.id = auth.uid()
            AND p4.organization_id = progress_report_schedules.organization_id
            AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
        )
      )
    )
  )
)
WITH CHECK (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR (
    organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
    AND (
      (
        project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p3
          JOIN public.roles r ON r.id = p3.role_id
          WHERE p3.id = auth.uid()
            AND p3.organization_id = progress_report_schedules.organization_id
            AND (r.permissions->>'can_manage_progress_reports')::boolean = true
        )
      )
      OR (
        project_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p4
          JOIN public.roles r4 ON r4.id = p4.role_id
          WHERE p4.id = auth.uid()
            AND p4.organization_id = progress_report_schedules.organization_id
            AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
        )
      )
    )
  )
);

CREATE POLICY "Users with permission can delete schedules"
ON public.progress_report_schedules FOR DELETE
USING (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR (
    organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
    AND (
      (
        project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p3
          JOIN public.roles r ON r.id = p3.role_id
          WHERE p3.id = auth.uid()
            AND p3.organization_id = progress_report_schedules.organization_id
            AND (r.permissions->>'can_manage_progress_reports')::boolean = true
        )
      )
      OR (
        project_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p4
          JOIN public.roles r4 ON r4.id = p4.role_id
          WHERE p4.id = auth.uid()
            AND p4.organization_id = progress_report_schedules.organization_id
            AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
        )
      )
    )
  )
);

CREATE POLICY "Users with permission can view recipients"
ON public.progress_report_recipients FOR SELECT
USING (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.progress_report_schedules s
    WHERE s.id = progress_report_recipients.schedule_id
      AND s.organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
      AND (
        (
          s.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p3
            JOIN public.roles r ON r.id = p3.role_id
            WHERE p3.id = auth.uid()
              AND p3.organization_id = s.organization_id
              AND (r.permissions->>'can_manage_progress_reports')::boolean = true
          )
        )
        OR (
          s.project_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p4
            JOIN public.roles r4 ON r4.id = p4.role_id
            WHERE p4.id = auth.uid()
              AND p4.organization_id = s.organization_id
              AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
          )
        )
      )
  )
);

CREATE POLICY "Users with permission can insert recipients"
ON public.progress_report_recipients FOR INSERT
WITH CHECK (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.progress_report_schedules s
    WHERE s.id = progress_report_recipients.schedule_id
      AND s.organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
      AND (
        (
          s.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p3
            JOIN public.roles r ON r.id = p3.role_id
            WHERE p3.id = auth.uid()
              AND p3.organization_id = s.organization_id
              AND (r.permissions->>'can_manage_progress_reports')::boolean = true
          )
        )
        OR (
          s.project_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p4
            JOIN public.roles r4 ON r4.id = p4.role_id
            WHERE p4.id = auth.uid()
              AND p4.organization_id = s.organization_id
              AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
          )
        )
      )
  )
);

CREATE POLICY "Users with permission can update recipients"
ON public.progress_report_recipients FOR UPDATE
USING (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.progress_report_schedules s
    WHERE s.id = progress_report_recipients.schedule_id
      AND s.organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
      AND (
        (
          s.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p3
            JOIN public.roles r ON r.id = p3.role_id
            WHERE p3.id = auth.uid()
              AND p3.organization_id = s.organization_id
              AND (r.permissions->>'can_manage_progress_reports')::boolean = true
          )
        )
        OR (
          s.project_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p4
            JOIN public.roles r4 ON r4.id = p4.role_id
            WHERE p4.id = auth.uid()
              AND p4.organization_id = s.organization_id
              AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
          )
        )
      )
  )
)
WITH CHECK (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.progress_report_schedules s
    WHERE s.id = progress_report_recipients.schedule_id
      AND s.organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
      AND (
        (
          s.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p3
            JOIN public.roles r ON r.id = p3.role_id
            WHERE p3.id = auth.uid()
              AND p3.organization_id = s.organization_id
              AND (r.permissions->>'can_manage_progress_reports')::boolean = true
          )
        )
        OR (
          s.project_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p4
            JOIN public.roles r4 ON r4.id = p4.role_id
            WHERE p4.id = auth.uid()
              AND p4.organization_id = s.organization_id
              AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
          )
        )
      )
  )
);

CREATE POLICY "Users with permission can delete recipients"
ON public.progress_report_recipients FOR DELETE
USING (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.progress_report_schedules s
    WHERE s.id = progress_report_recipients.schedule_id
      AND s.organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
      AND (
        (
          s.project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p3
            JOIN public.roles r ON r.id = p3.role_id
            WHERE p3.id = auth.uid()
              AND p3.organization_id = s.organization_id
              AND (r.permissions->>'can_manage_progress_reports')::boolean = true
          )
        )
        OR (
          s.project_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p4
            JOIN public.roles r4 ON r4.id = p4.role_id
            WHERE p4.id = auth.uid()
              AND p4.organization_id = s.organization_id
              AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
          )
        )
      )
  )
);

CREATE POLICY "Users with permission can view history"
ON public.progress_report_history FOR SELECT
USING (
  (SELECT COALESCE(p.is_super_admin, false) FROM public.profiles p WHERE p.id = auth.uid())
  OR (
    organization_id IN (SELECT p2.organization_id FROM public.profiles p2 WHERE p2.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.progress_report_schedules s
      WHERE s.id = progress_report_history.schedule_id
        AND s.organization_id = progress_report_history.organization_id
        AND (
          (
            s.project_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.profiles p3
              JOIN public.roles r ON r.id = p3.role_id
              WHERE p3.id = auth.uid()
                AND p3.organization_id = s.organization_id
                AND (r.permissions->>'can_manage_progress_reports')::boolean = true
            )
          )
          OR (
            s.project_id IS NULL
            AND EXISTS (
              SELECT 1 FROM public.profiles p4
              JOIN public.roles r4 ON r4.id = p4.role_id
              WHERE p4.id = auth.uid()
                AND p4.organization_id = s.organization_id
                AND (r4.permissions->>'can_manage_org_progress_reports')::boolean = true
            )
          )
        )
    )
  )
);

CREATE POLICY "Service role can manage history"
ON public.progress_report_history FOR INSERT
WITH CHECK (false);

CREATE POLICY "Users can view branding in their organization"
ON public.organization_branding FOR SELECT
USING (
  organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Users with permission can manage branding"
ON public.organization_branding FOR ALL
USING (
  organization_id IN (
    SELECT p.organization_id
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
      AND (
        (r.permissions->>'can_manage_organization')::boolean = true
        OR (r.permissions->>'can_manage_progress_reports')::boolean = true
      )
  )
);

-- ============================================================================
-- REALTIME (supabase/migrations/20260520120000)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_stream_posts;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_stream_replies;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- STORAGE BUCKETS (branding + progress report exports)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = COALESCE(EXCLUDED.file_size_limit, storage.buckets.file_size_limit),
  allowed_mime_types = COALESCE(EXCLUDED.allowed_mime_types, storage.buckets.allowed_mime_types);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'progress_report_exports',
  'progress_report_exports',
  false,
  NULL,
  ARRAY['text/html', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = ARRAY['text/html', 'application/pdf']::text[];

DROP POLICY IF EXISTS "Branding logos are publicly readable" ON storage.objects;
CREATE POLICY "Branding logos are publicly readable"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Users can upload org branding logo" ON storage.objects;
CREATE POLICY "Users can upload org branding logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = (
    SELECT p.organization_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update org branding logo" ON storage.objects;
CREATE POLICY "Users can update org branding logo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = (
    SELECT p.organization_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = (
    SELECT p.organization_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete org branding logo" ON storage.objects;
CREATE POLICY "Users can delete org branding logo"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = (
    SELECT p.organization_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

-- Notify PostgREST to reload schema after index changes
NOTIFY pgrst, 'reload schema';
