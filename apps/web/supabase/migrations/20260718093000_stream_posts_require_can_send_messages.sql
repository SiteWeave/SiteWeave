-- Require can_send_messages (or admin/PM) to post in project chat.
DROP POLICY IF EXISTS "stream_posts_insert" ON public.project_stream_posts;
CREATE POLICY "stream_posts_insert"
ON public.project_stream_posts
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND project_id IN (SELECT public.get_accessible_project_ids())
  AND organization_id = (SELECT organization_id FROM public.projects WHERE id = project_id)
  AND (
    (SELECT public.user_has_permission('can_send_messages'))
    OR (SELECT public.is_user_admin())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.project_manager_id = auth.uid()
    )
  )
);
