# Restoring SiteWeave SMS Notifications

SMS notifications are temporarily disabled via a single feature flag. **Web SMS consent links work without enabling SMS** — deploy the consent page and edge functions first, complete Twilio 10DLC registration, then flip the flags below.

Email notifications, push notifications, and contact phone fields (for calling) are unaffected.

## What is disabled

When SMS is off, SiteWeave does **not** send Twilio text messages for:

- Task assignee pings (manual reminders)
- SMS consent / opt-in requests ("SMS OK?")
- Scheduled task-start reminders (cron)
- Project invite texts when a contact has a phone number

The web/desktop UI hides SMS consent buttons and SMS-related copy. Mobile was already email-only for pings; the native **Message** button in the team list (opens the device SMS app) is unchanged.

## What stays in place

These are intentionally **not** removed so re-enabling is straightforward:

- `sms_phone_consent` database table and RLS policies
- Twilio edge function code (`twilio-sms-inbound`, `_shared/twilioSms.ts`, `_shared/smsConsent.ts`)
- Twilio secrets in Supabase (if already configured)
- i18n strings under `sms.*`, `tasks.sms_ok`, etc.
- Contact phone fields on subcontractor/team cards

The inbound webhook (`twilio-sms-inbound`) can keep running; it only records YES/STOP replies and does not send product notifications on its own.

## Web consent (works while SMS is disabled)

These work **before** Step 1–2 below:

- PM: **Get SMS consent link** on contacts / tasks (attestation + shareable URL + QR)
- Public page: `/sms-consent/:token` (no login)
- Edge functions: `create-sms-consent-link`, `sms-consent-request`, `confirm-sms-web-consent`

Deploy migration `20260708180000_sms_consent_requests.sql` and the functions above. See [sms-twilio-campaign-registration.md](./sms-twilio-campaign-registration.md).

---

## Step 1: Enable the client flag

In [`packages/core-logic/src/constants/smsNotifications.js`](../packages/core-logic/src/constants/smsNotifications.js), set:

```js
export const SMS_NOTIFICATIONS_ENABLED = true;
```

Rebuild and deploy web and desktop (Electron) clients so the UI shows SMS consent buttons and multi-channel ping behavior again.

---

## Step 2: Enable the server flag

Set the Supabase Edge Function secret (must be the string `true`):

```bash
supabase secrets set SMS_NOTIFICATIONS_ENABLED=true
```

Redeploy the functions that send SMS:

```bash
supabase functions deploy dispatch-notification
supabase functions deploy process-task-notifications
supabase functions deploy invite_or_add_member
supabase functions deploy create-sms-consent-link
supabase functions deploy sms-consent-request
supabase functions deploy confirm-sms-web-consent
```

If you maintain a duplicate function tree under `apps/web/supabase/functions/`, deploy `invite_or_add_member` from that path as well if your pipeline uses it.

---

## Step 3: Twilio prerequisites

Confirm Twilio is configured before testing. See:

- [Email & invitation deployment guide](./email-deployment-guide.md) — **Step 1B: Set Up Twilio**
- [SMS Twilio campaign registration](./sms-twilio-campaign-registration.md) — A2P / 10DLC for US numbers

Required Supabase secrets (typical):

```bash
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set TWILIO_API_SECRET=your_api_secret
supabase secrets set TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Optional fallback:
# supabase secrets set TWILIO_FROM_NUMBER=+15551234567
```

Inbound webhook (for YES / STOP consent):

1. Deploy `twilio-sms-inbound` if not already live.
2. In Twilio Console → Messaging → your number or Messaging Service → **Inbound webhook**, point to:
   `https://<project-ref>.supabase.co/functions/v1/twilio-sms-inbound`
3. Set `TWILIO_AUTH_TOKEN` in Supabase for signature verification on inbound requests.

---

## Step 4: UI surfaces that reappear

After the client flag is `true` and clients are rebuilt:

| File | Behavior restored |
|------|-------------------|
| [`apps/web/src/components/TaskItem.jsx`](../apps/web/src/components/TaskItem.jsx) (and [`src/components/TaskItem.jsx`](../src/components/TaskItem.jsx)) | "SMS OK?" / Resend consent buttons; ping when assignee has phone |
| [`apps/web/src/views/ProjectDetailsView.jsx`](../apps/web/src/views/ProjectDetailsView.jsx) (and [`src/views/ProjectDetailsView.jsx`](../src/views/ProjectDetailsView.jsx)) | Loads `sms_phone_consent`; email + SMS ping channels |
| [`apps/web/src/components/AddContactModal.jsx`](../apps/web/src/components/AddContactModal.jsx) | Subcontractor phone hint about YES consent |
| [`apps/web/src/components/UpgradeRequiredModal.jsx`](../apps/web/src/components/UpgradeRequiredModal.jsx) | Marketing copy mentioning SMS / texts |

---

## Step 5: Verification checklist

Run through these after both flags are enabled and functions are deployed:

- [ ] **Web consent:** PM taps **Get SMS consent link** → assignee opens URL on phone → checks box → submits → status **SMS: Confirmed** in UI.
- [ ] **Consent flow (text):** On a task with an assignee phone, click **SMS OK?** → assignee receives opt-in text → reply **YES \<code\>** → status shows confirmed in UI.
- [ ] **Manual ping:** Ping assignee with confirmed consent → toast shows email and/or SMS sent; activity log records `assignee_ping_sms` when SMS succeeds.
- [ ] **Email-only ping:** Assignee with email but no phone → ping sends email only (unchanged).
- [ ] **Project invite:** Invite/add member with phone on contact → invite SMS sent (or opt-in sent if not yet confirmed).
- [ ] **Scheduled reminders:** With task-start notifications enabled, cron run sends email; consented phones also receive SMS (`process-task-notifications`).
- [ ] **Opt-out:** Assignee replies **STOP** → `sms_phone_consent.status` = `opted_out`; substantive SMS blocked; UI shows blocked state.
- [ ] **Disabled guard removed:** With flags off, `sms_opt_in_request` returns `{ disabled: true }` and no Twilio sends occur.

---

## Disabling again

1. Set `SMS_NOTIFICATIONS_ENABLED = false` in `packages/core-logic/src/constants/smsNotifications.js`.
2. Unset or set `SMS_NOTIFICATIONS_ENABLED=false` in Supabase secrets (anything other than `true` disables server-side SMS).
3. Redeploy clients and edge functions as needed.

No database migrations or Twilio teardown required for a temporary pause.
