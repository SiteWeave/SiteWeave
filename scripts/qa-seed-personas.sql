-- ============================================================================
-- QA: Seed customer personas (Auth users + orgs + roles + golden project)
-- ============================================================================
-- Staging / non-prod only. Creates the cast used by the full feature test plan:
--   Admin (Business A) — use your real inbox email if you want outbound mail
--   PM, Member          — SQL logins, no mailbox needed
--   Guest               — guest_only + project_collaborators on golden project
--   Personal owner      — personal workspace + active trial
--   Pending invitee     — invitations row only (no Auth user)
--   Org B admin         — separate business org (UI isolation)
--   Managed user        — must_change_password = true
--
-- HOW TO USE (Supabase SQL Editor):
--   1. Edit CONFIG (especially v_admin_email → your real inbox).
--   2. Run once. Idempotent: re-running updates wiring; does not reset passwords
--      for users that already exist (unless v_reset_existing_passwords = true).
--   3. Optional: scripts/seed-tester-with-fake-data.sql for bulk fake content
--      (point that script at the admin email, or use the golden project alone).
--   4. Then: scripts/qa-accelerate-time-gated.sql for time-gated features.
--
-- Shared password for newly created fake personas (default):
--   QaTest123!
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.qa_ensure_auth_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_reset_password BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_instance_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    IF p_reset_password THEN
      UPDATE auth.users
      SET
        encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
      WHERE id = v_user_id;
    END IF;
    RETURN v_user_id;
  END IF;

  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  )
  VALUES (
    COALESCE(v_instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
    v_user_id,
    'authenticated',
    'authenticated',
    lower(p_email),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', p_full_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', lower(p_email),
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  )
  ON CONFLICT DO NOTHING;

  RETURN v_user_id;
END;
$$;

DO $$
DECLARE
  -- ===================== CONFIG (edit these) =====================
  v_admin_email     TEXT := 'you@example.com';              -- real inbox recommended
  v_pm_email        TEXT := 'qa-pm@siteweave.test';
  v_member_email    TEXT := 'qa-member@siteweave.test';
  v_guest_email     TEXT := 'qa-guest@siteweave.test';
  v_personal_email  TEXT := 'qa-personal@siteweave.test';
  v_pending_email   TEXT := 'qa-pending@siteweave.test';    -- no Auth user
  v_orgb_email      TEXT := 'qa-orgb@siteweave.test';
  v_managed_email   TEXT := 'qa-managed@siteweave.local';

  v_shared_password TEXT := 'QaTest123!';
  v_reset_existing_passwords BOOLEAN := false; -- true = force password on existing users too

  v_org_a_name TEXT := 'QA Business Org A';
  v_org_a_slug TEXT := 'qa-business-a';
  v_org_b_name TEXT := 'QA Business Org B';
  v_org_b_slug TEXT := 'qa-business-b';
  v_personal_org_name TEXT := 'QA Personal Workspace';
  v_personal_org_slug TEXT := 'qa-personal';
  v_golden_project_name TEXT := 'QA Golden Project';
  -- ===============================================================

  v_admin_id UUID;
  v_pm_id UUID;
  v_member_id UUID;
  v_guest_id UUID;
  v_personal_id UUID;
  v_orgb_id UUID;
  v_managed_id UUID;

  v_org_a UUID;
  v_org_b UUID;
  v_org_personal UUID;

  v_role_admin_a UUID;
  v_role_pm_a UUID;
  v_role_member_a UUID;
  v_role_admin_b UUID;
  v_role_admin_personal UUID;

  v_contact_admin UUID;
  v_contact_pm UUID;
  v_contact_member UUID;
  v_contact_guest UUID;
  v_contact_personal UUID;
  v_contact_orgb UUID;
  v_contact_managed UUID;

  v_project_a UUID;
  v_project_b UUID;
  v_invite_token TEXT;
  v_admin_perms JSONB := '{
    "can_manage_team":true,"can_manage_users":true,"can_manage_roles":true,
    "can_create_projects":true,"can_edit_projects":true,"can_delete_projects":true,
    "can_assign_tasks":true,"can_manage_contacts":true,
    "can_create_tasks":true,"can_edit_tasks":true,"can_delete_tasks":true,
    "can_send_messages":true,"can_view_activity_history":true,
    "can_manage_progress_reports":true,"can_manage_org_progress_reports":true
  }'::jsonb;
  v_pm_perms JSONB := '{
    "can_manage_team":false,"can_manage_users":false,"can_manage_roles":false,
    "can_create_projects":true,"can_edit_projects":true,"can_delete_projects":false,
    "can_assign_tasks":true,"can_manage_contacts":true,
    "can_create_tasks":true,"can_edit_tasks":true,"can_delete_tasks":true,
    "can_send_messages":true,"can_view_activity_history":true,
    "can_manage_progress_reports":true
  }'::jsonb;
  v_member_perms JSONB := '{
    "can_manage_team":false,"can_manage_users":false,"can_manage_roles":false,
    "can_create_projects":false,"can_edit_projects":false,"can_delete_projects":false,
    "can_assign_tasks":false,"can_manage_contacts":false,
    "can_create_tasks":false,"can_edit_tasks":true,"can_delete_tasks":false,
    "can_send_messages":true,"can_view_activity_history":false
  }'::jsonb;
