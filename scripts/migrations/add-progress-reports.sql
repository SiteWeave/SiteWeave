-- Migration: Add Progress Reports Feature
-- Superseded by schema.sql for new installs; kept for reference and incremental upgrades.
-- Creates tables, indexes, RLS policies, and permissions for progress reports

-- ============================================================================
-- TABLE CREATION
-- ============================================================================

-- Progress Report Schedules Table
CREATE TABLE IF NOT EXISTS progress_report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
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

-- Progress Report Recipients Table
CREATE TABLE IF NOT EXISTS progress_report_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES progress_report_schedules(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    recipient_type TEXT NOT NULL DEFAULT 'to' CHECK (recipient_type IN ('to', 'cc', 'bcc')),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Progress Report History Table
CREATE TABLE IF NOT EXISTS progress_report_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES progress_report_schedules(id) ON DELETE CASCADE,
    report_audience_type TEXT NOT NULL CHECK (report_audience_type IN ('client', 'internal', 'executive')),
    report_type TEXT NOT NULL CHECK (report_type IN ('project', 'organization')),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recipient_emails TEXT[] NOT NULL,
    report_data JSONB NOT NULL,
    filtered_data JSONB NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    sent_by_user_id UUID REFERENCES auth.users(id),
    email_id TEXT,
    was_manual_send BOOLEAN DEFAULT false
);

-- Organization Branding Table
CREATE TABLE IF NOT EXISTS organization_branding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#3B82F6',
    secondary_color TEXT DEFAULT '#10B981',
    company_footer TEXT,
    email_signature TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_progress_report_schedules_organization_id 
    ON progress_report_schedules(organization_id);

CREATE INDEX IF NOT EXISTS idx_progress_report_schedules_project_id 
    ON progress_report_schedules(project_id);

CREATE INDEX IF NOT EXISTS idx_progress_report_schedules_next_send 
    ON progress_report_schedules(next_send_at) 
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_progress_report_schedules_approval_status 
    ON progress_report_schedules(approval_status) 
    WHERE requires_approval = true;

CREATE INDEX IF NOT EXISTS idx_progress_report_recipients_schedule_id 
    ON progress_report_recipients(schedule_id);

CREATE INDEX IF NOT EXISTS idx_progress_report_recipients_contact_id 
    ON progress_report_recipients(contact_id);

CREATE INDEX IF NOT EXISTS idx_progress_report_history_schedule_id 
    ON progress_report_history(schedule_id);

CREATE INDEX IF NOT EXISTS idx_progress_report_history_organization_id 
    ON progress_report_history(organization_id);

