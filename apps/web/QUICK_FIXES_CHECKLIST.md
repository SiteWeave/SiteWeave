# Quick Fixes Checklist for Monday Launch

## Critical Issues to Fix Before Launch

### 1. Setup Wizard Not Showing
**Symptom**: Setup wizard doesn't appear for new Org Admins

**Check**:
- [ ] Verify `localStorage.getItem('setup_complete_${userId}')` logic in App.jsx
- [ ] Check if `state.userRole` is loaded before checking
- [ ] Verify role name is exactly "Org Admin" (case-sensitive)
- [ ] Check browser console for errors

**Fix**: If wizard doesn't show, manually clear localStorage:
```javascript
localStorage.removeItem(`setup_complete_${userId}`)
```

---

### 2. Invitation Emails Not Sending
**Symptom**: No email received when inviting team members

**Check**:
- [ ] Verify `RESEND_API_KEY` is set in Supabase secrets
- [ ] Check edge function logs: `supabase functions logs team-invite`
- [ ] Verify email domain is verified in Resend dashboard
- [ ] Check spam folder

**Fix**:
```bash
# Check secrets
supabase secrets list

# Set if missing
supabase secrets set RESEND_API_KEY=your_key_here

# Check logs
supabase functions logs team-invite --follow
```

---

### 3. Organization Not Loading (Mobile)
**Symptom**: Mobile app shows "No Organization Found"

**Check**:
- [ ] Verify `loadUserOrganization()` function in AuthContext
- [ ] Check profiles table has `organization_id` set
- [ ] Verify query includes `organizations` join
- [ ] Check for foreign key errors

**Fix**: Ensure profile has organization_id:
```sql
UPDATE profiles 
SET organization_id = 'org-id-here' 
WHERE id = 'user-id-here';
```

---

### 4. Duplicate Role Error
**Symptom**: "duplicate key value violates unique constraint" when creating roles

**Check**:
- [ ] Verify `handleFinish` in SetupWizardModal fetches existing roles first
- [ ] Check role name is case-insensitive in comparison
- [ ] Verify unique constraint on `(organization_id, name)`

**Fix**: Already handled in code - fetches existing roles before creating

---

### 5. Foreign Key Ambiguity Errors
**Symptom**: "Could not embed because more than one relationship was found"

**Check**:
- [ ] Verify queries use explicit foreign key: `contacts!fk_profiles_contact`
- [ ] Check all queries in:
  - `virtualContactsService.js`
  - `TeamDirectory.jsx`
  - `userManagementService.js`

**Fix**: Use explicit foreign key syntax:
```javascript
.select('*, contacts!fk_profiles_contact(*)')
```

---

### 6. RLS Policy Errors
**Symptom**: "new row violates row-level security policy"

**Check**:
- [ ] Verify RLS is enabled on all tables
- [ ] Check policies allow INSERT for organization members
- [ ] Verify `can_manage_team` permission check

**Fix**: Run RLS policy scripts:
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Enable RLS if needed
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
```

---

### 7. Edge Function CORS Errors
**Symptom**: CORS errors when calling edge functions

**Check**:
- [ ] Verify CORS headers in edge functions
- [ ] Check Authorization header is sent
- [ ] Verify function is deployed

**Fix**: Ensure edge functions have CORS headers:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

---

### 8. Invitation Token Not Working
**Symptom**: Invitation link shows "Invalid or expired"

**Check**:
- [ ] Verify token is generated correctly
- [ ] Check invitation status is 'pending'
- [ ] Verify expiration date (7 days)
- [ ] Check token format matches

**Fix**: Check invitation in database:
```sql
SELECT * FROM invitations 
WHERE invitation_token = 'token-here' 
AND status = 'pending';
```

---

### 9. Team Members Not Visible
**Symptom**: Team Directory is empty or missing members

**Check**:
- [ ] Verify `organization_id` is set on all profiles
- [ ] Check RLS policies allow SELECT
- [ ] Verify foreign key relationship
- [ ] Check for null organization_id

**Fix**: Update profiles:
```sql
UPDATE profiles 
SET organization_id = 'org-id' 
WHERE id IN (SELECT id FROM profiles WHERE organization_id IS NULL);
```

---

### 10. Setup Wizard Stuck
**Symptom**: Setup wizard won't close after completion

**Check**:
- [ ] Verify `localStorage.setItem` is called in `handleFinish`
- [ ] Check for errors in console
- [ ] Verify `onComplete` callback is called

**Fix**: Manually mark as complete:
```javascript
localStorage.setItem(`setup_complete_${userId}`, 'true');
window.location.reload();
```

---

## Pre-Launch Verification Steps

### Database
- [ ] All tables have `organization_id` column
- [ ] RLS policies are enabled
- [ ] Foreign keys are set correctly
- [ ] Indexes are created
- [ ] Default roles exist for new organizations

### Edge Functions
- [ ] All functions are deployed
- [ ] Environment variables are set
- [ ] CORS headers are configured
- [ ] Error handling is in place

### Frontend
- [ ] Setup wizard appears for new admins
- [ ] Invitation flow works
- [ ] Team directory shows members
- [ ] Role management works
- [ ] No console errors

### Mobile
- [ ] Organization loads on login
- [ ] Organization name appears in header
- [ ] Projects filtered by organization
- [ ] No "No Organization" errors

### Email
- [ ] Resend API key is set
- [ ] Domain is verified
- [ ] Email templates are correct
- [ ] Invitation emails are sent

---

## Emergency Commands

### Clear Setup Wizard Flag
```javascript
// In browser console
localStorage.removeItem(`setup_complete_${userId}`);
```

### Check Edge Function Status
```bash
supabase functions list
supabase functions logs team-invite --follow
```

### Verify Database Schema
```sql
-- Check organizations
SELECT COUNT(*) FROM organizations;

-- Check roles
SELECT COUNT(*) FROM roles;

-- Check invitations
SELECT status, COUNT(*) FROM invitations GROUP BY status;

-- Check profiles with organization
SELECT COUNT(*) FROM profiles WHERE organization_id IS NOT NULL;
```

### Test Organization Creation
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/create-org-admin \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "orgName": "Test Org",
    "orgSlug": "test-org",
    "adminEmail": "test@example.com",
    "adminPassword": "Test123!",
    "adminName": "Test Admin"
  }'
```

---

## Common Error Messages & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "No authorization header" | Missing auth token | Check session is valid |
| "Not authorized - can_manage_team" | User lacks permission | Verify role permissions |
| "duplicate key value" | Role/org already exists | Fetch existing before creating |
| "relation does not exist" | Table missing | Run ../../schema.sql |
| "RLS policy violation" | Policy too restrictive | Check RLS policies |
| "Foreign key ambiguity" | Multiple relationships | Use explicit FK syntax |
| "Invalid or expired invitation" | Token issue | Check invitation status |

---

## Testing Checklist

Before the meeting:
- [ ] Test organization creation
- [ ] Test setup wizard
- [ ] Test role creation
- [ ] Test team invitation
- [ ] Test invitation acceptance
- [ ] Test team directory
- [ ] Test mobile app login
- [ ] Test email delivery

During the meeting:
- [ ] Have backup plan if something fails
- [ ] Know how to manually create users
- [ ] Have SQL queries ready for fixes
- [ ] Know how to check edge function logs

---

**Last Updated**: Pre-Launch  
**Status**: Ready for Testing
