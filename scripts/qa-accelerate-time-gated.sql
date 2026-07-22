-- ============================================================================
-- QA: Accelerate time-gated features (staging / non-prod only)
-- ============================================================================
-- Speeds up customer-realistic tests that would otherwise wait days/weeks:
--   A) App Store / Play review prompt eligibility
--   B) Smart task-start notifications (lead-day tasks + clear today's history)
--   C) Personal trial mid reminder (~6–7 days left)
--   D) Personal trial final reminder (≤1 day left)
--   E) Trash purge eligibility (project past retention)
--   F) Personal project-cap upgrade gate
--   G) Progress report schedule due now
--   H) Reset helpers (history / reminder flags) for a clean retest
--
-- PREREQ: Run scripts/qa-seed-personas.sql first (or create Auth users manually).
-- Checklist: docs/FULL-FEATURE-TEST-PLAN.md
--
-- HOW TO USE (Supabase SQL Editor as a privileged role):
--   1. Edit the CONFIG section below (emails / project name / flags).
--      Match v_admin_email / v_personal_email / v_assignee_email to qa-seed-personas.
--   2. Set run_block_* flags for the blocks you want (default: all false).
--   3. Run the whole script.
--   4. Trigger the matching edge function — see scripts/qa-invoke-cron-jobs.md
--
-- DO NOT run on production with real customer data.
-- ============================================================================

DO $$
DECLARE
  -- ===================== CONFIG (edit these) =====================
  v_admin_email     TEXT := 'you@example.com';          -- Auth user + default recipient
  v_personal_email  TEXT := 'qa-personal@siteweave.test'; -- Personal workspace owner
  v_assignee_email  TEXT := 'you@example.com';          -- Contact email that receives smart notifs
  v_project_name    TEXT := NULL;                      -- NULL = first non-trashed project in admin org
  v_project_id      UUID := NULL;                      -- Optional override (wins over name)

  -- Flip to true for each block you want to run this time:
  run_block_a BOOLEAN := false; -- Review prompt
  run_block_b BOOLEAN := false; -- Smart notifications
  run_block_c BOOLEAN := false; -- Trial mid reminder
  run_block_d BOOLEAN := false; -- Trial final reminder
  run_block_e BOOLEAN := false; -- Trash purge-ready
  run_block_f BOOLEAN := false; -- Personal project cap
  run_block_g BOOLEAN := false; -- Progress schedule due
  run_block_h BOOLEAN := false; -- Reset helpers
  -- ===============================================================

  v_admin_user_id     UUID;
  v_personal_user_id  UUID;
  v_admin_org_id      UUID;
  v_personal_org_id   UUID;
  v_project_id_res    UUID;
  v_contact_id        UUID;
  v_task_id           UUID;
  v_schedule_id       UUID;
  v_today             DATE := (timezone('utc', now()))::date;
  v_lead              INT;
  v_leads             INT[] := ARRAY[7, 14];
  v_created_tasks     INT := 0;
