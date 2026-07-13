# 🚀 SiteWeave B2B Deployment Checklist

Use this checklist to ensure a smooth deployment of your multi-tenant B2B architecture.

---

## Pre-Deployment

### Documentation Review
- [ ] Read `IMPLEMENTATION-COMPLETE.md` for overview
- [ ] Read `DEPLOYMENT-GUIDE-B2B.md` for detailed steps
- [ ] Review `QUICK-REFERENCE-B2B.md` for quick reference
- [ ] Understand the new architecture and data model

### Backup & Preparation
- [ ] Backup existing database (if applicable)
- [ ] Save current ../../schema.sql (if applicable)
- [ ] Note existing user credentials (if applicable)
- [ ] Prepare rollback plan (if needed)

### Environment Setup
- [ ] Supabase project is set up and accessible
- [ ] Database access confirmed (SQL Editor or psql)
- [ ] Node.js and npm installed locally
- [ ] Expo CLI installed (for mobile app)
- [ ] Git repository is up to date

---

## Database Deployment

### Schema Deployment
- [ ] Open Supabase SQL Editor
- [ ] Copy contents of `../../schema.sql`
- [ ] Paste and run in SQL Editor
- [ ] Wait for completion (1-2 minutes)
- [ ] Check for any errors in output
- [ ] Verify no red error messages

### Schema Validation
- [ ] Copy contents of `../../scripts/validate-schema.sql`
- [ ] Paste and run in SQL Editor
- [ ] Verify all checks show ✓ (checkmark)
- [ ] No EXCEPTION or WARNING messages
- [ ] All required tables exist
- [ ] All tables have organization_id
- [ ] RLS is enabled on all tables
- [ ] All helper functions exist

### Demo Account Creation
- [ ] Copy contents of `scripts/seed-demo-account.sql`
- [ ] Paste and run in SQL Editor
- [ ] Verify demo organization created
- [ ] Verify demo user created
- [ ] Verify demo role created
- [ ] Save demo credentials:
  - Email: demo@siteweave.app
  - Password: DemoPassword123!

### Storage Policies
- [ ] Copy contents of `scripts/setup-storage-policies.sql`
- [ ] Paste and run in SQL Editor
- [ ] Verify storage policies created
- [ ] No errors in output

