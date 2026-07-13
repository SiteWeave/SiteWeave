# SiteWeave B2B Multi-Tenant Deployment Guide

## Prerequisites

- [ ] Supabase project set up
- [ ] Database access (SQL Editor or psql)
- [ ] Node.js and npm/yarn installed
- [ ] Expo CLI installed (for mobile app)
- [ ] Access to Supabase Storage buckets

---

## Step 1: Database Deployment

### Option A: Fresh Database (Recommended for Test/Demo)

1. **Backup existing data** (if any):
   ```sql
   -- Run in Supabase SQL Editor
   -- This will export your current data (if needed)
   ```

2. **Deploy the new schema**:
   - Open Supabase SQL Editor
   - Copy and paste the entire contents of `../../schema.sql`
   - Click "Run"
   - Wait for completion (may take 1-2 minutes)

3. **Validate the schema**:
   - Copy and paste the contents of `../../scripts/validate-schema.sql`
   - Click "Run"
   - Check for any errors or warnings in the output
   - All checks should show ✓ (checkmark)

4. **Create demo account** (for App Store review):
   - Copy and paste the contents of `scripts/seed-demo-account.sql`
   - Click "Run"
   - Note the demo credentials:
     - Email: `demo@siteweave.app`
     - Password: `DemoPassword123!`

5. **Update storage policies**:
   - Copy and paste the contents of `scripts/setup-storage-policies.sql`
   - Click "Run"

### Option B: Migrate Existing Database

⚠️ **Warning**: This will delete existing data. Only use if you have test data you don't need.

1. **Run migration script**:
   - Open Supabase SQL Editor
   - Copy and paste the contents of `scripts/migrate-to-organizations.sql`
   - Click "Run"
   - This will:
     - Create new tables (organizations, roles, project_collaborators)
     - Add organization_id columns to existing tables
     - Clean up orphaned data
     - Update RLS policies

2. **Validate the migration**:
   - Run `../../scripts/validate-schema.sql` (see Option A, step 3)

3. **Create demo account**:
   - Run `scripts/seed-demo-account.sql` (see Option A, step 4)

4. **Update storage policies**:
   - Run `scripts/setup-storage-policies.sql` (see Option A, step 5)

---

## Step 2: Environment Variables

### Web App

