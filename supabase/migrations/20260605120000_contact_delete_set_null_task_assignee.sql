-- Allow contact removal without blocking on tasks still referencing assignee_id.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS fk_tasks_assignee_id;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_assignee_id
  FOREIGN KEY (assignee_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.issue_steps DROP CONSTRAINT IF EXISTS fk_issue_steps_assigned_to_contact;
ALTER TABLE public.issue_steps
  ADD CONSTRAINT fk_issue_steps_assigned_to_contact
  FOREIGN KEY (assigned_to_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.project_contacts DROP CONSTRAINT IF EXISTS fk_project_contacts_contact_id;
ALTER TABLE public.project_contacts
  ADD CONSTRAINT fk_project_contacts_contact_id
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