### Database Testing
- [ ] Sign in with demo account
- [ ] Verify demo organization exists
- [ ] Verify demo projects exist
- [ ] Verify RLS is working (can't see other org data)

---

## Environment Variables

### Web App (.env or .env.local)
- [ ] Create/update `.env` file in project root
- [ ] Add `VITE_SUPABASE_URL=https://your-project.supabase.co`
- [ ] Add `VITE_SUPABASE_ANON_KEY=your-anon-key`
- [ ] Verify values are correct
- [ ] Save file

### Mobile App (apps/mobile/.env)
- [ ] Create/update `apps/mobile/.env` file
- [ ] Add `EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co`
- [ ] Add `EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`
- [ ] Verify values are correct
- [ ] Save file

---

## Web App Deployment

### Local Testing
- [ ] Run `npm install` in project root
- [ ] Run `npm run dev`
- [ ] Open http://localhost:5173
- [ ] Verify app loads without errors
- [ ] Test login with demo account
- [ ] Verify projects list loads
- [ ] Test creating a project
- [ ] Test editing a project
- [ ] Test duplicating a project
- [ ] Verify public sign-up is disabled
- [ ] Stop dev server

### Production Build
- [ ] Run `npm run build`
- [ ] Verify build completes without errors
- [ ] Check `dist/` folder exists
- [ ] Run `npm run preview` to test build
- [ ] Verify production build works correctly
- [ ] Stop preview server

### Deploy to Hosting (Netlify/Vercel/etc.)
- [ ] Connect Git repository to hosting platform
- [ ] Configure build settings:
  - Build command: `npm run build`
  - Publish directory: `dist`
- [ ] Add environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- [ ] Trigger deployment
- [ ] Wait for deployment to complete
- [ ] Verify deployment succeeded

### Production Testing (Web)
- [ ] Open deployed web app URL
- [ ] Verify app loads without errors
- [ ] Test login with demo account
- [ ] Verify projects list loads
- [ ] Test creating a project
- [ ] Test editing a project
- [ ] Test duplicating a project with date shifting
- [ ] Test inviting a user
- [ ] Test user management (if admin)
- [ ] Test role management (if admin)
- [ ] Test file upload/download
- [ ] Verify public sign-up is disabled (no sign-up button)

---

## Mobile App Deployment

### Local Setup
- [ ] Navigate to `apps/mobile` directory
- [ ] Run `npm install`
- [ ] Verify dependencies installed
- [ ] Run `npx expo start`
- [ ] Test on iOS simulator (if available)
- [ ] Test on Android emulator (if available)
- [ ] Verify app loads without errors
- [ ] Test login with demo account
- [ ] Stop Expo dev server

### EAS Build Configuration
- [ ] Run `npx expo login` (if not logged in)
- [ ] Run `eas build:configure` (if not already configured)
- [ ] Verify `eas.json` exists
- [ ] Review build profiles (production, preview, development)

### iOS Build
- [ ] Run `eas build --platform ios --profile production`
- [ ] Wait for build to complete (check Expo dashboard)
- [ ] Download IPA file (if needed for testing)
- [ ] Verify build succeeded

### Android Build
- [ ] Run `eas build --platform android --profile production`
- [ ] Wait for build to complete (check Expo dashboard)
- [ ] Download APK/AAB file (if needed for testing)
- [ ] Verify build succeeded

### iOS Submission
- [ ] Run `eas submit --platform ios --latest`
- [ ] Follow prompts to submit to App Store
- [ ] Add App Store review notes:
  ```
  Demo Account for Review:
  Email: demo@siteweave.app
  Password: DemoPassword123!
  
  This is a B2B construction management app.
  The demo account has sample projects and data for testing.
  
  Note: Public sign-up is disabled.
  Users must be invited by an Organization Admin.
  ```
- [ ] Submit for review
- [ ] Monitor submission status

### Android Submission
- [ ] Run `eas submit --platform android --latest`
- [ ] Follow prompts to submit to Google Play
- [ ] Add Play Store review notes (same as iOS)
- [ ] Submit for review
- [ ] Monitor submission status

### Production Testing (Mobile)
- [ ] Install app on test device
- [ ] Verify app launches without errors
- [ ] Test login with demo account
- [ ] Verify projects list loads
- [ ] Test viewing project details
- [ ] Test creating/editing tasks
- [ ] Test file upload
- [ ] Test deep linking (invitation link)
- [ ] Verify public sign-up is disabled

---

## Post-Deployment Verification

### Data Isolation Testing
- [ ] Create test organization A
- [ ] Create test user A in org A
- [ ] Create test project in org A
- [ ] Create test organization B
- [ ] Create test user B in org B
- [ ] Sign in as user A
- [ ] Verify user A can see org A projects
- [ ] Verify user A cannot see org B projects
- [ ] Sign in as user B
- [ ] Verify user B can see org B projects
- [ ] Verify user B cannot see org A projects

### Guest Access Testing
- [ ] Create project in org A
- [ ] Add user B as project collaborator
- [ ] Sign in as user B
- [ ] Verify user B can access the specific project
- [ ] Verify user B cannot see other org A projects
- [ ] Verify access level works (viewer/editor/admin)

### Permission Testing
- [ ] Create custom role with limited permissions
- [ ] Assign test user to custom role
- [ ] Sign in as test user
- [ ] Verify user can only perform allowed actions
- [ ] Verify restricted actions are blocked

### Invitation Flow Testing
- [ ] Sign in as organization admin
- [ ] Invite new user (use test email)
- [ ] Check email for invitation link
- [ ] Click invitation link
- [ ] Verify redirected to sign-up page
- [ ] Create account
- [ ] Verify user is linked to organization
- [ ] Verify user has assigned role
- [ ] Verify user can access organization's projects

### Project Duplication Testing
- [ ] Create project with tasks and phases
- [ ] Set project start date
- [ ] Click "Duplicate Project"
- [ ] Enter new name and new start date
- [ ] Verify project is duplicated
- [ ] Verify dates are shifted correctly
- [ ] Verify tasks and phases are copied
- [ ] Verify comments/files are NOT copied

### Storage Security Testing
- [ ] Upload file to project in org A
- [ ] Sign in as user from org A
- [ ] Verify user can access file
- [ ] Sign in as user from org B
- [ ] Verify user cannot access file
- [ ] Add user B as project collaborator
- [ ] Verify user B can now access file

---

## Monitoring Setup

### Database Monitoring
- [ ] Enable Supabase database monitoring
- [ ] Set up alerts for slow queries
- [ ] Monitor RLS policy performance
- [ ] Track storage usage per organization

### Application Monitoring
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Monitor API response times
- [ ] Track user activity and engagement
- [ ] Set up uptime monitoring

### Security Monitoring
- [ ] Monitor failed login attempts
- [ ] Track permission denied errors
- [ ] Review RLS policy violations
- [ ] Monitor storage access patterns

---

## Documentation & Handoff

### Internal Documentation
- [ ] Document deployment process (this checklist)
- [ ] Document troubleshooting steps
- [ ] Document common issues and solutions
- [ ] Create runbook for operations team

### User Documentation
- [ ] Create user guide (getting started)
- [ ] Create admin guide (managing users/roles)
- [ ] Create video tutorials (optional)
- [ ] Update help center/FAQ

### Team Training
- [ ] Train support team on new architecture
- [ ] Train admins on user management
- [ ] Train admins on role management
- [ ] Train users on invitation flow

---

## Final Checks

### Security
- [ ] RLS is enabled on all tables
- [ ] Storage policies are configured
- [ ] Public sign-up is disabled
- [ ] Invitation-based onboarding works
- [ ] Data isolation is enforced
- [ ] Guest access is limited to specific projects
- [ ] Permissions are enforced at all levels

### Functionality
- [ ] Users can sign in
- [ ] Users can be invited
- [ ] Projects can be created/edited/deleted
- [ ] Tasks can be created/edited/deleted
- [ ] Files can be uploaded/downloaded
- [ ] Projects can be duplicated with date shifting
- [ ] Roles can be created/edited (by admins)
- [ ] Users can be managed (by admins)
- [ ] Project collaborators can be added

### Performance
- [ ] Page load times are acceptable
- [ ] Database queries are fast
- [ ] File uploads/downloads work smoothly
- [ ] Mobile app is responsive
- [ ] No memory leaks or crashes

### User Experience
- [ ] UI is intuitive and easy to use
- [ ] Error messages are clear and helpful
- [ ] Loading states are visible
- [ ] Success messages confirm actions
- [ ] Navigation is smooth

---

## Rollback Plan (If Needed)

### If Issues Arise
- [ ] Document the issue
- [ ] Assess severity (critical/major/minor)
- [ ] Decide: fix forward or rollback

### Rollback Steps (If Necessary)
- [ ] Restore database backup
- [ ] Redeploy previous web app version
- [ ] Redeploy previous mobile app version (if possible)
- [ ] Notify users of rollback
- [ ] Investigate and fix issues
- [ ] Plan re-deployment

---

## Success Criteria

Your deployment is successful when:

✅ **Database**
- All tables created
- RLS enabled and working
- Helper functions working
- Storage policies configured
- Demo account accessible

✅ **Authentication**
- Users can sign in
- Public sign-up disabled
- Invitation flow works
- Users linked to organizations

✅ **Authorization**
- Dynamic roles work
- Permissions enforced
- Admins can manage users/roles
- Data isolation working

✅ **Features**
- Projects can be created/edited/deleted
- Project duplication works with date shifting
- Guest access works for collaborators
- File storage works and is secure
- Mobile app works with deep linking

✅ **Security**
- Data isolated between organizations
- Guest access limited to specific projects
- Permissions enforced at all levels
- Storage files respect org boundaries

✅ **Performance**
- App loads quickly
- Queries are fast
- No errors in console
- Mobile app is responsive

---

## Post-Deployment Tasks

### Immediate (First 24 Hours)
- [ ] Monitor for errors and issues
- [ ] Respond to user feedback
- [ ] Fix critical bugs (if any)
- [ ] Monitor database performance
- [ ] Monitor storage usage

### Short-Term (First Week)
- [ ] Gather user feedback
- [ ] Analyze usage patterns
- [ ] Optimize slow queries (if any)
- [ ] Update documentation based on feedback
- [ ] Plan next iteration

### Ongoing
- [ ] Regular database maintenance
- [ ] Monitor and optimize performance
- [ ] Update documentation as needed
- [ ] Plan and implement enhancements
- [ ] Keep dependencies up to date

---

## Congratulations! 🎉

If you've completed all items in this checklist, your multi-tenant B2B SiteWeave is now live!

**Next Steps:**
1. Monitor the deployment closely for the first few days
2. Gather user feedback and iterate
3. Plan future enhancements
4. Celebrate your successful deployment! 🚀

---

**Deployment Date:** _________________  
**Deployed By:** _________________  
**Version:** 1.0.0  
**Architecture:** Multi-Tenant B2B  

---

## Need Help?

- Review `DEPLOYMENT-GUIDE-B2B.md` for detailed instructions
- Check `QUICK-REFERENCE-B2B.md` for quick answers
- Review `MULTI-TENANT-B2B-IMPLEMENTATION.md` for technical details
- Check Supabase logs for errors
- Test with demo account first

