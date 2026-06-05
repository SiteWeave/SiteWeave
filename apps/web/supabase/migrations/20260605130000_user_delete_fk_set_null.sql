-- Belt-and-suspenders: allow user/contact deletion without FK violations on duplicate constraints.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS fk_profiles_contact;
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_contact
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS fk_contacts_created_by;
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_created_by_user_id_fkey;
ALTER TABLE public.contacts
  ADD CONSTRAINT fk_contacts_created_by
  FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.project_collaborators DROP CONSTRAINT IF EXISTS project_collaborators_invited_by_user_id_fkey;

ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_user_id_fkey;