Update `.env` or `.env.local` (create if doesn't exist):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Mobile App

Update `apps/mobile/.env` (create if doesn't exist):

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Step 3: Web App Deployment

### Local Testing

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:5173
```

### Production Build

```bash
# Build for production
npm run build

# Test production build locally
npm run preview
```

### Deploy to Netlify (Recommended)

1. **Connect repository**:
   - Go to Netlify dashboard
   - Click "Add new site" → "Import an existing project"
   - Connect your Git repository

2. **Configure build settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Environment variables: Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

3. **Deploy**:
   - Click "Deploy site"
   - Wait for build to complete
   - Test the deployed site

---

## Step 4: Mobile App Deployment

### iOS (App Store)

1. **Update app configuration**:
   ```bash
   cd apps/mobile
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure EAS Build**:
   ```bash
   # Login to Expo
   npx expo login

   # Configure EAS
   eas build:configure
   ```

4. **Build for iOS**:
   ```bash
   # Production build
   eas build --platform ios --profile production

   # Wait for build to complete (check status on Expo dashboard)
   ```

5. **Submit to App Store**:
   ```bash
   eas submit --platform ios --latest
   ```

6. **App Store Review Notes**:
   Add this to your reviewer notes:
   ```
   Demo Account for Review:
   Email: demo@siteweave.app
   Password: DemoPassword123!

   This is a B2B construction management app. The demo account has sample projects and data for testing.
   
   Note: Public sign-up is disabled. Users must be invited by an Organization Admin.
   ```

### Android (Google Play)

1. **Build for Android**:
   ```bash
   cd apps/mobile
   eas build --platform android --profile production
   ```

2. **Submit to Google Play**:
   ```bash
   eas submit --platform android --latest
   ```

3. **Play Store Review Notes**:
   Same as iOS (see above)

---

## Step 5: Post-Deployment Verification

### Database Checks

1. **Verify RLS is working**:
   ```sql
   -- Create a test organization
   INSERT INTO organizations (name, slug)
   VALUES ('Test Org', 'test-org')
   RETURNING id;
   
   -- Create a test role
   INSERT INTO roles (organization_id, name, permissions, is_system_role)
   VALUES (
     '<org-id-from-above>',
     'Test Admin',
     '{"can_create_projects": true, "can_delete_projects": true, "can_manage_users": true}'::jsonb,
     false
   )
   RETURNING id;
   
   -- Verify data isolation (should return 0 rows for different org)
   SELECT COUNT(*) FROM projects WHERE organization_id != '<org-id-from-above>';
   ```

2. **Test demo account**:
   - Sign in with `demo@siteweave.app` / `DemoPassword123!`
   - Verify you can see demo projects
   - Verify you can create/edit projects
   - Verify you can invite users

### Web App Checks

- [ ] Can sign in with demo account
- [ ] Can see projects list
- [ ] Can create new project
- [ ] Can edit existing project
- [ ] Can duplicate project (with date shifting)
- [ ] Can invite users to organization
- [ ] Can manage roles (if admin)
- [ ] Can add project collaborators
- [ ] Can upload/download files
- [ ] Public sign-up is disabled (no sign-up button on login page)

### Mobile App Checks

- [ ] Can sign in with demo account
- [ ] Can see projects list
- [ ] Can view project details
- [ ] Can create/edit tasks
- [ ] Can upload photos
- [ ] Deep linking works (test with invitation link)
- [ ] Public sign-up is disabled

### Security Checks

1. **Test data isolation**:
   - Create two test organizations
   - Create users in each organization
   - Verify users can't see each other's data

2. **Test guest access**:
   - Create a project in Org A
   - Add a user from Org B as a collaborator
   - Verify the user can access the project
   - Verify the user can't see other projects in Org A

3. **Test permissions**:
   - Create a custom role with limited permissions
   - Assign a user to that role
   - Verify the user can only perform allowed actions

---

## Step 6: Create Your First Organization

### For Super Admin

1. **Sign in to Supabase Dashboard**
2. **Go to SQL Editor**
3. **Create your organization**:
   ```sql
   -- Create organization
   INSERT INTO organizations (name, slug, created_by_user_id)
   VALUES ('Your Company Name', 'your-company', '<your-user-id>')
   RETURNING id;
   
   -- Create admin role for this organization
   INSERT INTO roles (organization_id, name, permissions, is_system_role)
   VALUES (
     '<org-id-from-above>',
     'Organization Admin',
     '{
       "can_create_projects": true,
       "can_edit_projects": true,
       "can_delete_projects": true,
       "can_view_projects": true,
       "can_create_tasks": true,
       "can_edit_tasks": true,
       "can_delete_tasks": true,
       "can_manage_users": true,
       "can_manage_roles": true,
       "can_invite_users": true,
       "can_view_financials": true,
       "can_manage_settings": true
     }'::jsonb,
     true
   )
   RETURNING id;
   
   -- Assign yourself to this organization
   UPDATE profiles
   SET organization_id = '<org-id>',
       role_id = '<role-id>',
       is_super_admin = true
   WHERE id = '<your-user-id>';
   ```

4. **Sign out and sign back in**
5. **Verify you can see the organization name in the app**

### For Regular Users

Organizations are created by Super Admins. Regular users are invited by Organization Admins.

---

## Step 7: Invite Your First Team Member

1. **Sign in as Organization Admin**
2. **Go to Settings → Team Management** (or User Management)
3. **Click "Invite User"**
4. **Enter email and select role**
5. **Click "Send Invitation"**
6. **User receives email with invitation link**
7. **User clicks link, creates account, and joins organization**

---

## Troubleshooting

### Issue: "organization_id cannot be null" error

**Solution**: Verify the user has been assigned to an organization:
```sql
SELECT id, organization_id, role_id FROM profiles WHERE id = '<user-id>';
```

If `organization_id` is NULL, assign the user:
```sql
UPDATE profiles
SET organization_id = '<org-id>',
    role_id = '<role-id>'
WHERE id = '<user-id>';
```

### Issue: User can't see any data

**Solution**: Check RLS policies are enabled:
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

All tables should have `rowsecurity = true`.

### Issue: Invitation link doesn't work

**Solution**: Check invitation status:
```sql
SELECT * FROM invitations WHERE invitation_token = '<token>';
```

Verify:
- `status` is 'pending' (not 'accepted' or 'expired')
- `expires_at` is in the future
- `organization_id` is not NULL

### Issue: Storage files not accessible

**Solution**: Verify storage policies are set up:
```sql
-- Check if storage policies exist
SELECT * FROM pg_policies WHERE tablename = 'objects';
```

If no policies exist, run `scripts/setup-storage-policies.sql`.

### Issue: Permission denied errors

**Solution**: Check user's role permissions:
```sql
SELECT r.name, r.permissions
FROM profiles p
JOIN roles r ON p.role_id = r.id
WHERE p.id = '<user-id>';
```

Verify the role has the required permissions in the JSONB column.

---

## Rollback Plan

If you need to rollback to the previous single-user model:

1. **Restore database backup** (if you created one)
2. **OR redeploy ../../schema.sql** (if you have it saved)
3. **Redeploy previous version of web/mobile apps**

⚠️ **Note**: Rollback will lose all organization, role, and collaborator data.

---

## Monitoring & Maintenance

### Database Performance

Monitor slow queries:
```sql
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Storage Usage

Monitor storage per organization:
```sql
SELECT 
  o.name,
  COUNT(f.id) as file_count,
  SUM(f.size) as total_size_bytes
FROM organizations o
LEFT JOIN files f ON f.organization_id = o.id
GROUP BY o.id, o.name
ORDER BY total_size_bytes DESC;
```

### User Activity

Monitor active users per organization:
```sql
SELECT 
  o.name,
  COUNT(DISTINCT p.id) as user_count,
  COUNT(DISTINCT CASE WHEN p.updated_at > NOW() - INTERVAL '7 days' THEN p.id END) as active_last_7_days
FROM organizations o
LEFT JOIN profiles p ON p.organization_id = o.id
GROUP BY o.id, o.name
ORDER BY user_count DESC;
```

---

## Support

For issues or questions:
1. Check this deployment guide
2. Review `MULTI-TENANT-B2B-IMPLEMENTATION.md`
3. Check Supabase logs for errors
4. Review RLS policies in `../../schema.sql`

---

## Checklist

### Pre-Deployment
- [ ] Database backup created (if needed)
- [ ] Environment variables configured
- [ ] Demo account credentials saved
- [ ] App Store review notes prepared

### Deployment
- [ ] Database schema deployed
- [ ] Schema validation passed
- [ ] Demo account created
- [ ] Storage policies updated
- [ ] Web app deployed
- [ ] Mobile app built and submitted

### Post-Deployment
- [ ] Database checks passed
- [ ] Web app checks passed
- [ ] Mobile app checks passed
- [ ] Security checks passed
- [ ] First organization created
- [ ] First team member invited
- [ ] Monitoring set up

---

## Success Criteria

Your deployment is successful when:
- ✅ Demo account can sign in and see sample data
- ✅ Users can be invited and join organizations
- ✅ Data isolation is working (users can't see other orgs' data)
- ✅ Guest access is working (collaborators can access specific projects)
- ✅ Permissions are enforced (users can only perform allowed actions)
- ✅ Project duplication works with date shifting
- ✅ Storage files are accessible and secure
- ✅ Mobile deep linking works for invitations

**Congratulations! Your multi-tenant B2B SiteWeave is now live! 🎉**

