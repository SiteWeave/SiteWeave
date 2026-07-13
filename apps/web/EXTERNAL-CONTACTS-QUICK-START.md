# 🚀 External Contact Assignment System - Quick Start

## What Was Implemented

Your SiteWeave app now has a complete **two-phase external contact assignment system**:

### ✅ Phase 1: Email Notifications (Ready to Use)
- PMs can assign tasks to contacts with email addresses
- System automatically sends professional email notifications
- Contacts receive task details via email and can reply
- No account needed for external contacts

### ✅ Phase 2: Google Docs-Style Invitations (Ready to Use)
- PMs can invite people to join projects via email
- Recipients get a beautiful invitation email with signup link
- New users are automatically added to projects and assigned tasks
- Seamless onboarding experience

---

## 🎯 Quick Start (3 Steps)

### Step 1: Deploy Database Changes

Run the updated `../../schema.sql` in your Supabase SQL Editor:

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `../../schema.sql`
3. Click "Run"
4. Verify success (should see "Success. No rows returned")

**What this does:**
- Adds `email` and `phone` columns to contacts table
- Creates `invitations` table with RLS policies
- Adds performance indexes

### Step 2: Set Up Email Service

**Option A: Resend (Recommended)**

1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month)
2. Verify your domain OR use their test domain
3. Get your API key from dashboard
4. Set it in Supabase:
   ```bash
   supabase secrets set RESEND_API_KEY=re_your_actual_key
   ```

**Option B: Development Mode (No Emails)**

Skip this step for now. Emails will be logged to console instead of sent.

### Step 3: Deploy Edge Functions

```bash
# Login to Supabase CLI
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy both functions
supabase functions deploy send-email
supabase functions deploy send-invitation-email

# Verify deployment
supabase functions list
```

**Done!** Your app is ready to use.

---

## 📋 How to Use

### For PMs: Assign Task to External Contact

1. Go to **Contacts** page
2. Click "Add Contact"
3. Fill in name, role, **and email address**
4. Save contact
5. Go to **Project Details** → **Issues** tab
6. Create a new issue or open existing
7. Assign a step to the contact with email
8. **System automatically sends email** 📧

The contact will receive a professional email with:
- Task description and details
- Project information
- Priority and due date
- Instructions to reply to you

### For PMs: Invite Someone to Join SiteWeave

*Coming in next update: UI button to send invitations*

For now, invitations are sent when you assign tasks to email addresses that aren't in your contacts list yet. The system will:

1. Create an invitation record
2. Send a beautiful invitation email
3. Include a signup link with unique token
4. Track invitation status

When they sign up:
- Automatically added to the project
- Automatically assigned to the task
- Can access full SiteWeave features

---

## 🧪 Testing

### Test Email Notifications

1. Add yourself as a contact with your email
2. Assign yourself to an issue step
3. Check your email inbox
4. Verify you received the task notification

### Test Invitations (Coming Soon)

Manual testing via database:
1. Insert invitation record with your email
2. Navigate to `/invite/[token]` in browser
3. Sign up with that email
4. Verify you're added to project

---

## 📊 Monitoring

### Check Edge Function Logs

```bash
# Real-time email logs
supabase functions logs send-email --follow

# Real-time invitation logs
supabase functions logs send-invitation-email --follow
```

### Check Invitation Status

In Supabase Dashboard → Table Editor → invitations:
- View all sent invitations
- Check status (pending, accepted, expired)
- See acceptance timestamps

---

## 🎨 Customization

### Update Email "From" Address

Edit both edge functions:
- `supabase/functions/send-email/index.ts` (line ~47)
- `supabase/functions/send-invitation-email/index.ts` (line ~97)

Change:
```typescript
from: 'SiteWeave <notifications@yourdomain.com>',
```

### Customize Email Templates

Both edge functions have HTML email templates you can customize:
- Company logo and branding
- Colors and styling
- Footer content
- Support links

---

## 🐛 Troubleshooting

### Problem: Emails not sending

