-- Prevent duplicate email or phone on contacts within the same organization.
-- Merges safe duplicates first (directory-only dupes); strips email/phone on unmergeable rows.

CREATE OR REPLACE FUNCTION public.contact_phone_digits(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN d IS NULL OR length(d) < 7 THEN NULL
    WHEN length(d) = 11 AND left(d, 1) = '1' THEN substring(d FROM 2)
    ELSE d
  END
  FROM (
    SELECT NULLIF(regexp_replace(COALESCE(p, ''), '\D', '', 'g'), '') AS d
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.repoint_contact_references(p_loser_id uuid, p_keeper_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_loser_id IS NULL OR p_keeper_id IS NULL OR p_loser_id = p_keeper_id THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET contact_id = p_keeper_id
  WHERE contact_id = p_loser_id;

  UPDATE public.tasks
  SET assignee_id = p_keeper_id
  WHERE assignee_id = p_loser_id;

  UPDATE public.issue_steps
  SET assigned_to_contact_id = p_keeper_id
  WHERE assigned_to_contact_id = p_loser_id;

  UPDATE public.project_access_invites
  SET contact_id = p_keeper_id
  WHERE contact_id = p_loser_id;

  UPDATE public.progress_report_recipients
  SET contact_id = p_keeper_id
  WHERE contact_id = p_loser_id;

  INSERT INTO public.project_contacts (project_id, contact_id, organization_id, role)
  SELECT pc.project_id, p_keeper_id, pc.organization_id, pc.role
  FROM public.project_contacts pc
  WHERE pc.contact_id = p_loser_id
  ON CONFLICT (project_id, contact_id) DO NOTHING;

  DELETE FROM public.project_contacts
  WHERE contact_id = p_loser_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dedupe_contacts_by_email()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
  v_keeper_has_profile boolean;
  v_loser_has_profile boolean;
BEGIN
  FOR rec IN
    WITH ranked AS (
      SELECT
        c.id,
        c.organization_id,
        lower(btrim(c.email)) AS email_key,
        ROW_NUMBER() OVER (
          PARTITION BY c.organization_id, lower(btrim(c.email))
          ORDER BY
            (EXISTS (SELECT 1 FROM public.profiles p WHERE p.contact_id = c.id)) DESC,
            (SELECT count(*)::int FROM public.project_contacts pc WHERE pc.contact_id = c.id) DESC,
            c.id ASC
        ) AS rn
      FROM public.contacts c
      WHERE c.email IS NOT NULL AND btrim(c.email) <> ''
    )
    SELECT loser.id AS loser_id, keeper.id AS keeper_id
    FROM ranked loser
    JOIN ranked keeper
      ON keeper.organization_id = loser.organization_id
     AND keeper.email_key = loser.email_key
     AND keeper.rn = 1
    WHERE loser.rn > 1
  LOOP
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.contact_id = rec.keeper_id)
      INTO v_keeper_has_profile;
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.contact_id = rec.loser_id)
      INTO v_loser_has_profile;

    IF v_keeper_has_profile AND v_loser_has_profile THEN
      -- Two app accounts share an email: cannot merge; clear duplicate email.
      UPDATE public.contacts
      SET email = NULL
      WHERE id = rec.loser_id;
      CONTINUE;
    END IF;

    UPDATE public.contacts keeper
    SET
      phone = COALESCE(NULLIF(btrim(keeper.phone), ''), loser.phone),
      role = COALESCE(NULLIF(btrim(keeper.role), ''), loser.role),
      name = CASE
        WHEN NULLIF(btrim(keeper.name), '') IS NULL THEN loser.name
        ELSE keeper.name
      END
    FROM public.contacts loser
    WHERE keeper.id = rec.keeper_id
      AND loser.id = rec.loser_id;

    PERFORM public.repoint_contact_references(rec.loser_id, rec.keeper_id);

    DELETE FROM public.contacts
    WHERE id = rec.loser_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.dedupe_contacts_by_phone()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
  v_keeper_has_profile boolean;
  v_loser_has_profile boolean;
BEGIN
  FOR rec IN
    WITH ranked AS (
      SELECT
        c.id,
        c.organization_id,
        public.contact_phone_digits(c.phone) AS phone_key,
        ROW_NUMBER() OVER (
          PARTITION BY c.organization_id, public.contact_phone_digits(c.phone)
          ORDER BY
            (EXISTS (SELECT 1 FROM public.profiles p WHERE p.contact_id = c.id)) DESC,
            (SELECT count(*)::int FROM public.project_contacts pc WHERE pc.contact_id = c.id) DESC,
            c.id ASC
        ) AS rn
      FROM public.contacts c
      WHERE public.contact_phone_digits(c.phone) IS NOT NULL
    )
    SELECT loser.id AS loser_id, keeper.id AS keeper_id
    FROM ranked loser
    JOIN ranked keeper
      ON keeper.organization_id = loser.organization_id
     AND keeper.phone_key = loser.phone_key
     AND keeper.rn = 1
    WHERE loser.rn > 1
  LOOP
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.contact_id = rec.keeper_id)
      INTO v_keeper_has_profile;
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.contact_id = rec.loser_id)
      INTO v_loser_has_profile;

    IF v_keeper_has_profile AND v_loser_has_profile THEN
      UPDATE public.contacts
      SET phone = NULL
      WHERE id = rec.loser_id;
      CONTINUE;
    END IF;

    UPDATE public.contacts keeper
    SET
      email = COALESCE(NULLIF(lower(btrim(keeper.email)), ''), lower(btrim(loser.email))),
      role = COALESCE(NULLIF(btrim(keeper.role), ''), loser.role),
      name = CASE
        WHEN NULLIF(btrim(keeper.name), '') IS NULL THEN loser.name
        ELSE keeper.name
      END
    FROM public.contacts loser
    WHERE keeper.id = rec.keeper_id
      AND loser.id = rec.loser_id;

    PERFORM public.repoint_contact_references(rec.loser_id, rec.keeper_id);

    DELETE FROM public.contacts
    WHERE id = rec.loser_id;
  END LOOP;
END;
$$;

SELECT public.dedupe_contacts_by_email();
SELECT public.dedupe_contacts_by_phone();

DROP FUNCTION public.dedupe_contacts_by_email();
DROP FUNCTION public.dedupe_contacts_by_phone();
DROP FUNCTION public.repoint_contact_references(uuid, uuid);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_unique_org_email
ON public.contacts (organization_id, lower(btrim(email)))
WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS contacts_unique_org_phone_digits
ON public.contacts (organization_id, public.contact_phone_digits(phone))
WHERE public.contact_phone_digits(phone) IS NOT NULL;

COMMENT ON FUNCTION public.contact_phone_digits IS
  'Digit-only phone key for duplicate detection; US 11-digit numbers collapse to 10.';
