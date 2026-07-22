-- Allow org admins to list all pending invitations for their organization
-- (previously only inviter / invitee email could SELECT, so TeamView could not surface invites).

DROP POLICY IF EXISTS "Org admins can see organization invitations" ON public.invitations;

CREATE POLICY "Org admins can see organization invitations"
ON public.invitations
FOR SELECT
USING (
  (select auth.uid()) IS NOT NULL
  AND organization_id IS NOT NULL
  AND public.is_org_admin(organization_id)
);
