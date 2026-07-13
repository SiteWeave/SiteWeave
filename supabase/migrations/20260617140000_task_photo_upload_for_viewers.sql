-- Allow anyone who can view a task to upload task photos (org members, collaborators, assignees).
-- Read access was already gated by can_view_task; upload previously required can_manage_task.

DROP POLICY IF EXISTS "Users can manage task photos for editable tasks" ON public.task_photos;
DROP POLICY IF EXISTS "Users can upload task photos for visible tasks" ON public.task_photos;

CREATE POLICY "Users can upload task photos for visible tasks"
ON public.task_photos
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_view_task(task_id)
  AND uploaded_by_user_id = auth.uid()
);

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

  IF require_manage THEN
    RETURN public.can_view_task(parsed_task_id);
  END IF;

  RETURN public.can_view_task(parsed_task_id);
END;
$$;
