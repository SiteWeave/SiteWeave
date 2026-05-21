-- ============================================================================
-- SCHEMA VALIDATION SCRIPT
-- Run this after deploying schema.sql to verify everything is set up correctly
-- ============================================================================

-- Check that all required tables exist
DO $$
DECLARE
    missing_tables TEXT[] := ARRAY[]::TEXT[];
    required_tables TEXT[] := ARRAY[
        'organizations',
        'roles',
        'profiles',
        'project_collaborators',
        'project_access_invites',
        'projects',
        'contacts',
        'tasks',
        'task_comments',
        'project_stream_posts',
        'project_stream_replies',
        'files',
        'invitations',
        'progress_report_schedules',
        'content_reports'
    ];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = tbl
        ) THEN
            missing_tables := array_append(missing_tables, tbl);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Missing tables: %', array_to_string(missing_tables, ', ');
    ELSE
        RAISE NOTICE '✓ All required tables exist';
    END IF;
END $$;

-- Check that organization_id columns exist on all data tables
DO $$
DECLARE
    missing_org_id TEXT[] := ARRAY[]::TEXT[];
    data_tables TEXT[] := ARRAY[
        'projects',
        'contacts',
        'calendar_events',
        'event_categories',
        'files',
        'issue_comments',
        'issue_files',
        'issue_steps',
        'message_channels',
        'messages',
        'project_contacts',
        'project_issues',
        'project_phases',
        'tasks',
        'activity_log',
        'invitations',
        'project_access_invites',
        'project_stream_posts',
        'project_stream_replies',
        'task_comments',
        'progress_report_schedules',
        'progress_report_history'
    ];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY data_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = tbl
            AND column_name = 'organization_id'
        ) THEN
            missing_org_id := array_append(missing_org_id, tbl);
        END IF;
    END LOOP;
    
    IF array_length(missing_org_id, 1) > 0 THEN
        RAISE WARNING 'Tables missing organization_id: %', array_to_string(missing_org_id, ', ');
    ELSE
        RAISE NOTICE '✓ All data tables have organization_id';
    END IF;
END $$;

-- Check that RLS is enabled on all tables
DO $$
DECLARE
    rls_disabled TEXT[] := ARRAY[]::TEXT[];
    all_tables TEXT[] := ARRAY[
        'organizations',
        'roles',
        'profiles',
        'project_collaborators',
        'projects',
        'contacts',
        'calendar_events',
        'event_categories',
        'files',
        'issue_comments',
        'issue_files',
        'issue_steps',
        'message_channels',
        'messages',
        'project_contacts',
        'project_issues',
        'project_phases',
        'tasks',
        'activity_log',
        'invitations',
        'project_access_invites',
        'project_stream_posts',
        'project_stream_replies',
        'task_comments',
        'schedule_import_templates',
        'progress_report_schedules',
        'progress_report_recipients',
        'progress_report_history',
        'organization_branding',
        'content_reports',
        'blocked_users',
        'terms_of_service_acceptances',
        'sms_phone_consent',
        'task_notification_guest_shares',
        'user_notifications',
        'notification_action_history'
    ];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY all_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'public'
            AND tablename = tbl
            AND rowsecurity = true
        ) THEN
            rls_disabled := array_append(rls_disabled, tbl);
        END IF;
    END LOOP;
    
    IF array_length(rls_disabled, 1) > 0 THEN
        RAISE WARNING 'Tables with RLS disabled: %', array_to_string(rls_disabled, ', ');
    ELSE
        RAISE NOTICE '✓ RLS enabled on all tables';
    END IF;
END $$;

-- Check that helper functions exist
DO $$
DECLARE
    missing_functions TEXT[] := ARRAY[]::TEXT[];
    required_functions TEXT[] := ARRAY[
        'get_user_organization_id',
        'is_organization_admin',
        'is_project_collaborator',
        'has_project_access',
        'handle_new_user'
    ];
    optional_functions TEXT[] := ARRAY[
        'has_storage_file_access'  -- Only needed if using storage buckets
    ];
    func TEXT;
BEGIN
    FOREACH func IN ARRAY required_functions
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_proc
            WHERE proname = func
        ) THEN
            missing_functions := array_append(missing_functions, func);
        END IF;
    END LOOP;
    
    IF array_length(missing_functions, 1) > 0 THEN
        RAISE EXCEPTION 'Missing required functions: %', array_to_string(missing_functions, ', ');
    ELSE
        RAISE NOTICE '✓ All required helper functions exist';
    END IF;
    
    -- Check optional functions
    FOREACH func IN ARRAY optional_functions
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_proc
            WHERE proname = func
        ) THEN
            RAISE NOTICE '✓ Optional function % exists', func;
        ELSE
            RAISE NOTICE '⚠ Optional function % not found (run setup-storage-policies.sql if using storage)', func;
        END IF;
    END LOOP;
END $$;

-- Check that profiles table has correct structure
DO $$
BEGIN
    -- Check role_id column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles'
        AND column_name = 'role_id'
    ) THEN
        RAISE EXCEPTION 'profiles table missing role_id column';
    END IF;
    
    -- Check organization_id column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles'
        AND column_name = 'organization_id'
    ) THEN
        RAISE EXCEPTION 'profiles table missing organization_id column';
    END IF;
    
    -- Check is_super_admin column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles'
        AND column_name = 'is_super_admin'
    ) THEN
        RAISE EXCEPTION 'profiles table missing is_super_admin column';
    END IF;
    
    RAISE NOTICE '✓ profiles table structure is correct';
END $$;

-- Check that roles table has permissions JSONB column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'roles'
        AND column_name = 'permissions'
        AND data_type = 'jsonb'
    ) THEN
        RAISE EXCEPTION 'roles table missing permissions JSONB column';
    END IF;
    
    RAISE NOTICE '✓ roles table has permissions JSONB column';
END $$;

-- Check that project_collaborators table exists with correct structure
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'project_collaborators'
        AND column_name = 'access_level'
    ) THEN
        RAISE EXCEPTION 'project_collaborators table missing access_level column';
    END IF;
    
    RAISE NOTICE '✓ project_collaborators table structure is correct';
END $$;

-- Check foreign key constraints
DO $$
DECLARE
    constraint_count INTEGER;
BEGIN
    -- Count foreign key constraints on profiles table
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints
    WHERE table_name = 'profiles'
    AND constraint_type = 'FOREIGN KEY';
    
    IF constraint_count < 3 THEN
        RAISE WARNING 'profiles table has fewer foreign keys than expected (found %, expected at least 3)', constraint_count;
    ELSE
        RAISE NOTICE '✓ profiles table has correct foreign keys';
    END IF;
END $$;

-- Check indexes exist
DO $$
DECLARE
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE '%organization_id%';
    
    IF index_count < 5 THEN
        RAISE WARNING 'Fewer organization_id indexes than expected (found %, expected at least 5)', index_count;
    ELSE
        RAISE NOTICE '✓ organization_id indexes exist';
    END IF;
END $$;

-- Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SCHEMA VALIDATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'If you see any EXCEPTION or WARNING messages above, please review and fix them.';
    RAISE NOTICE 'Otherwise, your multi-tenant schema is ready to use!';
END $$;

