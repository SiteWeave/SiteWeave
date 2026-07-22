-- ============================================================================
-- QA: Feature demo seed (golden project — pull-forward, weather, progress reports)
-- ============================================================================
-- Staging / non-prod only. PREREQ: scripts/qa-seed-personas.sql
--
-- Makes QA Golden Project demo-ready for a meeting:
--   1) Bulk phases + dated tasks (recent completions for progress reports)
--   2) Pull-forward: FS task chain + pending schedule_adjustments banner
--   3) Weather delay: pending weather_impacts + incomplete dated work
--   4) Progress report: manual schedule + recipient (Send Now / preview)
--
-- HOW TO USE (Supabase SQL Editor as privileged role):
--   1. Edit CONFIG (match v_admin_email / org slug / project name to personas).
--   2. Run once (idempotent for demo-labeled rows).
--   3. Log in as admin → open QA Golden Project → banners + Progress Reports.
--
-- Shared password for QA personas (from qa-seed-personas): QaTest123!
-- ============================================================================

DO $$
DECLARE
  -- ===================== CONFIG (edit these) =====================
  v_admin_email         TEXT := 'podotim245@luckfeed.com';
  v_org_slug            TEXT := 'qa-business-a';
  v_golden_project_name TEXT := 'QA Golden Project';
  v_schedule_name       TEXT := 'QA Meeting Demo Report';
  -- ===============================================================

  v_admin_id UUID;
  v_org_id UUID;
  v_project_id UUID;
  v_pm_contact UUID;
  v_member_contact UUID;

  v_phase_site UUID;
  v_phase_frame UUID;
  v_phase_rough UUID;
  v_phase_finish UUID;

  v_source_id UUID;
  v_succ_id UUID;
  v_succ2_id UUID;
  v_weather_task_ids UUID[] := ARRAY[]::UUID[];
  v_tid UUID;
  v_schedule_id UUID;

  v_i INT;
  v_task_labels TEXT[] := ARRAY[
    'Demo: Excavation complete',
    'Demo: Footings poured',
    'Demo: Rebar inspection passed',
    'Demo: Slab poured',
    'Demo: Rough plumbing set',
    'Demo: Temporary power live'
  ];
  v_open_labels TEXT[] := ARRAY[
    'Demo: Exterior sheathing',
    'Demo: Roof dry-in',
    'Demo: Window install',
    'Demo: HVAC rough-in',
    'Demo: Electrical rough-in',
    'Demo: Insulation',
    'Demo: Drywall hang',
    'Demo: Paint prep'
  ];
