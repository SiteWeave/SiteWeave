-- ============================================================================
-- Seed Tester Account with Lots of Fake Data
-- ============================================================================
-- Creates a full tester org, links an existing Auth user, and generates:
--   Organizations, roles, profiles, contacts (50), projects (12), project_contacts,
--   project_phases, tasks (with Gantt fields + some dependencies), project_issues,
--   issue_steps, issue_comments, message_channels, messages, calendar_events,
--   files, activity_log.
--
-- BEFORE RUNNING:
--   1. In Supabase Dashboard → Authentication → Users, create a user:
--      Email: tester@siteweave.app   (or change v_tester_email below)
--      Password: e.g. Tester123!
--   2. Run this script in Supabase SQL Editor (as a user with permission to
--      insert into public tables; RLS may apply).
--
-- WARNING: This script moves the tester user's profile into "Tester Organization".
-- Do NOT point v_tester_email at the QA Business Org A admin if you still need
-- that org for meeting demos. For the golden-project feature demo, use:
--   scripts/qa-seed-personas.sql → scripts/qa-seed-feature-demo.sql
-- instead of this script.

DO $$
DECLARE
    v_tester_email TEXT := 'tester@siteweave.app';
    v_tester_user_id UUID;
    v_tester_name TEXT := 'Tester User';
    v_org_id UUID;
    v_role_id UUID;
    v_contact_id UUID;
    v_contact_ids UUID[] := ARRAY[]::UUID[];
    v_project_ids UUID[] := ARRAY[]::UUID[];
    v_task_ids UUID[] := ARRAY[]::UUID[];
    v_channel_ids UUID[] := ARRAY[]::UUID[];
    v_issue_ids INTEGER[] := ARRAY[]::INTEGER[];
    v_first_names TEXT[] := ARRAY[
        'James','Michael','Robert','John','David','William','Richard','Joseph','Thomas','Christopher',
        'Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua','Kenneth'
    ];
    v_last_names TEXT[] := ARRAY[
        'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
        'Hernandez','Lopez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee'
    ];
    v_companies TEXT[] := ARRAY[
        'Apex Construction','BuildRight Contractors','Coastal Builders','Diamond Construction','Elite Builders',
        'Foundation First','Golden Hammer','Heritage Builders','Iron Works','Junction Builders'
    ];
    v_trades TEXT[] := ARRAY[
        'General Contractor','Electrician','Plumber','Carpenter','HVAC','Roofer','Concrete','Mason','Drywall','Painter'
    ];
    v_project_names TEXT[] := ARRAY[
        'Downtown Office Complex','Riverside Residential','Highway Bridge Renovation','Shopping Mall Expansion',
        'Industrial Warehouse','Luxury Condo Tower','Hospital Wing','School Renovation','Parking Garage',
        'Retail Strip Center','Apartment Phase 2','Mixed-Use Development'
    ];
    v_addresses TEXT[] := ARRAY[
        '123 Main St','456 Oak Ave','789 Elm Blvd','321 Pine Rd','654 Maple Dr','987 Cedar Ln'
    ];
    v_phase_names TEXT[] := ARRAY['Site Prep','Foundation','Framing','Rough-In','Exterior','Interior','MEP','Closeout'];
    v_task_texts TEXT[] := ARRAY[
        'Review drawings','Site inspection','Order materials','Coordinate subs','Update timeline','Permit application',
        'Safety meeting','Budget review','Progress report','Equipment delivery','Quality checklist','Final inspection'
    ];
    v_i INT; v_j INT; v_k INT;
    v_cid UUID; v_pid UUID; v_tid UUID; v_chid UUID; v_issue_id INT;
    v_fn TEXT; v_ln TEXT; v_company TEXT; v_trade TEXT; v_email TEXT; v_phone TEXT;
    v_pname TEXT; v_addr TEXT; v_status TEXT; v_ptype TEXT; v_due DATE; v_start DATE;
    v_phase TEXT; v_progress INT; v_budget NUMERIC; v_order INT;
    v_task_text TEXT; v_priority TEXT; v_dur INT; v_milestone BOOLEAN; v_completed BOOLEAN; v_assignee UUID;
    v_issue_title TEXT; v_issue_desc TEXT; v_issue_pri TEXT; v_issue_status TEXT; v_step_desc TEXT; v_step_name TEXT; v_step_role TEXT;
    v_comment TEXT; v_channel_name TEXT; v_msg_topic TEXT; v_msg_content TEXT;
    v_ev_title TEXT; v_ev_desc TEXT; v_loc TEXT; v_cat TEXT; v_ev_start TIMESTAMPTZ; v_ev_end TIMESTAMPTZ;
    v_fname TEXT; v_ftype TEXT; v_furl TEXT; v_fsize INT;
    v_act_action TEXT; v_act_entity TEXT; v_act_name TEXT;
