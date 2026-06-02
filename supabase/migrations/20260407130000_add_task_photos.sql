-- Add task photo support with private storage and task-aware RLS.

CREATE TABLE IF NOT EXISTS public.task_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    storage_bucket TEXT NOT NULL DEFAULT 'task_photos',
    storage_path TEXT NOT NULL UNIQUE,
    thumbnail_path TEXT,
    caption TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_completion_photo BOOLEAN NOT NULL DEFAULT false,
    uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    mime_type TEXT,
    original_filename TEXT,
    file_size_bytes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_photos IS 'Stores task photo metadata and private storage paths for originals and thumbnails.';
COMMENT ON COLUMN public.task_photos.storage_path IS 'Private path to the uploaded original image in Supabase Storage.';
COMMENT ON COLUMN public.task_photos.thumbnail_path IS 'Private path to the derived thumbnail image in Supabase Storage.';
COMMENT ON COLUMN public.task_photos.is_completion_photo IS 'Marks photos that should be emphasized as completion evidence.';

CREATE OR REPLACE FUNCTION public.set_task_photo_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    task_row public.tasks%ROWTYPE;
BEGIN
    SELECT *
    INTO task_row
    FROM public.tasks
    WHERE id = NEW.task_id;

    IF task_row.id IS NULL THEN
        RAISE EXCEPTION 'Task % not found for task photo', NEW.task_id;
    END IF;

    NEW.project_id := task_row.project_id;
    NEW.organization_id := task_row.organization_id;
    NEW.updated_at := now();

    IF NEW.storage_bucket IS NULL OR btrim(NEW.storage_bucket) = '' THEN
        NEW.storage_bucket := 'task_photos';
    END IF;

    IF NEW.sort_order IS NULL THEN
        NEW.sort_order := 0;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_task_photo_scope ON public.task_photos;
CREATE TRIGGER set_task_photo_scope
BEFORE INSERT OR UPDATE ON public.task_photos
FOR EACH ROW
EXECUTE FUNCTION public.set_task_photo_scope();

CREATE OR REPLACE FUNCTION public.can_view_task(task_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_uuid
          AND (
            t.project_id IN (SELECT id FROM public.projects)
            OR (
                t.assignee_id IS NOT NULL
                AND t.assignee_id = (SELECT public.get_user_contact_id())
                AND (SELECT public.get_user_contact_id()) IS NOT NULL
                AND t.organization_id = (SELECT public.get_user_organization_id())
            )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_task(task_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_uuid
          AND (
            t.assignee_id IN (
                SELECT p.contact_id
                FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.contact_id IS NOT NULL
            )
            OR t.project_id IN (
                SELECT id
                FROM public.projects
                WHERE project_manager_id = auth.uid()
                   OR (SELECT public.get_user_role()) = 'Admin'
            )
          )
    );
$$;

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see task photos for visible tasks" ON public.task_photos;
CREATE POLICY "Users can see task photos for visible tasks"
ON public.task_photos
FOR SELECT
USING (public.can_view_task(task_id));

DROP POLICY IF EXISTS "Users can manage task photos for editable tasks" ON public.task_photos;
CREATE POLICY "Users can manage task photos for editable tasks"
ON public.task_photos
FOR INSERT
WITH CHECK (
    public.can_manage_task(task_id)
    AND uploaded_by_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can update task photos for editable tasks" ON public.task_photos;
CREATE POLICY "Users can update task photos for editable tasks"
ON public.task_photos
FOR UPDATE
USING (public.can_manage_task(task_id))
WITH CHECK (public.can_manage_task(task_id));

DROP POLICY IF EXISTS "Users can delete task photos for editable tasks" ON public.task_photos;
CREATE POLICY "Users can delete task photos for editable tasks"
ON public.task_photos
FOR DELETE
USING (public.can_manage_task(task_id));

CREATE INDEX IF NOT EXISTS idx_task_photos_task_id
    ON public.task_photos(task_id);

CREATE INDEX IF NOT EXISTS idx_task_photos_project_id
    ON public.task_photos(project_id);

CREATE INDEX IF NOT EXISTS idx_task_photos_organization_id
    ON public.task_photos(organization_id);

CREATE INDEX IF NOT EXISTS idx_task_photos_task_sort_order
    ON public.task_photos(task_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_task_photos_completion
    ON public.task_photos(task_id, is_completion_photo)
    WHERE is_completion_photo = true;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'task_photos',
    'task_photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

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
        RETURN public.can_manage_task(parsed_task_id);
    END IF;

    RETURN public.can_view_task(parsed_task_id);
END;
$$;

DROP POLICY IF EXISTS "Users can upload task photos" ON storage.objects;
CREATE POLICY "Users can upload task photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'task_photos'
    AND public.can_access_task_photo_object(name, true)
);

DROP POLICY IF EXISTS "Users can read task photos" ON storage.objects;
CREATE POLICY "Users can read task photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'task_photos'
    AND public.can_access_task_photo_object(name, false)
);

DROP POLICY IF EXISTS "Users can update task photos" ON storage.objects;
CREATE POLICY "Users can update task photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'task_photos'
    AND public.can_access_task_photo_object(name, true)
)
WITH CHECK (
    bucket_id = 'task_photos'
    AND public.can_access_task_photo_object(name, true)
);

DROP POLICY IF EXISTS "Users can delete task photos" ON storage.objects;
CREATE POLICY "Users can delete task photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'task_photos'
    AND public.can_access_task_photo_object(name, true)
);

-- Data API: explicit grants (RLS enforces row access)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_photos TO authenticated;
GRANT ALL ON TABLE public.task_photos TO service_role;
