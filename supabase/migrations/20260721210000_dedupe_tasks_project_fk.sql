-- PostgREST embed fails when two FKs exist between the same tables/columns.
-- Live DB had both tasks_project_id_fkey and fk_tasks_project_id on tasks.project_id.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_project_id'
  ) THEN
    ALTER TABLE public.tasks DROP CONSTRAINT fk_tasks_project_id;
  END IF;

  ALTER TABLE public.tasks
    ADD CONSTRAINT fk_tasks_project_id
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
END $$;
