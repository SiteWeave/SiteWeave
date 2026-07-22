# Email & Invitation System Deployment Guide

This guide explains how to deploy and configure the email notification and invitation system for SiteWeave.

## Overview

SiteWeave uses Supabase Edge Functions to send emails. There are two edge functions:
1. **send-email** - Sends task assignment notifications to external contacts
2. **send-invitation-email** - Sends project invitations to new users

## Prerequisites

1. Supabase CLI installed: `npm install -g supabase`
2. Supabase account and project
3. Resend API key (recommended) or other email service

## Step 1: Set Up Resend (Email Service)

### Option A: Resend (Recommended)

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain (or use their test domain for development)
3. Get your API key from the dashboard
4. Set up your "From" email address

### Option B: Other Email Services

You can modify the edge functions to use:
- SendGrid
- AWS SES
- Mailgun
- Postmark

## Step 1B: Set Up Signal House (SMS Assignment Notifications)

Signal House is used for SMS notifications when contacts are assigned to projects and a valid phone is on file (after opt-in). Full guide: **[SMS-SIGNAL-HOUSE.md](./SMS-SIGNAL-HOUSE.md)**.

1. In Signal House, create an API key (Developer Tools → API Keys) and assign a sender number to an approved campaign.
2. Add these Supabase Edge Function secrets:

```bash
supabase secrets set SIGNAL_HOUSE_API_KEY=your_api_key
supabase secrets set SIGNAL_HOUSE_FROM_NUMBER=+15129941576
```

Notes:
- Keep Signal House values in Supabase secrets only (never in client-side env vars).
- Phone numbers are normalized to E.164 in the app; digits-only for the Signal House API.
- SMS failures do not block the main project assignment flow.

### SMS double opt-in (web form or reply YES) and inbound webhook

Substantive SMS (task reminders, invites, assignment texts) is only sent after the assignee’s number is **`confirmed`** in `sms_phone_consent`. Opt-in is via the **web consent form** or reply **`YES`** (optionally with the 6-character code). **`STOP`** opts the number out globally.

1. **Edge Function URL (Signal House number inbound webhook)**  
   Point messaging inbound webhook to:

   `https://<project-ref>.supabase.co/functions/v1/signalhouse-sms-inbound`

   Deploy: `supabase functions deploy signalhouse-sms-inbound`

2. **Optional webhook secret**

```bash
supabase secrets set SIGNAL_HOUSE_WEBHOOK_SECRET=long_random_string
```

3. **Carrier compliance**  
   See **[sms-signalhouse-campaign-registration.md](./sms-signalhouse-campaign-registration.md)** and sample opt-in at https://app.siteweave.org/sms-opt-in.

## Step 2: Deploy Edge Functions

### Login to Supabase

```bash
supabase login
```

### Link Your Project

```bash
supabase link --project-ref your-project-ref
```

### Set Environment Variables

Set your Resend API key as a secret:

```bash
supabase secrets set RESEND_API_KEY=re_your_actual_api_key
```

### Deploy the Functions

Deploy both edge functions:

```bash
# Deploy send-email function
cd supabase/functions/send-email
supabase functions deploy send-email

# Deploy send-invitation-email function
cd ../send-invitation-email
supabase functions deploy send-invitation-email
```

### Verify Deployment

```bash
supabase functions list
```

You should see both functions listed.

## Step 3: Update Email Templates

### Customize "From" Email Address

In both edge functions, update the `from` field:

**send-email/index.ts** (line ~47):
```typescript
from: 'SiteWeave <notifications@yourdomain.com>',
```

**send-invitation-email/index.ts** (line ~97):
```typescript
from: 'SiteWeave <invitations@yourdomain.com>',
```

Replace `yourdomain.com` with your verified domain in Resend.

### Customize Email Content

Edit the HTML templates in the edge functions to match your branding:
- Logo and colors
- Company name
- Footer links
- Support contact information

