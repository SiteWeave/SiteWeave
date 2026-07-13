-- Open task photo access to any authenticated org member (same organization_id as the task)
-- or guest collaborator on the project. Previous checks required project-level visibility
-- (project_contacts, assigned PM, etc.) which blocked many field users.

CREATE OR REPLACE FUNCTION public.user_can_access_task_photos(task_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_uuid
        AND (
          (
            t.organization_id IS NOT NULL
            AND t.organization_id = (SELECT public.get_user_organization_id())
            AND (SELECT public.get_user_organization_id()) IS NOT NULL
          )
          OR EXISTS (
            SELECT 1
            FROM public.project_collaborators pc
            WHERE pc.user_id = auth.uid()
              AND pc.project_id = t.project_id
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_task_photo_object(file_path TEXT, require_manage BOOLEAN DEFAULT false)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  path_parts TEXT[];
  parsed_org_id UUID;
  parsed_project_id UUID;
  parsed_task_id UUID;
  task_org_id UUID;
  task_project_id UUID;
BEGIN
  path_parts := string_to_array(COALESCE(file_path, ''), '/');

  IF array_length(path_parts, 1) < 5 THEN
    RETURN false;
  END IF;

  BEGIN
    parsed_org_id := path_parts[1]::UUID;
    parsed_project_id := path_parts[2]::UUID;
    parsed_task_id := path_parts[3]::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  IF path_parts[4] NOT IN ('original', 'thumb') THEN
    RETURN false;
  END IF;

  SELECT t.organization_id, t.project_id
  INTO task_org_id, task_project_id
  FROM public.tasks t
  WHERE t.id = parsed_task_id;

  IF task_org_id IS NULL OR task_project_id IS NULL THEN
    RETURN false;
  END IF;

  IF task_org_id <> parsed_org_id OR task_project_id <> parsed_project_id THEN
    RETURN false;
  END IF;

  RETURN public.user_can_access_task_photos(parsed_task_id);
END;
$$;

DROP POLICY IF EXISTS "Users can see task photos for visible tasks" ON public.task_photos;
DROP POLICY IF EXISTS "Users can upload task photos for visible tasks" ON public.task_photos;
DROP POLICY IF EXISTS "Users can manage task photos for editable tasks" ON public.task_photos;
DROP POLICY IF EXISTS "Users can update task photos for editable tasks" ON public.task_photos;
DROP POLICY IF EXISTS "Users can delete task photos for editable tasks" ON public.task_photos;
DROP POLICY IF EXISTS "Org members can view task photos" ON public.task_photos;
DROP POLICY IF EXISTS "Org members can upload task photos" ON public.task_photos;
DROP POLICY IF EXISTS "Org members can update task photos" ON public.task_photos;
DROP POLICY IF EXISTS "Org members can delete task photos" ON public.task_photos;

CREATE POLICY "Org members can view task photos"
ON public.task_photos
FOR SELECT
TO authenticated
USING (public.user_can_access_task_photos(task_id));

CREATE POLICY "Org members can upload task photos"
ON public.task_photos
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_can_access_task_photos(task_id)
  AND uploaded_by_user_id = auth.uid()
);

CREATE POLICY "Org members can update task photos"
ON public.task_photos
FOR UPDATE
TO authenticated
USING (public.user_can_access_task_photos(task_id))
WITH CHECK (public.user_can_access_task_photos(task_id));

CREATE POLICY "Org members can delete task photos"
ON public.task_photos
FOR DELETE
TO authenticated
USING (public.user_can_access_task_photos(task_id));