CREATE INDEX IF NOT EXISTS idx_progress_report_history_sent_at 
    ON progress_report_history(sent_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE progress_report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_report_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_branding ENABLE ROW LEVEL SECURITY;

-- Progress Report Schedules Policies

-- Users can view schedules in their organization
CREATE POLICY "Users can view schedules in their organization"
ON progress_report_schedules FOR SELECT
USING (
    organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
);

-- Users with permission can create schedules
CREATE POLICY "Users with permission can create schedules"
ON progress_report_schedules FOR INSERT
WITH CHECK (
    organization_id IN (
        SELECT p.organization_id 
        FROM profiles p
        JOIN roles r ON p.role_id = r.id
        WHERE p.id = auth.uid() 
        AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

-- Users with permission can update schedules
CREATE POLICY "Users with permission can update schedules"
ON progress_report_schedules FOR UPDATE
USING (
    organization_id IN (
        SELECT p.organization_id 
        FROM profiles p
        JOIN roles r ON p.role_id = r.id
        WHERE p.id = auth.uid()
        AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

-- Users with permission can delete schedules
CREATE POLICY "Users with permission can delete schedules"
ON progress_report_schedules FOR DELETE
USING (
    organization_id IN (
        SELECT p.organization_id 
        FROM profiles p
        JOIN roles r ON p.role_id = r.id
        WHERE p.id = auth.uid()
        AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

-- Progress Report Recipients Policies

-- Users can view recipients for schedules they can access
CREATE POLICY "Users can view recipients for accessible schedules"
ON progress_report_recipients FOR SELECT
USING (
    schedule_id IN (
        SELECT id FROM progress_report_schedules
        WHERE organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    )
);

-- Users with permission can manage recipients
CREATE POLICY "Users with permission can manage recipients"
ON progress_report_recipients FOR ALL
USING (
    schedule_id IN (
        SELECT id FROM progress_report_schedules
        WHERE organization_id IN (
            SELECT p.organization_id 
            FROM profiles p
            JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid()
            AND (r.permissions->>'can_manage_progress_reports')::boolean = true
        )
    )
);

-- Progress Report History Policies

-- Users can view history for schedules in their organization
CREATE POLICY "Users can view history in their organization"
ON progress_report_history FOR SELECT
USING (
    organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
);

-- Only service role can insert/update history (via edge functions)
CREATE POLICY "Service role can manage history"
ON progress_report_history FOR INSERT
WITH CHECK (false); -- Edge functions use service role, not RLS

-- Organization Branding Policies

-- Users can view branding for their organization
CREATE POLICY "Users can view branding in their organization"
ON organization_branding FOR SELECT
USING (
    organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
);

-- Users with permission can manage branding
CREATE POLICY "Users with permission can manage branding"
ON organization_branding FOR ALL
USING (
    organization_id IN (
        SELECT p.organization_id 
        FROM profiles p
        JOIN roles r ON p.role_id = r.id
        WHERE p.id = auth.uid()
        AND (
            (r.permissions->>'can_manage_organization')::boolean = true
            OR (r.permissions->>'can_manage_progress_reports')::boolean = true
        )
    )
);

-- Harden report table access: report schedules/recipients/history are permission-gated,
-- including org-level schedules where project_id is NULL.
DROP POLICY IF EXISTS "Users can view schedules in their organization" ON progress_report_schedules;
DROP POLICY IF EXISTS "Users with permission can create schedules" ON progress_report_schedules;
DROP POLICY IF EXISTS "Users with permission can update schedules" ON progress_report_schedules;
DROP POLICY IF EXISTS "Users with permission can delete schedules" ON progress_report_schedules;

CREATE POLICY "Users with permission can view schedules"
ON progress_report_schedules FOR SELECT
USING (
    organization_id IN (
        SELECT p.organization_id
        FROM profiles p
        JOIN roles r ON r.id = p.role_id
        WHERE p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

CREATE POLICY "Users with permission can create schedules"
ON progress_report_schedules FOR INSERT
WITH CHECK (
    organization_id IN (
        SELECT p.organization_id
        FROM profiles p
        JOIN roles r ON r.id = p.role_id
        WHERE p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

CREATE POLICY "Users with permission can update schedules"
ON progress_report_schedules FOR UPDATE
USING (
    organization_id IN (
        SELECT p.organization_id
        FROM profiles p
        JOIN roles r ON r.id = p.role_id
        WHERE p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
)
WITH CHECK (
    organization_id IN (
        SELECT p.organization_id
        FROM profiles p
        JOIN roles r ON r.id = p.role_id
        WHERE p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

CREATE POLICY "Users with permission can delete schedules"
ON progress_report_schedules FOR DELETE
USING (
    organization_id IN (
        SELECT p.organization_id
        FROM profiles p
        JOIN roles r ON r.id = p.role_id
        WHERE p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

DROP POLICY IF EXISTS "Users can view recipients for accessible schedules" ON progress_report_recipients;
DROP POLICY IF EXISTS "Users with permission can manage recipients" ON progress_report_recipients;

CREATE POLICY "Users with permission can view recipients"
ON progress_report_recipients FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM progress_report_schedules s
        JOIN profiles p ON p.organization_id = s.organization_id
        JOIN roles r ON r.id = p.role_id
        WHERE s.id = progress_report_recipients.schedule_id
          AND p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

CREATE POLICY "Users with permission can insert recipients"
ON progress_report_recipients FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM progress_report_schedules s
        JOIN profiles p ON p.organization_id = s.organization_id
        JOIN roles r ON r.id = p.role_id
        WHERE s.id = progress_report_recipients.schedule_id
          AND p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

CREATE POLICY "Users with permission can update recipients"
ON progress_report_recipients FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM progress_report_schedules s
        JOIN profiles p ON p.organization_id = s.organization_id
        JOIN roles r ON r.id = p.role_id
        WHERE s.id = progress_report_recipients.schedule_id
          AND p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM progress_report_schedules s
        JOIN profiles p ON p.organization_id = s.organization_id
        JOIN roles r ON r.id = p.role_id
        WHERE s.id = progress_report_recipients.schedule_id
          AND p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

CREATE POLICY "Users with permission can delete recipients"
ON progress_report_recipients FOR DELETE
USING (
    EXISTS (
        SELECT 1
        FROM progress_report_schedules s
        JOIN profiles p ON p.organization_id = s.organization_id
        JOIN roles r ON r.id = p.role_id
        WHERE s.id = progress_report_recipients.schedule_id
          AND p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

DROP POLICY IF EXISTS "Users can view history in their organization" ON progress_report_history;

CREATE POLICY "Users with permission can view history"
ON progress_report_history FOR SELECT
USING (
    organization_id IN (
        SELECT p.organization_id
        FROM profiles p
        JOIN roles r ON r.id = p.role_id
        WHERE p.id = auth.uid()
          AND (r.permissions->>'can_manage_progress_reports')::boolean = true
    )
);

-- ============================================================================
-- PERMISSIONS UPDATE
-- ============================================================================

-- Add can_manage_progress_reports permission to Org Admin and Project Manager roles
UPDATE roles 
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb), 
    '{can_manage_progress_reports}', 
    'true'::jsonb
)
WHERE name IN ('Org Admin', 'Project Manager')
AND organization_id IS NOT NULL;

-- Ensure other roles have it set to false (if permissions exist)
UPDATE roles 
SET permissions = jsonb_set(
    permissions, 
    '{can_manage_progress_reports}', 
    'false'::jsonb
)
WHERE name NOT IN ('Org Admin', 'Project Manager')
AND organization_id IS NOT NULL
AND permissions IS NOT NULL
AND NOT (permissions ? 'can_manage_progress_reports');

-- ============================================================================
-- DEFAULT BRANDING FOR EXISTING ORGANIZATIONS
-- ============================================================================

INSERT INTO organization_branding (organization_id, primary_color, secondary_color)
SELECT id, '#3B82F6', '#10B981'
FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE progress_report_schedules IS 'Stores scheduled progress report configurations';
COMMENT ON TABLE progress_report_recipients IS 'Stores recipient email addresses for each report schedule';
COMMENT ON TABLE progress_report_history IS 'Stores history of sent progress reports';
COMMENT ON TABLE organization_branding IS 'Stores branding configuration for organization email reports';
