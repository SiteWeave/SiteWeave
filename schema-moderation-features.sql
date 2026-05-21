-- SiteWeave Moderation Features Schema
-- Superseded by schema.sql for new installs; kept for reference and incremental upgrades.
-- Content Reporting, User Blocking, and Terms of Service

-- ============================================================================
-- CONTENT REPORTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_reports (
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

-- ============================================================================
-- BLOCKED USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id != blocked_user_id)
);

-- ============================================================================
-- TERMS OF SERVICE ACCEPTANCES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS terms_of_service_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    ip_address TEXT,
    user_agent TEXT,
    UNIQUE(user_id, version)
);

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_content_reports_reported_by') THEN
        ALTER TABLE content_reports ADD CONSTRAINT fk_content_reports_reported_by 
            FOREIGN KEY (reported_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_content_reports_reported_user') THEN
        ALTER TABLE content_reports ADD CONSTRAINT fk_content_reports_reported_user 
            FOREIGN KEY (reported_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_content_reports_reviewed_by') THEN
        ALTER TABLE content_reports ADD CONSTRAINT fk_content_reports_reviewed_by 
            FOREIGN KEY (reviewed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_blocked_users_blocker') THEN
        ALTER TABLE blocked_users ADD CONSTRAINT fk_blocked_users_blocker 
            FOREIGN KEY (blocker_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_blocked_users_blocked') THEN
        ALTER TABLE blocked_users ADD CONSTRAINT fk_blocked_users_blocked 
            FOREIGN KEY (blocked_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tos_acceptances_user') THEN
        ALTER TABLE terms_of_service_acceptances ADD CONSTRAINT fk_tos_acceptances_user 
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_content_reports_reported_by ON content_reports(reported_by_user_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_reported_user ON content_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_content_type ON content_reports(content_type);
CREATE INDEX IF NOT EXISTS idx_content_reports_created_at ON content_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_tos_acceptances_user ON terms_of_service_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_tos_acceptances_version ON terms_of_service_acceptances(version);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms_of_service_acceptances ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Content Reports Policies
DROP POLICY IF EXISTS "Users can see their own reports" ON public.content_reports;
DROP POLICY IF EXISTS "Admins can see all reports" ON public.content_reports;
DROP POLICY IF EXISTS "Users can create reports" ON public.content_reports;
DROP POLICY IF EXISTS "Admins can update reports" ON public.content_reports;

CREATE POLICY "Users can see their own reports"
ON public.content_reports
FOR SELECT
USING (reported_by_user_id = auth.uid());

CREATE POLICY "Admins can see all reports"
ON public.content_reports
FOR SELECT
USING (get_user_role() = 'Admin');

CREATE POLICY "Users can create reports"
ON public.content_reports
FOR INSERT
WITH CHECK (reported_by_user_id = auth.uid());

CREATE POLICY "Admins can update reports"
ON public.content_reports
FOR UPDATE
USING (get_user_role() = 'Admin')
WITH CHECK (get_user_role() = 'Admin');

-- Blocked Users Policies
DROP POLICY IF EXISTS "Users can see their own blocks" ON public.blocked_users;
DROP POLICY IF EXISTS "Users can create blocks" ON public.blocked_users;
DROP POLICY IF EXISTS "Users can delete their own blocks" ON public.blocked_users;

CREATE POLICY "Users can see their own blocks"
ON public.blocked_users
FOR SELECT
USING (blocker_user_id = auth.uid());

CREATE POLICY "Users can create blocks"
ON public.blocked_users
FOR INSERT
WITH CHECK (blocker_user_id = auth.uid());

CREATE POLICY "Users can delete their own blocks"
ON public.blocked_users
FOR DELETE
USING (blocker_user_id = auth.uid());

-- Terms of Service Acceptances Policies
DROP POLICY IF EXISTS "Users can see their own ToS acceptances" ON public.terms_of_service_acceptances;
DROP POLICY IF EXISTS "Users can create their own ToS acceptances" ON public.terms_of_service_acceptances;
DROP POLICY IF EXISTS "Admins can see all ToS acceptances" ON public.terms_of_service_acceptances;

CREATE POLICY "Users can see their own ToS acceptances"
ON public.terms_of_service_acceptances
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own ToS acceptances"
ON public.terms_of_service_acceptances
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can see all ToS acceptances"
ON public.terms_of_service_acceptances
FOR SELECT
USING (get_user_role() = 'Admin');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a user is blocked by another user
CREATE OR REPLACE FUNCTION is_user_blocked(blocker_id UUID, blocked_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.blocked_users 
    WHERE blocker_user_id = blocker_id 
      AND blocked_user_id = blocked_id
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to check if current user has accepted latest ToS
CREATE OR REPLACE FUNCTION has_accepted_latest_tos(user_id UUID, tos_version TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.terms_of_service_acceptances 
    WHERE user_id = has_accepted_latest_tos.user_id 
      AND version = tos_version
  );
$$ LANGUAGE sql SECURITY DEFINER;