**Solution 1**: Check if API key is set
```bash
supabase secrets list
# Should show RESEND_API_KEY (value hidden)
```

**Solution 2**: Check edge function logs
```bash
supabase functions logs send-email
```

**Solution 3**: Test edge function directly
```bash
curl -X POST 'https://[your-project].supabase.co/functions/v1/send-email' \
  -H 'Authorization: Bearer [your-anon-key]' \
  -H 'Content-Type: application/json' \
  -d '{"to":"test@example.com","subject":"Test","html":"<p>Test</p>"}'
```

### Problem: Invitations not working

**Check 1**: Verify invitations table exists
```sql
SELECT * FROM invitations LIMIT 1;
```

**Check 2**: Verify RLS policies
```sql
SELECT * FROM pg_policies WHERE tablename = 'invitations';
```

**Check 3**: Check invitation in database
```sql
SELECT * FROM invitations WHERE invitation_token = 'your-token';
```

### Problem: Database migration fails

**Solution**: Run each section of `../../schema.sql` separately:
1. First: Table creation sections
2. Second: Foreign key constraints
3. Third: RLS policies
4. Fourth: Indexes

---

## 📚 Documentation

Detailed documentation available:
- `docs/email-deployment-guide.md` - Complete deployment guide
- `docs/external-contact-implementation.md` - Implementation details
- `docs/external-contact-assignment-system.plan.md` - Original plan

---

## ✨ What's New in Your App

### New Features

1. **Email Badge on Contacts** 📧
   - Contacts with emails show a blue "Email" badge
   - Hover to see the email address

2. **Auto-Email Notifications** 📬
   - Tasks assigned to contacts with emails automatically trigger notifications
   - Professional HTML emails with all task details

3. **Invitation System** 🎉
   - Invitation tokens with 7-day expiration
   - Beautiful invitation acceptance page
   - Auto-linking on signup

4. **Invitation Manager** 📋
   - View pending and past invitations
   - Resend or cancel invitations
   - Track invitation status

### New Files

**Utilities:**
- `src/utils/emailNotifications.js`
- `src/utils/invitationService.js`

**Components:**
- `src/components/InvitationManager.jsx`
- `src/views/AcceptInvitationView.jsx`

**Edge Functions:**
- `supabase/functions/send-email/`
- `supabase/functions/send-invitation-email/`

### Database Changes

**contacts table:**
- Added: `email` column
- Added: `phone` column
- Added: Index on email

**New table:**
- `invitations` with full RLS policies and indexes

---

## 🚦 Production Checklist

Before deploying to production:

- [ ] Resend account created and domain verified
- [ ] API key set in Supabase secrets
- [ ] Both edge functions deployed
- [ ] Database migration completed successfully
- [ ] Test email sent and received
- [ ] Test invitation flow end-to-end
- [ ] Email "from" addresses updated
- [ ] Email templates customized with branding
- [ ] Error monitoring set up
- [ ] RLS policies verified

---

## 💡 Tips

1. **Start Small**: Test with yourself first (add your own email as a contact)
2. **Development Mode**: Works without Resend API key (logs to console)
3. **Free Tiers**: Resend free tier (3K emails/month) is plenty for most projects
4. **Monitor Usage**: Check Supabase dashboard for edge function invocations
5. **Email Deliverability**: Verify your domain in Resend for best results

---

## 🎉 You're Ready!

Your SiteWeave app now has professional external contact management:

✅ Email notifications for task assignments
✅ Google Docs-style invitation system
✅ Seamless onboarding for new users
✅ Professional email templates
✅ Complete tracking and monitoring

Start by adding contacts with email addresses and assigning them tasks!

---

## 📞 Need Help?

- **Edge Functions**: [supabase.com/docs/guides/functions](https://supabase.com/docs/guides/functions)
- **Resend Docs**: [resend.com/docs](https://resend.com/docs)
- **Implementation Details**: Check `docs/external-contact-implementation.md`

Happy building! 🚀