BEGIN
  -- ---------- Auth users ----------
  v_admin_id := public.qa_ensure_auth_user(v_admin_email, v_shared_password, 'QA Admin', v_reset_existing_passwords);
  v_pm_id := public.qa_ensure_auth_user(v_pm_email, v_shared_password, 'QA Project Manager', v_reset_existing_passwords);
  v_member_id := public.qa_ensure_auth_user(v_member_email, v_shared_password, 'QA Member', v_reset_existing_passwords);
  v_guest_id := public.qa_ensure_auth_user(v_guest_email, v_shared_password, 'QA Guest', v_reset_existing_passwords);
  v_personal_id := public.qa_ensure_auth_user(v_personal_email, v_shared_password, 'QA Personal Owner', v_reset_existing_passwords);
  v_orgb_id := public.qa_ensure_auth_user(v_orgb_email, v_shared_password, 'QA Org B Admin', v_reset_existing_passwords);
  v_managed_id := public.qa_ensure_auth_user(v_managed_email, v_shared_password, 'QA Managed User', true);

  -- ---------- Org A (business) ----------
  INSERT INTO public.organizations (
    name, slug, workspace_type, created_by_user_id, setup_wizard_completed_at, updated_at
  )
  VALUES (
    v_org_a_name, v_org_a_slug, 'business', v_admin_id, now(), now()
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        workspace_type = 'business',
        updated_at = now()
  RETURNING id INTO v_org_a;
  IF v_org_a IS NULL THEN
    SELECT id INTO v_org_a FROM public.organizations WHERE slug = v_org_a_slug;
  END IF;

  INSERT INTO public.roles (organization_id, name, permissions, is_system_role, updated_at)
  VALUES (v_org_a, 'Org Admin', v_admin_perms, true, now())
  ON CONFLICT (organization_id, name) DO UPDATE
    SET permissions = EXCLUDED.permissions, updated_at = now()
  RETURNING id INTO v_role_admin_a;
  IF v_role_admin_a IS NULL THEN
    SELECT id INTO v_role_admin_a FROM public.roles WHERE organization_id = v_org_a AND name = 'Org Admin';
  END IF;

  INSERT INTO public.roles (organization_id, name, permissions, is_system_role, updated_at)
  VALUES (v_org_a, 'Project Manager', v_pm_perms, true, now())
  ON CONFLICT (organization_id, name) DO UPDATE
    SET permissions = EXCLUDED.permissions, updated_at = now()
  RETURNING id INTO v_role_pm_a;
  IF v_role_pm_a IS NULL THEN
    SELECT id INTO v_role_pm_a FROM public.roles WHERE organization_id = v_org_a AND name = 'Project Manager';
  END IF;

  INSERT INTO public.roles (organization_id, name, permissions, is_system_role, updated_at)
  VALUES (v_org_a, 'Member', v_member_perms, true, now())
  ON CONFLICT (organization_id, name) DO UPDATE
    SET permissions = EXCLUDED.permissions, updated_at = now()
  RETURNING id INTO v_role_member_a;
  IF v_role_member_a IS NULL THEN
    SELECT id INTO v_role_member_a FROM public.roles WHERE organization_id = v_org_a AND name = 'Member';
  END IF;

  -- Contacts for Org A people
  INSERT INTO public.contacts (name, type, email, organization_id, created_by_user_id)
  SELECT 'QA Admin', 'Team', lower(v_admin_email), v_org_a, v_admin_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE organization_id = v_org_a AND lower(email) = lower(v_admin_email)
  );
  SELECT id INTO v_contact_admin FROM public.contacts
  WHERE organization_id = v_org_a AND lower(email) = lower(v_admin_email) LIMIT 1;

  INSERT INTO public.contacts (name, type, email, organization_id, created_by_user_id)
  SELECT 'QA Project Manager', 'Team', lower(v_pm_email), v_org_a, v_admin_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE organization_id = v_org_a AND lower(email) = lower(v_pm_email)
  );
  SELECT id INTO v_contact_pm FROM public.contacts
  WHERE organization_id = v_org_a AND lower(email) = lower(v_pm_email) LIMIT 1;

  INSERT INTO public.contacts (name, type, email, organization_id, created_by_user_id)
  SELECT 'QA Member', 'Team', lower(v_member_email), v_org_a, v_admin_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE organization_id = v_org_a AND lower(email) = lower(v_member_email)
  );
  SELECT id INTO v_contact_member FROM public.contacts
  WHERE organization_id = v_org_a AND lower(email) = lower(v_member_email) LIMIT 1;

  INSERT INTO public.contacts (name, type, email, organization_id, created_by_user_id)
  SELECT 'QA Guest', 'Subcontractor', lower(v_guest_email), v_org_a, v_admin_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE organization_id = v_org_a AND lower(email) = lower(v_guest_email)
  );
  SELECT id INTO v_contact_guest FROM public.contacts
  WHERE organization_id = v_org_a AND lower(email) = lower(v_guest_email) LIMIT 1;

  INSERT INTO public.contacts (name, type, email, organization_id, created_by_user_id)
  SELECT 'QA Managed User', 'Team', lower(v_managed_email), v_org_a, v_admin_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE organization_id = v_org_a AND lower(email) = lower(v_managed_email)
  );
  SELECT id INTO v_contact_managed FROM public.contacts
  WHERE organization_id = v_org_a AND lower(email) = lower(v_managed_email) LIMIT 1;

  -- Profiles Org A
  INSERT INTO public.profiles (id, role, role_id, contact_id, organization_id, account_intent, must_change_password, review_eligible_at)
  VALUES (v_admin_id, 'Admin', v_role_admin_a, v_contact_admin, v_org_a, 'workspace_owner', false, now())
  ON CONFLICT (id) DO UPDATE SET
    role = 'Admin',
    role_id = EXCLUDED.role_id,
    contact_id = EXCLUDED.contact_id,
    organization_id = EXCLUDED.organization_id,
    account_intent = 'workspace_owner',
    must_change_password = false,
    review_eligible_at = COALESCE(public.profiles.review_eligible_at, now());

  INSERT INTO public.profiles (id, role, role_id, contact_id, organization_id, account_intent, must_change_password, review_eligible_at)
  VALUES (v_pm_id, 'PM', v_role_pm_a, v_contact_pm, v_org_a, 'workspace_owner', false, now())
  ON CONFLICT (id) DO UPDATE SET
    role = 'PM',
    role_id = EXCLUDED.role_id,
    contact_id = EXCLUDED.contact_id,
    organization_id = EXCLUDED.organization_id,
    account_intent = 'workspace_owner',
    must_change_password = false,
    review_eligible_at = COALESCE(public.profiles.review_eligible_at, now());

  INSERT INTO public.profiles (id, role, role_id, contact_id, organization_id, account_intent, must_change_password, review_eligible_at)
  VALUES (v_member_id, 'Team', v_role_member_a, v_contact_member, v_org_a, 'workspace_owner', false, now())
  ON CONFLICT (id) DO UPDATE SET
    role = 'Team',
    role_id = EXCLUDED.role_id,
    contact_id = EXCLUDED.contact_id,
    organization_id = EXCLUDED.organization_id,
    account_intent = 'workspace_owner',
    must_change_password = false,
    review_eligible_at = COALESCE(public.profiles.review_eligible_at, now());

  INSERT INTO public.profiles (id, role, role_id, contact_id, organization_id, account_intent, must_change_password, review_eligible_at)
  VALUES (v_managed_id, 'Team', v_role_member_a, v_contact_managed, v_org_a, 'workspace_owner', true, now())
  ON CONFLICT (id) DO UPDATE SET
    role = 'Team',
    role_id = EXCLUDED.role_id,
    contact_id = EXCLUDED.contact_id,
    organization_id = EXCLUDED.organization_id,
    account_intent = 'workspace_owner',
    must_change_password = true,
    review_eligible_at = COALESCE(public.profiles.review_eligible_at, now());

  -- Guest: no org membership; project collaborator only
  INSERT INTO public.profiles (id, role, role_id, contact_id, organization_id, account_intent, must_change_password, review_eligible_at)
  VALUES (v_guest_id, 'Client', NULL, v_contact_guest, NULL, 'guest_only', false, NULL)
  ON CONFLICT (id) DO UPDATE SET
    role = 'Client',
    role_id = NULL,
    contact_id = EXCLUDED.contact_id,
    organization_id = NULL,
    account_intent = 'guest_only',
    must_change_password = false,
    review_eligible_at = NULL;

  -- ---------- Golden project ----------
  SELECT id INTO v_project_a
  FROM public.projects
  WHERE organization_id = v_org_a
    AND name = v_golden_project_name
    AND trashed_at IS NULL
  LIMIT 1;

  IF v_project_a IS NULL THEN
    INSERT INTO public.projects (
      name, address, status, status_color, project_type, color,
      organization_id, created_by_user_id, start_date, due_date,
      task_start_notifications_enabled, task_start_notification_lead_days,
      dependency_notifications_enabled
    )
    VALUES (
      v_golden_project_name,
      '100 QA Test Site Rd',
      'In Progress',
      '#10B981',
      'Commercial',
      '#3B82F6',
      v_org_a,
      v_admin_id,
      current_date - 14,
      current_date + 60,
      true,
      ARRAY[14, 7],
      true
    )
    RETURNING id INTO v_project_a;
  END IF;

  -- project_contacts.role = crew label on THIS job (PM/Team/Subcontractor/Client).
  -- Does NOT change company app permissions (profiles.role_id).
  -- Defaults match mapOrgRoleToDefaultProjectCrewRole in packages/core-logic.
  INSERT INTO public.project_contacts (project_id, contact_id, organization_id, role)
  VALUES
    (v_project_a, v_contact_admin, v_org_a, 'PM'),
    (v_project_a, v_contact_pm, v_org_a, 'PM'),
    (v_project_a, v_contact_member, v_org_a, 'Team'),
    (v_project_a, v_contact_guest, v_org_a, 'Subcontractor')
  ON CONFLICT (project_id, contact_id) DO UPDATE
    SET role = EXCLUDED.role,
        organization_id = EXCLUDED.organization_id;

  INSERT INTO public.project_collaborators (
    project_id, user_id, organization_id, invited_by_user_id, access_level
  )
  VALUES (v_project_a, v_guest_id, v_org_a, v_admin_id, 'editor')
  ON CONFLICT (project_id, user_id) DO UPDATE
    SET access_level = 'editor';

  -- A couple of starter tasks so the project is not empty
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks WHERE project_id = v_project_a AND text = 'QA: Site walkthrough'
  ) THEN
    INSERT INTO public.tasks (
      project_id, organization_id, text, completed, assignee_id,
      start_date, due_date, duration_days, priority
    ) VALUES
      (v_project_a, v_org_a, 'QA: Site walkthrough', false, v_contact_member, current_date, current_date + 2, 2, 'High'),
      (v_project_a, v_org_a, 'QA: Order materials', false, v_contact_pm, current_date + 3, current_date + 10, 5, 'Medium'),
      (v_project_a, v_org_a, 'QA: Guest punch item', false, v_contact_guest, current_date, current_date + 5, 3, 'Low');
  END IF;

  -- Pending org invite (no Auth user)
  IF NOT EXISTS (
    SELECT 1 FROM public.invitations
    WHERE organization_id = v_org_a
      AND lower(email) = lower(v_pending_email)
      AND status = 'pending'
  ) THEN
    v_invite_token := encode(extensions.gen_random_bytes(16), 'hex');
    INSERT INTO public.invitations (
      email, organization_id, role_id, invited_by_user_id,
      status, invitation_token, expires_at
    )
    VALUES (
      lower(v_pending_email), v_org_a, v_role_member_a, v_admin_id,
      'pending', v_invite_token, now() + interval '7 days'
    );
  ELSE
    SELECT invitation_token INTO v_invite_token
    FROM public.invitations
    WHERE organization_id = v_org_a
      AND lower(email) = lower(v_pending_email)
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- ---------- Personal workspace ----------
  INSERT INTO public.organizations (
    name, slug, workspace_type, max_projects, max_guest_collaborators_per_project,
    lifetime_projects_created, trial_ends_at, created_by_user_id,
    setup_wizard_completed_at, updated_at
  )
  VALUES (
    v_personal_org_name, v_personal_org_slug, 'personal', 2, 5,
    0, now() + interval '14 days', v_personal_id,
    now(), now()
  )
  ON CONFLICT (slug) DO UPDATE
    SET workspace_type = 'personal',
        max_projects = COALESCE(public.organizations.max_projects, 2),
        trial_ends_at = COALESCE(public.organizations.trial_ends_at, now() + interval '14 days'),
        updated_at = now()
  RETURNING id INTO v_org_personal;
  IF v_org_personal IS NULL THEN
    SELECT id INTO v_org_personal FROM public.organizations WHERE slug = v_personal_org_slug;
  END IF;

  INSERT INTO public.roles (organization_id, name, permissions, is_system_role, updated_at)
  VALUES (v_org_personal, 'Org Admin', v_admin_perms, true, now())
  ON CONFLICT (organization_id, name) DO UPDATE
    SET permissions = EXCLUDED.permissions, updated_at = now()
  RETURNING id INTO v_role_admin_personal;
  IF v_role_admin_personal IS NULL THEN
    SELECT id INTO v_role_admin_personal
    FROM public.roles WHERE organization_id = v_org_personal AND name = 'Org Admin';
  END IF;

  INSERT INTO public.contacts (name, type, email, organization_id, created_by_user_id)
  SELECT 'QA Personal Owner', 'Team', lower(v_personal_email), v_org_personal, v_personal_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE organization_id = v_org_personal AND lower(email) = lower(v_personal_email)
  );
  SELECT id INTO v_contact_personal FROM public.contacts
  WHERE organization_id = v_org_personal AND lower(email) = lower(v_personal_email) LIMIT 1;

  INSERT INTO public.profiles (id, role, role_id, contact_id, organization_id, account_intent, must_change_password, review_eligible_at)
  VALUES (v_personal_id, 'Admin', v_role_admin_personal, v_contact_personal, v_org_personal, 'workspace_owner', false, now())
  ON CONFLICT (id) DO UPDATE SET
    role = 'Admin',
    role_id = EXCLUDED.role_id,
    contact_id = EXCLUDED.contact_id,
    organization_id = EXCLUDED.organization_id,
    account_intent = 'workspace_owner',
    must_change_password = false,
    review_eligible_at = COALESCE(public.profiles.review_eligible_at, now());

  -- Optional: also invite personal owner as guest on golden project (cross-context)
  INSERT INTO public.project_collaborators (
    project_id, user_id, organization_id, invited_by_user_id, access_level
  )
  VALUES (v_project_a, v_personal_id, v_org_a, v_admin_id, 'viewer')
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- ---------- Org B ----------
  INSERT INTO public.organizations (
    name, slug, workspace_type, created_by_user_id, setup_wizard_completed_at, updated_at
  )
  VALUES (
    v_org_b_name, v_org_b_slug, 'business', v_orgb_id, now(), now()
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, workspace_type = 'business', updated_at = now()
  RETURNING id INTO v_org_b;
  IF v_org_b IS NULL THEN
    SELECT id INTO v_org_b FROM public.organizations WHERE slug = v_org_b_slug;
  END IF;

  INSERT INTO public.roles (organization_id, name, permissions, is_system_role, updated_at)
  VALUES (v_org_b, 'Org Admin', v_admin_perms, true, now())
  ON CONFLICT (organization_id, name) DO UPDATE
    SET permissions = EXCLUDED.permissions, updated_at = now()
  RETURNING id INTO v_role_admin_b;
  IF v_role_admin_b IS NULL THEN
    SELECT id INTO v_role_admin_b FROM public.roles WHERE organization_id = v_org_b AND name = 'Org Admin';
  END IF;

  INSERT INTO public.contacts (name, type, email, organization_id, created_by_user_id)
  SELECT 'QA Org B Admin', 'Team', lower(v_orgb_email), v_org_b, v_orgb_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE organization_id = v_org_b AND lower(email) = lower(v_orgb_email)
  );
  SELECT id INTO v_contact_orgb FROM public.contacts
  WHERE organization_id = v_org_b AND lower(email) = lower(v_orgb_email) LIMIT 1;

  INSERT INTO public.profiles (id, role, role_id, contact_id, organization_id, account_intent, must_change_password, review_eligible_at)
  VALUES (v_orgb_id, 'Admin', v_role_admin_b, v_contact_orgb, v_org_b, 'workspace_owner', false, now())
  ON CONFLICT (id) DO UPDATE SET
    role = 'Admin',
    role_id = EXCLUDED.role_id,
    contact_id = EXCLUDED.contact_id,
    organization_id = EXCLUDED.organization_id,
    account_intent = 'workspace_owner',
    must_change_password = false,
    review_eligible_at = COALESCE(public.profiles.review_eligible_at, now());

  SELECT id INTO v_project_b
  FROM public.projects
  WHERE organization_id = v_org_b AND name = 'QA Org B Only Project' AND trashed_at IS NULL
  LIMIT 1;
  IF v_project_b IS NULL THEN
    INSERT INTO public.projects (
      name, status, status_color, project_type, color,
      organization_id, created_by_user_id
    )
    VALUES (
      'QA Org B Only Project', 'Planning', '#3B82F6', 'Residential', '#6366F1',
      v_org_b, v_orgb_id
    )
    RETURNING id INTO v_project_b;
  END IF;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'QA personas ready (staging). Shared password for NEW users: %', v_shared_password;
  RAISE NOTICE 'Admin:     %  (org A %)', v_admin_email, v_org_a;
  RAISE NOTICE 'PM:        %', v_pm_email;
  RAISE NOTICE 'Member:    %', v_member_email;
  RAISE NOTICE 'Guest:     %  (guest_only on project %)', v_guest_email, v_project_a;
  RAISE NOTICE 'Personal:  %  (personal org %)', v_personal_email, v_org_personal;
  RAISE NOTICE 'Pending:   %  (invite token: %)', v_pending_email, v_invite_token;
  RAISE NOTICE 'Org B:     %  (org % project %)', v_orgb_email, v_org_b, v_project_b;
  RAISE NOTICE 'Managed:   %  (must_change_password=true)', v_managed_email;
  RAISE NOTICE 'Golden project: % (%)', v_golden_project_name, v_project_a;
  RAISE NOTICE 'Crew roles on golden: Admin/PM→PM, Member→Team, Guest→Subcontractor';
  RAISE NOTICE 'Next: docs/FULL-FEATURE-TEST-PLAN.md → qa-accelerate-time-gated.sql';
  RAISE NOTICE '============================================================';
END $$;

-- ---------------------------------------------------------------------------
-- Already seeded? Fix crew labels without re-running the whole script:
--
-- UPDATE public.project_contacts pc
-- SET role = v.role
-- FROM (
--   SELECT p.id AS project_id, c.id AS contact_id, x.role
--   FROM public.projects p
--   JOIN public.contacts c ON c.organization_id = p.organization_id
--   JOIN (VALUES
--     ('qa-pm@siteweave.test', 'PM'),
--     ('qa-member@siteweave.test', 'Team'),
--     ('qa-guest@siteweave.test', 'Subcontractor'),
--     ('you@example.com', 'PM')  -- your admin email
--   ) AS x(email, role) ON lower(c.email) = lower(x.email)
--   WHERE p.name = 'QA Golden Project' AND p.trashed_at IS NULL
-- ) v
-- WHERE pc.project_id = v.project_id AND pc.contact_id = v.contact_id;
-- ---------------------------------------------------------------------------

-- Optional cleanup helper (commented). Drop only if you want to remove the helper fn:
-- DROP FUNCTION IF EXISTS public.qa_ensure_auth_user(TEXT, TEXT, TEXT, BOOLEAN);