BEGIN
  -- Resolve admin user + org
  SELECT id INTO v_admin_user_id FROM auth.users WHERE lower(email) = lower(v_admin_email) LIMIT 1;
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Admin Auth user not found for email: %. Create the user first.', v_admin_email;
  END IF;

  SELECT organization_id INTO v_admin_org_id
  FROM public.profiles
  WHERE id = v_admin_user_id;

  IF v_admin_org_id IS NULL THEN
    RAISE EXCEPTION 'Admin profile has no organization_id for %.', v_admin_email;
  END IF;

  -- Resolve project
  IF v_project_id IS NOT NULL THEN
    v_project_id_res := v_project_id;
  ELSIF v_project_name IS NOT NULL AND length(trim(v_project_name)) > 0 THEN
    SELECT id INTO v_project_id_res
    FROM public.projects
    WHERE organization_id = v_admin_org_id
      AND name = v_project_name
      AND trashed_at IS NULL
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;
  ELSE
    SELECT id INTO v_project_id_res
    FROM public.projects
    WHERE organization_id = v_admin_org_id
      AND trashed_at IS NULL
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Personal user / org (optional until C/D/F)
  SELECT id INTO v_personal_user_id FROM auth.users WHERE lower(email) = lower(v_personal_email) LIMIT 1;
  IF v_personal_user_id IS NOT NULL THEN
    SELECT p.organization_id INTO v_personal_org_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = v_personal_user_id
      AND o.workspace_type = 'personal'
    LIMIT 1;

    IF v_personal_org_id IS NULL THEN
      SELECT id INTO v_personal_org_id
      FROM public.organizations
      WHERE workspace_type = 'personal'
        AND created_by_user_id = v_personal_user_id
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1;
    END IF;
  END IF;

  RAISE NOTICE 'Resolved admin=% (%) org=% project=% personal_user=% personal_org=%',
    v_admin_email, v_admin_user_id, v_admin_org_id, v_project_id_res, v_personal_user_id, v_personal_org_id;

  -- ------------------------------------------------------------------
  -- BLOCK A: Review prompt eligible now (skip the 7-day wait)
  -- ------------------------------------------------------------------
  IF run_block_a THEN
    UPDATE public.profiles
    SET
      review_eligible_at = now() - interval '8 days',
      review_prompt_shown_at = NULL,
      review_prompt_action = NULL,
      review_prompt_app_version = NULL
    WHERE id = v_admin_user_id;

    IF v_personal_user_id IS NOT NULL THEN
      UPDATE public.profiles
      SET
        review_eligible_at = now() - interval '8 days',
        review_prompt_shown_at = NULL,
        review_prompt_action = NULL,
        review_prompt_app_version = NULL
      WHERE id = v_personal_user_id;
    END IF;

    RAISE NOTICE 'BLOCK A: review_eligible_at backdated 8 days; prompt shown/action cleared for admin (+ personal if found).';
  END IF;

  -- ------------------------------------------------------------------
  -- BLOCK B: Smart task-start notifications ready to fire
  -- ------------------------------------------------------------------
  IF run_block_b THEN
    IF v_project_id_res IS NULL THEN
      RAISE EXCEPTION 'BLOCK B needs a project in org %. Seed data or set v_project_name / v_project_id.', v_admin_org_id;
    END IF;

    -- Business / full-tier path: smart notifs skip personal-trial-expired orgs
    UPDATE public.organizations
    SET
      workspace_type = COALESCE(workspace_type, 'business'),
      task_start_notifications_enabled = true,
      task_start_notification_lead_days = ARRAY[14, 7],
      notification_email_batching_enabled = true,
      updated_at = now()
    WHERE id = v_admin_org_id;

    UPDATE public.projects
    SET
      task_notifications_use_org_defaults = false,
      task_start_notifications_enabled = true,
      task_start_notification_lead_days = ARRAY[14, 7],
      notification_email_batching_enabled = true,
      dependency_notifications_enabled = true,
      updated_at = now()
    WHERE id = v_project_id_res;

    -- Ensure assignee contact uses a deliverable email (your real inbox)
    SELECT id INTO v_contact_id
    FROM public.contacts
    WHERE organization_id = v_admin_org_id
      AND lower(email) = lower(v_assignee_email)
    LIMIT 1;

    IF v_contact_id IS NULL THEN
      INSERT INTO public.contacts (name, type, email, organization_id, created_by_user_id)
      VALUES ('QA Smart Notif Assignee', 'Team', v_assignee_email, v_admin_org_id, v_admin_user_id)
      RETURNING id INTO v_contact_id;
      RAISE NOTICE 'BLOCK B: created contact % for %', v_contact_id, v_assignee_email;
    ELSE
      UPDATE public.contacts
      SET email = v_assignee_email
      WHERE id = v_contact_id;
    END IF;

    -- One incomplete task per lead day (start_date = today + lead)
    FOREACH v_lead IN ARRAY v_leads LOOP
      SELECT id INTO v_task_id
      FROM public.tasks
      WHERE project_id = v_project_id_res
        AND text = format('QA smart notif lead %s days', v_lead)
      LIMIT 1;

      IF v_task_id IS NULL THEN
        INSERT INTO public.tasks (
          project_id,
          organization_id,
          text,
          completed,
          assignee_id,
          start_date,
          due_date,
          duration_days,
          priority,
          notify_assignee_email
        )
        VALUES (
          v_project_id_res,
          v_admin_org_id,
          format('QA smart notif lead %s days', v_lead),
          false,
          v_contact_id,
          v_today + v_lead,
          v_today + v_lead + 1,
          1,
          'Medium',
          true
        )
        RETURNING id INTO v_task_id;
        v_created_tasks := v_created_tasks + 1;
      ELSE
        UPDATE public.tasks
        SET
          completed = false,
          completed_at = NULL,
          assignee_id = v_contact_id,
          start_date = v_today + v_lead,
          due_date = v_today + v_lead + 1,
          notify_assignee_email = true
        WHERE id = v_task_id;
      END IF;

      -- Allow re-run today for this task/lead
      DELETE FROM public.task_notification_history
      WHERE task_id = v_task_id
        AND lead_days = v_lead
        AND notification_date = v_today;
    END LOOP;

    RAISE NOTICE 'BLOCK B: smart notifs enabled on project %; assignee=%; tasks for leads %; created_new=%',
      v_project_id_res, v_assignee_email, v_leads, v_created_tasks;
    RAISE NOTICE 'BLOCK B next: curl process-task-notifications (see scripts/qa-invoke-cron-jobs.md)';
  END IF;

  -- ------------------------------------------------------------------
  -- BLOCK C: Trial mid reminder window (~6.5 days left)
  -- ------------------------------------------------------------------
  IF run_block_c THEN
    IF v_personal_org_id IS NULL THEN
      RAISE EXCEPTION 'BLOCK C needs a personal workspace for %. Provision personal workspace first.', v_personal_email;
    END IF;

    UPDATE public.organizations
    SET
      workspace_type = 'personal',
      trial_ends_at = now() + interval '6 days 12 hours',
      trial_reminder_mid_sent_at = NULL,
      updated_at = now()
    WHERE id = v_personal_org_id;

    RAISE NOTICE 'BLOCK C: personal org % trial_ends_at set to ~6.5 days out; mid reminder flag cleared.', v_personal_org_id;
    RAISE NOTICE 'BLOCK C next: curl process-trial-reminders';
  END IF;

  -- ------------------------------------------------------------------
  -- BLOCK D: Trial final reminder window (~12 hours left)
  -- ------------------------------------------------------------------
  IF run_block_d THEN
    IF v_personal_org_id IS NULL THEN
      RAISE EXCEPTION 'BLOCK D needs a personal workspace for %.', v_personal_email;
    END IF;

    UPDATE public.organizations
    SET
      workspace_type = 'personal',
      trial_ends_at = now() + interval '12 hours',
      trial_reminder_final_sent_at = NULL,
      updated_at = now()
    WHERE id = v_personal_org_id;

    RAISE NOTICE 'BLOCK D: personal org % trial_ends_at set to ~12h out; final reminder flag cleared.', v_personal_org_id;
    RAISE NOTICE 'BLOCK D next: curl process-trial-reminders';
    RAISE NOTICE 'NOTE: Do not run C and D in the same pass if you need both emails — D overwrites trial_ends_at.';
  END IF;

  -- ------------------------------------------------------------------
  -- BLOCK E: Trash purge-ready (retention already elapsed)
  -- ------------------------------------------------------------------
  IF run_block_e THEN
    IF v_project_id_res IS NULL THEN
      RAISE EXCEPTION 'BLOCK E needs a project id.';
    END IF;

    -- Prefer an already-trashed project in the org; else soft-trash the resolved project
    IF EXISTS (
      SELECT 1 FROM public.projects
      WHERE organization_id = v_admin_org_id AND trashed_at IS NOT NULL
    ) THEN
      UPDATE public.projects
      SET purge_after = now() - interval '1 minute'
      WHERE organization_id = v_admin_org_id
        AND trashed_at IS NOT NULL
        AND id = (
          SELECT id FROM public.projects
          WHERE organization_id = v_admin_org_id AND trashed_at IS NOT NULL
          ORDER BY trashed_at DESC
          LIMIT 1
        );
      RAISE NOTICE 'BLOCK E: set purge_after in the past on most recently trashed project in org %.', v_admin_org_id;
    ELSE
      UPDATE public.projects
      SET
        trashed_at = now() - interval '31 days',
        purge_after = now() - interval '1 minute',
        updated_at = now()
      WHERE id = v_project_id_res;
      RAISE NOTICE 'BLOCK E: soft-trashed project % with purge_after in the past. Restore from Trash UI if you still need it.', v_project_id_res;
    END IF;

    RAISE NOTICE 'BLOCK E next: call purge-project / trash purge path used in your env (or wait for purge cron).';
  END IF;

  -- ------------------------------------------------------------------
  -- BLOCK F: Personal project cap → upgrade gate on next create
  -- ------------------------------------------------------------------
  IF run_block_f THEN
    IF v_personal_org_id IS NULL THEN
      RAISE EXCEPTION 'BLOCK F needs a personal workspace for %.', v_personal_email;
    END IF;

    -- End trial so caps apply, then mark lifetime count at/over cap
    UPDATE public.organizations
    SET
      workspace_type = 'personal',
      max_projects = COALESCE(max_projects, 2),
      lifetime_projects_created = GREATEST(COALESCE(lifetime_projects_created, 0), COALESCE(max_projects, 2)),
      trial_ends_at = now() - interval '1 hour',
      updated_at = now()
    WHERE id = v_personal_org_id;

    RAISE NOTICE 'BLOCK F: personal org % trial ended; lifetime_projects_created at/over max_projects. Next project create should show upgrade UI.', v_personal_org_id;
  END IF;

  -- ------------------------------------------------------------------
  -- BLOCK G: Progress report schedule due now
  -- ------------------------------------------------------------------
  IF run_block_g THEN
    IF v_project_id_res IS NULL THEN
      RAISE EXCEPTION 'BLOCK G needs a project in the admin org.';
    END IF;

    -- Prefer an existing active schedule for this org/project
    SELECT id INTO v_schedule_id
    FROM public.progress_report_schedules
    WHERE organization_id = v_admin_org_id
      AND (project_id = v_project_id_res OR project_id IS NULL)
      AND is_active = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_schedule_id IS NULL THEN
      INSERT INTO public.progress_report_schedules (
        organization_id,
        project_id,
        name,
        report_audience_type,
        template_type,
        frequency,
        requires_approval,
        approval_status,
        is_active,
        created_by_user_id,
        next_send_at,
        send_hour,
        send_timezone
      )
      VALUES (
        v_admin_org_id,
        v_project_id_res,
        'QA Due Now Schedule',
        'internal',
        'internal_detailed',
        'weekly',
        false,
        'approved',
        true,
        v_admin_user_id,
        now() - interval '1 minute',
        8,
        'America/New_York'
      )
      RETURNING id INTO v_schedule_id;

      INSERT INTO public.progress_report_recipients (
        schedule_id,
        email,
        recipient_type,
        is_active
      )
      VALUES (
        v_schedule_id,
        v_admin_email,
        'to',
        true
      );

      RAISE NOTICE 'BLOCK G: created schedule % with recipient %.', v_schedule_id, v_admin_email;
    ELSE
      UPDATE public.progress_report_schedules
      SET
        is_active = true,
        requires_approval = false,
        approval_status = 'approved',
        next_send_at = now() - interval '1 minute',
        updated_at = now()
      WHERE id = v_schedule_id;

      -- Ensure at least one active recipient
      IF NOT EXISTS (
        SELECT 1 FROM public.progress_report_recipients
        WHERE schedule_id = v_schedule_id AND is_active = true
      ) THEN
        INSERT INTO public.progress_report_recipients (schedule_id, email, recipient_type, is_active)
        VALUES (v_schedule_id, v_admin_email, 'to', true);
      END IF;

      RAISE NOTICE 'BLOCK G: schedule % next_send_at set to past; active + approved.', v_schedule_id;
    END IF;

    RAISE NOTICE 'BLOCK G next: curl process-scheduled-reports';
  END IF;

  -- ------------------------------------------------------------------
  -- BLOCK H: Reset helpers (clean retest)
  -- ------------------------------------------------------------------
  IF run_block_h THEN
    IF v_project_id_res IS NOT NULL THEN
      DELETE FROM public.task_notification_history
      WHERE project_id = v_project_id_res
        AND notification_date = v_today;

      DELETE FROM public.task_notification_history
      WHERE task_id IN (
        SELECT id FROM public.tasks
        WHERE project_id = v_project_id_res
          AND text LIKE 'QA smart notif lead %'
      );

      RAISE NOTICE 'BLOCK H: cleared today''s (and QA smart-notif) task_notification_history for project %.', v_project_id_res;
    END IF;

    IF v_personal_org_id IS NOT NULL THEN
      UPDATE public.organizations
      SET
        trial_reminder_mid_sent_at = NULL,
        trial_reminder_final_sent_at = NULL,
        updated_at = now()
      WHERE id = v_personal_org_id;
      RAISE NOTICE 'BLOCK H: cleared trial reminder sent flags on personal org %.', v_personal_org_id;
    END IF;

    UPDATE public.profiles
    SET
      review_prompt_shown_at = NULL,
      review_prompt_action = NULL,
      review_prompt_app_version = NULL
    WHERE id IN (v_admin_user_id, v_personal_user_id);

    RAISE NOTICE 'BLOCK H: cleared review prompt shown/action for admin (+ personal if present).';
  END IF;

  IF NOT (run_block_a OR run_block_b OR run_block_c OR run_block_d OR run_block_e OR run_block_f OR run_block_g OR run_block_h) THEN
    RAISE NOTICE 'No blocks enabled. Set one or more run_block_* flags to true and re-run.';
  END IF;
END $$;
