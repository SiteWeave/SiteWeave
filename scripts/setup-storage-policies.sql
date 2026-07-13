-- ============================================================================
-- STORAGE POLICIES SETUP SCRIPT
-- Run this script in your Supabase SQL Editor after creating storage buckets
-- Updated for Multi-Tenant B2B Architecture with Organization and Guest Access
-- ============================================================================

-- Helper function to check if user has access to file via organization or project collaboration
-- Note: This assumes file paths include organization_id or project_id
-- Example path structure: {organization_id}/{project_id}/filename.ext
CREATE OR REPLACE FUNCTION has_storage_file_access(file_path TEXT, bucket_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  path_parts TEXT[];
  parsed_org_id UUID;
  parsed_project_id UUID;
BEGIN
  -- Parse file path to extract organization_id and project_id
  -- Expected format: {organization_id}/{project_id}/filename.ext or {organization_id}/filename.ext
  path_parts := string_to_array(file_path, '/');
  
  -- Try to extract organization_id from path (first segment)
  IF array_length(path_parts, 1) >= 1 THEN
    BEGIN
      parsed_org_id := path_parts[1]::UUID;
    EXCEPTION WHEN OTHERS THEN
      parsed_org_id := NULL;
    END;
  END IF;
  
  -- Try to extract project_id from path (second segment, if exists)
  IF array_length(path_parts, 1) >= 2 THEN
    BEGIN
      parsed_project_id := path_parts[2]::UUID;
    EXCEPTION WHEN OTHERS THEN
      parsed_project_id := NULL;
    END;
  END IF;
  
  -- Check if user is organization member
  IF parsed_org_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND organization_id = parsed_org_id
    ) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Check if user is project collaborator (guest access)
  IF parsed_project_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.project_collaborators
      WHERE project_id = parsed_project_id AND user_id = auth.uid()
    ) THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Task photo paths use: {organization_id}/{project_id}/{task_id}/original/... or thumb/...
CREATE OR REPLACE FUNCTION user_can_access_task_photos(task_uuid UUID)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION can_access_task_photo_object(file_path TEXT, require_manage BOOLEAN DEFAULT false)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- message_files BUCKET POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload message files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read message files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own message files" ON storage.objects;
DROP POLICY IF EXISTS "Public can read message files" ON storage.objects;

-- Allow authenticated users to upload files to message_files bucket (organization members only)
CREATE POLICY "Users can upload message files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message_files'
  AND has_storage_file_access(name, 'message_files')
);

-- Allow authenticated users to read files from message_files bucket (org members OR project collaborators)
CREATE POLICY "Users can read message files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'message_files'
  AND has_storage_file_access(name, 'message_files')
);

-- Allow authenticated users to delete files from message_files bucket
-- Organization admins or file owners can delete
CREATE POLICY "Users can delete message files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'message_files'
  AND (
    has_storage_file_access(name, 'message_files')
    OR
    (storage.foldername(name))[1] IN (
      SELECT organization_id::TEXT FROM public.profiles WHERE id = auth.uid()
    )
  )
);

-- ============================================================================
-- files BUCKET POLICIES (if you're using it)
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete project files" ON storage.objects;

-- Allow authenticated users to upload files to files bucket (organization members OR project collaborators with editor/admin access)
CREATE POLICY "Users can upload project files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'files'
  AND has_storage_file_access(name, 'files')
);

-- Allow authenticated users to read files from files bucket (org members OR project collaborators)
CREATE POLICY "Users can read project files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'files'
  AND has_storage_file_access(name, 'files')
);

-- Allow authenticated users to delete files from files bucket
-- Organization admins or project collaborators with admin access can delete
CREATE POLICY "Users can delete project files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'files'
  AND (
    has_storage_file_access(name, 'files')
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
        AND r.permissions->>'can_delete_projects' = 'true'
        AND (storage.foldername(name))[1] = p.organization_id::TEXT
    )
  )
);

-- ============================================================================
-- task_photos BUCKET POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can upload task photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read task photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update task photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete task photos" ON storage.objects;

CREATE POLICY "Users can upload task photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'task_photos'
  AND can_access_task_photo_object(name, true)
);

CREATE POLICY "Users can read task photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'task_photos'
  AND can_access_task_photo_object(name, false)
);

CREATE POLICY "Users can update task photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'task_photos'
  AND can_access_task_photo_object(name, true)
)
WITH CHECK (
  bucket_id = 'task_photos'
  AND can_access_task_photo_object(name, true)
);

CREATE POLICY "Users can delete task photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'task_photos'
  AND can_access_task_photo_object(name, true)
);