## Step 4: Test the System

### Test Task Assignment Email

1. Create a contact with an email address
2. Assign that contact to an issue step
3. Check the Supabase Edge Functions logs: `supabase functions logs send-email`
4. Verify the email was received

### Test Invitation Email

1. Try to assign a task to a non-existent email address
2. System should prompt to send an invitation
3. Check logs: `supabase functions logs send-invitation-email`
4. Click the invitation link and complete signup

## Step 5: Database Migration

Run the database migration to add email fields and invitations table:

```bash
# Option 1: Run the SQL directly in Supabase Dashboard
# Copy the contents of schema.sql and run in SQL Editor

# Option 2: Use Supabase CLI migration
supabase db push
```

Verify the changes:
- `contacts` table should have `email` and `phone` columns
- `invitations` table should exist with proper RLS policies
- Indexes should be created

## Troubleshooting

### Emails Not Sending

1. **Check Edge Function Logs**:
   ```bash
   supabase functions logs send-email --follow
   ```

2. **Verify API Key**:
   ```bash
   supabase secrets list
   ```

3. **Test Edge Function Directly**:
   ```bash
   curl -i --location --request POST 'https://your-project.supabase.co/functions/v1/send-email' \
     --header 'Authorization: Bearer YOUR_ANON_KEY' \
     --header 'Content-Type: application/json' \
     --data '{"to":"test@example.com","subject":"Test","html":"<p>Test</p>"}'
   ```

### Invitations Not Working

1. **Check RLS Policies**:
   - Ensure invitations table has proper RLS policies
   - Verify authenticated users can read/write invitations

2. **Verify Email Matching**:
   - Invitation email must match signup email
   - Emails are case-insensitive

3. **Check Token Expiry**:
   - Invitations expire after 7 days by default
   - Update `expires_at` column default if needed

### Development Mode (No Email Service)

If `RESEND_API_KEY` is not set, the edge functions will:
- Log email details to console
- Return success without actually sending
- Useful for local development and testing

To see logs:
```bash
supabase functions logs send-email --follow
```

## Security Best Practices

1. **Never Commit API Keys**
   - Always use Supabase secrets for API keys
   - Add `.env` files to `.gitignore`

2. **Verify Email Domains**
   - Verify your sending domain in Resend
   - Use SPF, DKIM, and DMARC records

3. **Rate Limiting**
   - Implement rate limiting for invitation sends
   - Monitor for abuse

4. **Email Validation**
   - Always validate email format before sending
   - Check for disposable email domains if needed

## Production Checklist

- [ ] Resend account created and domain verified
- [ ] API key set in Supabase secrets
- [ ] Both edge functions deployed successfully
- [ ] Email templates customized with branding
- [ ] "From" addresses updated with verified domain
- [ ] Database migration completed
- [ ] RLS policies verified
- [ ] Test emails sent and received
- [ ] Test invitation flow end-to-end
- [ ] Error logging and monitoring set up
- [ ] Rate limiting configured (if needed)

## Monitoring

Monitor email delivery in:
1. **Resend Dashboard**: Track delivery rates, bounces, opens
2. **Supabase Functions Logs**: View function invocations and errors
3. **Database**: Query `invitations` table for status

## Cost Considerations

### Resend Pricing (as of 2024)
- Free tier: 3,000 emails/month
- Pro: $20/month for 50,000 emails
- Additional: $1 per 1,000 emails

### Supabase Edge Functions
- Free tier: 500,000 invocations/month
- Pro: Included in $25/month plan

For most projects, free tiers are sufficient for development and small-scale production.

## Support

For issues with:
- **Resend**: [resend.com/docs](https://resend.com/docs)
- **Supabase Edge Functions**: [supabase.com/docs/guides/functions](https://supabase.com/docs/guides/functions)
- **SiteWeave**: Check the main README or create an issue on GitHub













































