# Fix invite role permissions — operations guide

Use this when a user accepted an org invite but cannot create/edit projects or sees a locked-down app. The usual cause is `profiles.role_id` being null while `profiles.organization_id` is set.

## Diagnose

```sql
SELECT p.id, p.organization_id, p.role_id, c.email, c.name, r.name AS role_name
FROM profiles p
LEFT JOIN contacts c ON c.id = p.contact_id
LEFT JOIN roles r ON r.id = p.role_id
WHERE c.email ILIKE '%user@example.com%';
```

If `role_id` is null, assign a role from the same organization.

## Fix one user (Project Manager)

```sql
UPDATE profiles p
SET role_id = r.id
FROM roles r
WHERE p.id = '<user_uuid>'
  AND p.organization_id = r.organization_id
  AND r.name = 'Project Manager'
  AND p.role_id IS NULL;
```

## Fix one user (Member)

```sql
UPDATE profiles p
SET role_id = r.id
FROM roles r
WHERE p.id = '<user_uuid>'
  AND p.organization_id = r.organization_id
  AND r.name = 'Member'
  AND p.role_id IS NULL;
```

## Ensure default roles exist for an org

Run migration `20260603120000_backfill_default_org_roles.sql`, or invoke the `ensure-org-default-roles` edge function as an org admin.

## After SQL fix

Ask the user to sign out and sign back in (or hard refresh) so the client reloads `userRole` from `profiles.role_id`.

## Concepts

- **App permissions role** — `profiles.role_id` → `roles.permissions` (sidebar, create project, manage team).
- **Job title / project role** — `contacts.role`, `project_contacts.role` (labels only; does not grant app permissions).

Setting someone’s job title to “Project Manager” in Contacts does not grant PM app permissions. Use **Team → Manage Members** to set the app permissions role.