BEGIN
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE lower(email) = lower(v_admin_email)
  LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin Auth user not found: %. Run qa-seed-personas.sql first.', v_admin_email;
  END IF;

  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE slug = v_org_slug
  LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Org slug % not found. Run qa-seed-personas.sql first.', v_org_slug;
  END IF;

  SELECT id INTO v_project_id
  FROM public.projects
  WHERE organization_id = v_org_id
    AND name = v_golden_project_name
    AND trashed_at IS NULL
  LIMIT 1;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Golden project % not found in org %.', v_golden_project_name, v_org_slug;
  END IF;

  SELECT id INTO v_pm_contact
  FROM public.contacts
  WHERE organization_id = v_org_id AND lower(email) = 'qa-pm@siteweave.test'
  LIMIT 1;

  SELECT id INTO v_member_contact
  FROM public.contacts
  WHERE organization_id = v_org_id AND lower(email) = 'qa-member@siteweave.test'
  LIMIT 1;

  -- Project look: far enough due date for pull-forward / weather shifts
  UPDATE public.projects
  SET
    status = 'In Progress',
    status_color = COALESCE(status_color, '#10B981'),
    start_date = COALESCE(start_date, current_date - 21),
    due_date = GREATEST(COALESCE(due_date, current_date), current_date + 45),
    client_due_date = COALESCE(client_due_date, current_date + 45)
  WHERE id = v_project_id;

  -- =========================================================================
  -- BULK: phases + lived-in schedule (progress report lookback content)
  -- =========================================================================
  IF NOT EXISTS (
    SELECT 1 FROM public.project_phases
    WHERE project_id = v_project_id AND name = 'Demo: Site Prep'
  ) THEN
    INSERT INTO public.project_phases (
      project_id, organization_id, name, progress, budget, "order", start_date, end_date
    ) VALUES
      (v_project_id, v_org_id, 'Demo: Site Prep', 100, 45000, 1, current_date - 21, current_date - 14),
      (v_project_id, v_org_id, 'Demo: Framing', 70, 120000, 2, current_date - 13, current_date + 7),
      (v_project_id, v_org_id, 'Demo: Rough-In', 25, 85000, 3, current_date + 1, current_date + 21),
      (v_project_id, v_org_id, 'Demo: Finishes', 0, 95000, 4, current_date + 22, current_date + 45);
  END IF;

  SELECT id INTO v_phase_site FROM public.project_phases
  WHERE project_id = v_project_id AND name = 'Demo: Site Prep' LIMIT 1;
  SELECT id INTO v_phase_frame FROM public.project_phases
  WHERE project_id = v_project_id AND name = 'Demo: Framing' LIMIT 1;
  SELECT id INTO v_phase_rough FROM public.project_phases
  WHERE project_id = v_project_id AND name = 'Demo: Rough-In' LIMIT 1;
  SELECT id INTO v_phase_finish FROM public.project_phases
  WHERE project_id = v_project_id AND name = 'Demo: Finishes' LIMIT 1;

  -- Recently completed tasks (show in progress report "last week")
  FOR v_i IN 1..array_length(v_task_labels, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.tasks
      WHERE project_id = v_project_id AND text = v_task_labels[v_i]
    ) THEN
      INSERT INTO public.tasks (
        project_id, organization_id, text, completed, percent_complete, completed_at,
        assignee_id, start_date, due_date, duration_days, priority
      ) VALUES (
        v_project_id, v_org_id, v_task_labels[v_i], true, 100,
        (current_date - (8 - v_i))::timestamptz + interval '15 hours',
        CASE WHEN v_i % 2 = 0 THEN v_pm_contact ELSE v_member_contact END,
        current_date - (14 - v_i),
        current_date - (8 - v_i),
        GREATEST(1, 6 - v_i),
        CASE WHEN v_i <= 2 THEN 'High' ELSE 'Medium' END
      );
    END IF;
  END LOOP;

  -- Open dated tasks for weather shift + Gantt density
  FOR v_i IN 1..array_length(v_open_labels, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.tasks
      WHERE project_id = v_project_id AND text = v_open_labels[v_i]
    ) THEN
      INSERT INTO public.tasks (
        project_id, organization_id, text, completed, percent_complete,
        assignee_id, start_date, due_date, duration_days, priority
      ) VALUES (
        v_project_id, v_org_id, v_open_labels[v_i], false, 0,
        CASE WHEN v_i % 2 = 0 THEN v_pm_contact ELSE v_member_contact END,
        current_date + ((v_i - 1) * 2),
        current_date + ((v_i - 1) * 2) + 4,
        5,
        CASE WHEN v_i <= 3 THEN 'High' ELSE 'Medium' END
      )
      RETURNING id INTO v_tid;
      v_weather_task_ids := array_append(v_weather_task_ids, v_tid);
    ELSE
      SELECT id INTO v_tid FROM public.tasks
      WHERE project_id = v_project_id AND text = v_open_labels[v_i] LIMIT 1;
      v_weather_task_ids := array_append(v_weather_task_ids, v_tid);
    END IF;
  END LOOP;

  -- Activity so the project feels lived-in
  IF NOT EXISTS (
    SELECT 1 FROM public.activity_log
    WHERE project_id = v_project_id AND entity_name = 'Demo: Feature seed activity'
  ) THEN
    INSERT INTO public.activity_log (
      user_id, organization_id, user_name, action, entity_type, entity_name, project_id, details
    ) VALUES
      (v_admin_id, v_org_id, 'QA Admin', 'updated', 'project', 'Demo: Feature seed activity', v_project_id,
       '{"note":"Meeting demo seed applied"}'::jsonb),
      (v_admin_id, v_org_id, 'QA Admin', 'completed', 'task', 'Demo: Slab poured', v_project_id,
       '{"source":"qa-seed-feature-demo"}'::jsonb),
      (v_admin_id, v_org_id, 'QA Admin', 'created', 'task', 'Demo: Roof dry-in', v_project_id,
       '{"source":"qa-seed-feature-demo"}'::jsonb);
  END IF;

  RAISE NOTICE 'BULK: phases + completed/open tasks ready on project %', v_project_id;

  -- =========================================================================
  -- PULL-FORWARD: early completion + FS successors + pending adjustment
  -- =========================================================================
  SELECT id INTO v_source_id FROM public.tasks
  WHERE project_id = v_project_id AND text = 'Demo: Framing (early finish)' LIMIT 1;
  IF v_source_id IS NULL THEN
    INSERT INTO public.tasks (
      project_id, organization_id, text, completed, percent_complete, completed_at,
      assignee_id, start_date, due_date, duration_days, priority
    ) VALUES (
      v_project_id, v_org_id, 'Demo: Framing (early finish)', true, 100, now(),
      v_pm_contact, current_date - 10, current_date + 5, 16, 'High'
    )
    RETURNING id INTO v_source_id;
  ELSE
    UPDATE public.tasks
    SET completed = true,
        percent_complete = 100,
        completed_at = COALESCE(completed_at, now()),
        due_date = current_date + 5,
        start_date = current_date - 10,
        duration_days = 16
    WHERE id = v_source_id;
  END IF;

  SELECT id INTO v_succ_id FROM public.tasks
  WHERE project_id = v_project_id AND text = 'Demo: Roofing (successor)' LIMIT 1;
  IF v_succ_id IS NULL THEN
    INSERT INTO public.tasks (
      project_id, organization_id, text, completed, percent_complete,
      assignee_id, start_date, due_date, duration_days, priority
    ) VALUES (
      v_project_id, v_org_id, 'Demo: Roofing (successor)', false, 0,
      v_pm_contact, current_date + 6, current_date + 20, 15, 'High'
    )
    RETURNING id INTO v_succ_id;
  ELSE
    UPDATE public.tasks
    SET completed = false,
        percent_complete = 0,
        completed_at = NULL,
        start_date = current_date + 6,
        due_date = current_date + 20,
        duration_days = 15
    WHERE id = v_succ_id;
  END IF;

  SELECT id INTO v_succ2_id FROM public.tasks
  WHERE project_id = v_project_id AND text = 'Demo: Exterior (FS chain)' LIMIT 1;
  IF v_succ2_id IS NULL THEN
    INSERT INTO public.tasks (
      project_id, organization_id, text, completed, percent_complete,
      assignee_id, start_date, due_date, duration_days, priority
    ) VALUES (
      v_project_id, v_org_id, 'Demo: Exterior (FS chain)', false, 0,
      v_member_contact, current_date + 21, current_date + 35, 15, 'Medium'
    )
    RETURNING id INTO v_succ2_id;
  ELSE
    UPDATE public.tasks
    SET completed = false,
        percent_complete = 0,
        completed_at = NULL,
        start_date = current_date + 21,
        due_date = current_date + 35,
        duration_days = 15
    WHERE id = v_succ2_id;
  END IF;

  INSERT INTO public.task_dependencies (task_id, successor_task_id, dependency_type, lag_days)
  VALUES (v_source_id, v_succ_id, 'finish_to_start', 0)
  ON CONFLICT (task_id, successor_task_id) DO UPDATE
    SET dependency_type = 'finish_to_start', lag_days = 0;

  INSERT INTO public.task_dependencies (task_id, successor_task_id, dependency_type, lag_days)
  VALUES (v_succ_id, v_succ2_id, 'finish_to_start', 0)
  ON CONFLICT (task_id, successor_task_id) DO UPDATE
    SET dependency_type = 'finish_to_start', lag_days = 0;

  -- Replace any prior pending demo adjustment for this source task
  DELETE FROM public.schedule_adjustments
  WHERE project_id = v_project_id
    AND source_task_id = v_source_id
    AND status = 'pending';

  -- Keep the meeting banner focused on the demo chain (dismiss other pending)
  UPDATE public.schedule_adjustments
  SET status = 'dismissed', dismissed_at = now(), updated_at = now()
  WHERE project_id = v_project_id
    AND status = 'pending'
    AND (source_task_id IS DISTINCT FROM v_source_id);

  INSERT INTO public.schedule_adjustments (
    organization_id, project_id, source_task_id,
    adjustment_type, status,
    planned_finish, actual_finish, suggested_workdays,
    note, created_by_user_id
  ) VALUES (
    v_org_id, v_project_id, v_source_id,
    'early_completion', 'pending',
    current_date + 5, current_date, 5,
    'Early finish: Demo: Framing (early finish)', v_admin_id
  );

  RAISE NOTICE 'PULL-FORWARD: pending adjustment on source task %', v_source_id;

  -- =========================================================================
  -- WEATHER DELAY: pending impact (schedule_shift_applied = false)
  -- =========================================================================
  DELETE FROM public.weather_impacts
  WHERE project_id = v_project_id
    AND title = 'Demo: Heavy rain — site closed'
    AND schedule_shift_applied = false;

  INSERT INTO public.weather_impacts (
    organization_id, project_id, impact_type, title, description,
    start_date, end_date, days_lost,
    affected_task_ids, affected_phase_ids,
    apply_cascade, schedule_shift_applied, created_by_user_id
  ) VALUES (
    v_org_id, v_project_id, 'weather',
    'Demo: Heavy rain — site closed',
    'Site closed due to heavy rain. Apply schedule shift in the meeting demo.',
    current_date, current_date, 2,
    to_jsonb(COALESCE(v_weather_task_ids, ARRAY[]::UUID[])),
    jsonb_build_array(v_phase_rough, v_phase_finish),
    false, false, v_admin_id
  );

  RAISE NOTICE 'WEATHER: pending impact (2 days lost) ready';

  -- =========================================================================
  -- PROGRESS REPORT: manual schedule + recipient = admin inbox
  -- =========================================================================
  SELECT id INTO v_schedule_id
  FROM public.progress_report_schedules
  WHERE organization_id = v_org_id
    AND project_id = v_project_id
    AND name = v_schedule_name
  LIMIT 1;

  IF v_schedule_id IS NULL THEN
    INSERT INTO public.progress_report_schedules (
      organization_id, project_id, name,
      report_audience_type, template_type, frequency,
      requires_approval, approval_status, is_active,
      created_by_user_id, send_hour, send_timezone,
      report_sections, include_branding
    ) VALUES (
      v_org_id, v_project_id, v_schedule_name,
      'client', 'client_standard', 'manual',
      false, 'approved', true,
      v_admin_id, 8, 'America/Chicago',
      jsonb_build_object(
        'status_changes', true,
        'task_completion', true,
        'phase_changes', true,
        'executive_summary', false,
        'show_weather_impacts', true,
        'show_schedule_adjustments', true
      ),
      true
    )
    RETURNING id INTO v_schedule_id;
  ELSE
    UPDATE public.progress_report_schedules
    SET
      report_audience_type = 'client',
      template_type = 'client_standard',
      frequency = 'manual',
      requires_approval = false,
      approval_status = 'approved',
      is_active = true,
      report_sections = jsonb_build_object(
        'status_changes', true,
        'task_completion', true,
        'phase_changes', true,
        'executive_summary', false,
        'show_weather_impacts', true,
        'show_schedule_adjustments', true
      ),
      updated_at = now()
    WHERE id = v_schedule_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.progress_report_recipients
    WHERE schedule_id = v_schedule_id
      AND lower(email) = lower(v_admin_email)
      AND is_active = true
  ) THEN
    INSERT INTO public.progress_report_recipients (
      schedule_id, email, recipient_type, is_active
    ) VALUES (
      v_schedule_id, lower(v_admin_email), 'to', true
    );
  END IF;

  -- Branding so emails look intentional
  INSERT INTO public.organization_branding (
    organization_id, primary_color, secondary_color, company_footer, email_signature
  ) VALUES (
    v_org_id, '#0F766E', '#F59E0B',
    'QA Business Org A — meeting demo',
    'Sent from SiteWeave (QA demo)'
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET primary_color = EXCLUDED.primary_color,
        secondary_color = EXCLUDED.secondary_color,
        company_footer = COALESCE(public.organization_branding.company_footer, EXCLUDED.company_footer),
        email_signature = COALESCE(public.organization_branding.email_signature, EXCLUDED.email_signature),
        updated_at = now();

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Feature demo ready on % (%)', v_golden_project_name, v_project_id;
  RAISE NOTICE 'Org: % (%)', v_org_slug, v_org_id;
  RAISE NOTICE 'Login admin: %', v_admin_email;
  RAISE NOTICE 'Progress schedule: % (%) — Manual / Send Now', v_schedule_name, v_schedule_id;
  RAISE NOTICE 'Open project → weather banner + pull-forward banner + Progress Reports';
  RAISE NOTICE '============================================================';
END $$;