BEGIN
    -- Resolve tester user (must exist in auth.users)
    SELECT id INTO v_tester_user_id FROM auth.users WHERE email = v_tester_email LIMIT 1;
    IF v_tester_user_id IS NULL THEN
        RAISE EXCEPTION 'Tester user not found. Create a user in Supabase Auth first with email: % (e.g. password Tester123!)', v_tester_email;
    END IF;

    -- Organization
    INSERT INTO organizations (name, slug, created_by_user_id, updated_at)
    VALUES ('Tester Organization', 'tester', v_tester_user_id, now())
    ON CONFLICT (slug) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_org_id;
    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM organizations WHERE slug = 'tester';
    END IF;

    -- Role (canonical org admin)
    UPDATE roles
    SET name = 'Org Admin',
        permissions = '{"can_manage_team":true,"can_manage_users":true,"can_manage_roles":true,"can_create_projects":true,"can_edit_projects":true,"can_delete_projects":true,"can_assign_tasks":true,"can_manage_contacts":true,"can_create_tasks":true,"can_edit_tasks":true,"can_delete_tasks":true,"can_send_messages":true,"can_manage_progress_reports":true,"can_manage_org_progress_reports":true}'::jsonb,
        updated_at = now()
    WHERE organization_id = v_org_id AND name = 'OrganizationAdmin';

    INSERT INTO roles (organization_id, name, permissions, is_system_role, updated_at)
    VALUES (v_org_id, 'Org Admin', '{"can_manage_team":true,"can_manage_users":true,"can_manage_roles":true,"can_create_projects":true,"can_edit_projects":true,"can_delete_projects":true,"can_assign_tasks":true,"can_manage_contacts":true,"can_create_tasks":true,"can_edit_tasks":true,"can_delete_tasks":true,"can_send_messages":true,"can_manage_progress_reports":true,"can_manage_org_progress_reports":true}'::jsonb, true, now())
    ON CONFLICT (organization_id, name) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = now()
    RETURNING id INTO v_role_id;
    IF v_role_id IS NULL THEN
        SELECT id INTO v_role_id FROM roles WHERE organization_id = v_org_id AND name = 'Org Admin';
    END IF;

    -- Contact for tester (idempotent: reuse if exists)
    IF NOT EXISTS (SELECT 1 FROM contacts WHERE email = v_tester_email AND organization_id = v_org_id) THEN
        INSERT INTO contacts (name, type, email, organization_id)
        VALUES (v_tester_name, 'Team', v_tester_email, v_org_id);
    END IF;
    SELECT id INTO v_contact_id FROM contacts WHERE email = v_tester_email AND organization_id = v_org_id LIMIT 1;

    -- Profile
    INSERT INTO profiles (id, role_id, contact_id, organization_id, role)
    VALUES (v_tester_user_id, v_role_id, v_contact_id, v_org_id, 'Admin')
    ON CONFLICT (id) DO UPDATE SET role_id = v_role_id, contact_id = v_contact_id, organization_id = v_org_id, role = 'Admin';

    RAISE NOTICE 'Tester org and profile ready. Org: %, User: %', v_org_id, v_tester_user_id;

    -- ========== CONTACTS (50) ==========
    FOR v_i IN 1..50 LOOP
        v_fn := v_first_names[1 + floor(random() * array_length(v_first_names,1))::int];
        v_ln := v_last_names[1 + floor(random() * array_length(v_last_names,1))::int];
        v_company := v_companies[1 + floor(random() * array_length(v_companies,1))::int];
        v_trade := v_trades[1 + floor(random() * array_length(v_trades,1))::int];
        v_email := lower(v_fn || '.' || v_ln || v_i::text) || '@' || lower(replace(v_company,' ','')) || '.com';
        v_phone := format('(%s) %s-%s', 200+floor(random()*800)::int, 200+floor(random()*800)::int, lpad(floor(random()*10000)::text,4,'0'));
        INSERT INTO contacts (name, role, type, company, trade, status, email, phone, organization_id, created_by_user_id)
        VALUES (v_fn || ' ' || v_ln, 'Technician', CASE WHEN random()>0.3 THEN 'Subcontractor' ELSE 'Team' END, v_company, v_trade, 'Available', v_email, v_phone, v_org_id, v_tester_user_id)
        RETURNING id INTO v_cid;
        v_contact_ids := array_append(v_contact_ids, v_cid);
    END LOOP;
    RAISE NOTICE 'Contacts: %', array_length(v_contact_ids,1);

    -- ========== PROJECTS (12) ==========
    FOR v_i IN 1..12 LOOP
        v_pname := v_project_names[v_i];
        v_addr := v_addresses[1 + (v_i % array_length(v_addresses,1))];
        v_status := (ARRAY['Planning','In Progress','On Hold','Completed'])[1 + floor(random()*4)::int];
        v_ptype := (ARRAY['Residential','Commercial','Industrial'])[1 + floor(random()*3)::int];
        v_due := current_date + (floor(random()*365)::int || ' days')::interval;
        INSERT INTO projects (name, address, status, status_color, project_type, due_date, next_milestone, color, organization_id, created_by_user_id, created_at)
        VALUES (v_pname, v_addr, v_status, CASE v_status WHEN 'Planning' THEN '#3B82F6' WHEN 'In Progress' THEN '#10B981' WHEN 'On Hold' THEN '#F59E0B' ELSE '#6B7280' END, v_ptype, v_due, v_phase_names[1], '#3B82F6', v_org_id, v_tester_user_id, now() - (floor(random()*90)::int || ' days')::interval)
        RETURNING id INTO v_pid;
        v_project_ids := array_append(v_project_ids, v_pid);
    END LOOP;
    RAISE NOTICE 'Projects: %', array_length(v_project_ids,1);

    -- ========== PROJECT_CONTACTS ==========
    FOR v_i IN 1..array_length(v_project_ids,1) LOOP
        v_pid := v_project_ids[v_i];
        FOR v_j IN 1..(3 + floor(random()*6)::int) LOOP
            v_cid := v_contact_ids[1 + floor(random()*array_length(v_contact_ids,1))::int];
            INSERT INTO project_contacts (project_id, contact_id, organization_id) VALUES (v_pid, v_cid, v_org_id) ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;

    -- ========== PROJECT_PHASES ==========
    FOR v_i IN 1..array_length(v_project_ids,1) LOOP
        v_pid := v_project_ids[v_i];
        v_order := 0;
        FOR v_j IN 1..(4 + floor(random()*4)::int) LOOP
            v_order := v_order + 1;
            v_phase := v_phase_names[1 + floor(random()*array_length(v_phase_names,1))::int];
            v_progress := floor(random()*101)::int;
            v_budget := (10000 + floor(random()*200000))::numeric;
            INSERT INTO project_phases (project_id, organization_id, name, progress, budget, "order")
            VALUES (v_pid, v_org_id, v_phase, v_progress, v_budget, v_order);
        END LOOP;
    END LOOP;

    -- ========== TASKS (with start_date, due_date, duration_days, is_milestone for Gantt) ==========
    FOR v_i IN 1..array_length(v_project_ids,1) LOOP
        v_pid := v_project_ids[v_i];
        v_start := current_date + (floor(random()*60)::int || ' days')::interval;
        FOR v_j IN 1..(6 + floor(random()*8)::int) LOOP
            v_task_text := v_task_texts[1 + floor(random()*array_length(v_task_texts,1))::int];
            v_priority := (ARRAY['Low','Medium','High'])[1 + floor(random()*3)::int];
            v_dur := 1 + floor(random()*14)::int;
            v_due := v_start::date + v_dur;
            v_milestone := (v_j = 1 AND random() > 0.6);
            v_completed := random() > 0.6;
            IF array_length(v_contact_ids,1) > 0 THEN
                v_assignee := v_contact_ids[1 + floor(random()*array_length(v_contact_ids,1))::int];
            ELSE
                v_assignee := NULL;
            END IF;
            IF v_milestone THEN
                INSERT INTO tasks (project_id, organization_id, text, start_date, due_date, duration_days, is_milestone, priority, completed, assignee_id)
                VALUES (v_pid, v_org_id, v_task_text, v_start::date, v_start::date + 1, 0, true, v_priority, v_completed, v_assignee)
                RETURNING id INTO v_tid;
            ELSE
                INSERT INTO tasks (project_id, organization_id, text, start_date, due_date, duration_days, is_milestone, priority, completed, assignee_id)
                VALUES (v_pid, v_org_id, v_task_text, v_start::date, v_due, v_dur, false, v_priority, v_completed, v_assignee)
                RETURNING id INTO v_tid;
            END IF;
            v_task_ids := array_append(v_task_ids, v_tid);
            v_start := v_due + (floor(random()*3)::int || ' days')::interval;
        END LOOP;
    END LOOP;
    RAISE NOTICE 'Tasks: %', array_length(v_task_ids,1);

    -- ========== TASK_DEPENDENCIES (subset of tasks) ==========
    FOR v_i IN 1..LEAST(array_length(v_task_ids,1)/2, 40) LOOP
        v_j := 1 + floor(random()*array_length(v_task_ids,1))::int;
        v_k := 1 + floor(random()*array_length(v_task_ids,1))::int;
        IF v_j <> v_k THEN
            INSERT INTO task_dependencies (task_id, successor_task_id)
            VALUES (v_task_ids[v_j], v_task_ids[v_k])
            ON CONFLICT (task_id, successor_task_id) DO NOTHING;
        END IF;
    END LOOP;

    -- ========== PROJECT_ISSUES + ISSUE_STEPS + ISSUE_COMMENTS ==========
    FOR v_i IN 1..array_length(v_project_ids,1) LOOP
        v_pid := v_project_ids[v_i];
        FOR v_j IN 1..(2 + floor(random()*4)::int) LOOP
            v_issue_title := (ARRAY['Foundation crack','Material delay','Code violation','Safety hazard','Quality issue','Permit delay'])[1 + floor(random()*6)::int];
            v_issue_desc := 'Description: ' || v_issue_title;
            v_issue_pri := (ARRAY['Low','Medium','High','Critical'])[1 + floor(random()*4)::int];
            v_issue_status := (ARRAY['open','in_progress','resolved','closed'])[1 + floor(random()*4)::int];
            INSERT INTO project_issues (project_id, organization_id, title, description, status, priority, due_date, created_by_user_id)
            VALUES (v_pid, v_org_id, v_issue_title, v_issue_desc, v_issue_status, v_issue_pri, current_date + 30, v_tester_user_id)
            RETURNING id INTO v_issue_id;
            v_issue_ids := array_append(v_issue_ids, v_issue_id);
            FOR v_k IN 1..(2 + floor(random()*2)::int) LOOP
                v_step_desc := (ARRAY['Investigate','Notify parties','Implement fix','Verify'])[1 + floor(random()*4)::int];
                v_step_name := v_tester_name;
                v_step_role := 'Admin';
                IF array_length(v_contact_ids,1) > 0 THEN
                    v_cid := v_contact_ids[1 + floor(random()*array_length(v_contact_ids,1))::int];
                    SELECT name, role INTO v_step_name, v_step_role FROM contacts WHERE id = v_cid;
                END IF;
                INSERT INTO issue_steps (issue_id, organization_id, step_order, description, assigned_to_name, assigned_to_role, status)
                VALUES (v_issue_id, v_org_id, v_k, v_step_desc, v_step_name, v_step_role, (ARRAY['pending','in_progress','completed'])[1 + floor(random()*3)::int]);
                IF random() > 0.5 THEN
                    v_comment := (ARRAY['Working on it','Done','Need info'])[1 + floor(random()*3)::int];
                    INSERT INTO issue_comments (issue_id, organization_id, user_id, user_name, comment)
                    VALUES (v_issue_id, v_org_id, v_tester_user_id, v_tester_name, v_comment);
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
    RAISE NOTICE 'Issues: %', array_length(v_issue_ids,1);

    -- ========== MESSAGE_CHANNELS + MESSAGES ==========
    FOR v_i IN 1..array_length(v_project_ids,1) LOOP
        v_pid := v_project_ids[v_i];
        FOR v_j IN 1..(1 + floor(random()*2)::int) LOOP
            v_channel_name := (ARRAY['General','Updates','Daily Log'])[1 + floor(random()*3)::int];
            INSERT INTO message_channels (project_id, organization_id, name)
            VALUES (v_pid, v_org_id, v_channel_name)
            RETURNING id INTO v_chid;
            v_channel_ids := array_append(v_channel_ids, v_chid);
            FOR v_k IN 1..(3 + floor(random()*8)::int) LOOP
                v_msg_topic := (ARRAY['Site update','Schedule','Safety','Progress'])[1 + floor(random()*4)::int];
                v_msg_content := 'Message: ' || v_msg_topic || ' for project.';
                INSERT INTO messages (channel_id, organization_id, user_id, topic, extension, content, type)
                VALUES (v_chid, v_org_id, v_tester_user_id, v_msg_topic, 'txt', v_msg_content, 'text');
            END LOOP;
        END LOOP;
    END LOOP;

    -- ========== CALENDAR_EVENTS ==========
    FOR v_i IN 1..array_length(v_project_ids,1) LOOP
        v_pid := v_project_ids[v_i];
        FOR v_j IN 1..(2 + floor(random()*4)::int) LOOP
            v_ev_title := (ARRAY['Site Inspection','Team Meeting','Delivery','Review'])[1 + floor(random()*4)::int];
            v_ev_desc := 'Event: ' || v_ev_title;
            v_loc := v_addresses[1 + floor(random()*array_length(v_addresses,1))::int];
            v_cat := (ARRAY['meeting','work','other'])[1 + floor(random()*3)::int];
            v_ev_start := now() + (floor(random()*60)::int || ' days')::interval;
            v_ev_end := v_ev_start + interval '2 hours';
            INSERT INTO calendar_events (project_id, organization_id, title, start_time, end_time, description, location, category, user_id)
            VALUES (v_pid, v_org_id, v_ev_title, v_ev_start, v_ev_end, v_ev_desc, v_loc, v_cat, v_tester_user_id);
        END LOOP;
    END LOOP;

    -- ========== FILES ==========
    FOR v_i IN 1..array_length(v_project_ids,1) LOOP
        v_pid := v_project_ids[v_i];
        FOR v_j IN 1..(2 + floor(random()*5)::int) LOOP
            v_fname := (ARRAY['Site Plan','Drawings','Report','Invoice'])[1 + floor(random()*4)::int] || '.' || (ARRAY['pdf','docx','xlsx'])[1 + floor(random()*3)::int];
            v_ftype := split_part(v_fname,'.',2);
            v_furl := 'https://example.com/files/' || gen_random_uuid()::text;
            v_fsize := 100 + floor(random()*5000)::int;
            INSERT INTO files (project_id, organization_id, name, type, file_url, size_kb)
            VALUES (v_pid, v_org_id, v_fname, v_ftype, v_furl, v_fsize);
        END LOOP;
    END LOOP;

    -- ========== ACTIVITY_LOG ==========
    FOR v_i IN 1..80 LOOP
        v_pid := v_project_ids[1 + floor(random()*array_length(v_project_ids,1))::int];
        v_act_action := (ARRAY['created','updated','completed','assigned'])[1 + floor(random()*4)::int];
        v_act_entity := (ARRAY['project','task','file','issue'])[1 + floor(random()*4)::int];
        v_act_name := 'Sample ' || v_act_entity;
        INSERT INTO activity_log (user_id, organization_id, user_name, action, entity_type, entity_name, project_id)
        VALUES (v_tester_user_id, v_org_id, v_tester_name, v_act_action, v_act_entity, v_act_name, v_pid);
    END LOOP;

    RAISE NOTICE 'Done. Tester: % | Org: % | Contacts: % | Projects: % | Tasks: %', v_tester_email, v_org_id, array_length(v_contact_ids,1), array_length(v_project_ids,1), array_length(v_task_ids,1);
END $$;
