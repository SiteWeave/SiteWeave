-- Member role should not include activity history (Org Admin and PM may still have it).

UPDATE public.roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"can_view_activity_history": false}'::jsonb,
    updated_at = now()
WHERE name = 'Member'
  AND organization_id IS NOT NULL;
