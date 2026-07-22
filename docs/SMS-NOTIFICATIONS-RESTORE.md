# Restoring SiteWeave SMS Notifications

SMS notifications are temporarily disabled via a single feature flag. **Web SMS consent links work without enabling SMS** — deploy the consent page and edge functions first, complete Signal House 10DLC registration, then flip the flags below.

Email notifications, push notifications, and contact phone fields (for calling) are unaffected.

## What is disabled

When SMS is off, SiteWeave does **not** send Signal House text messages for:

- Task assignee pings (manual reminders)
- SMS consent / opt-in requests ("SMS OK?")
- Scheduled task-start reminders (cron)
- Project invite texts when a contact has a phone number

The web/desktop UI hides SMS consent buttons and SMS-related copy. Mobile was already email-only for pings; the native **Message** button in the team list (opens the device SMS app) is unchanged.

## What stays in place

These are intentionally **not** removed so re-enabling is straightforward:

- `sms_phone_consent` database table and RLS policies
- Signal House edge function code (`signalhouse-sms-inbound`, `_shared/signalHouseSms.ts`, `_shared/smsConsent.ts`)
- Signal House secrets in Supabase (if already configured)
- i18n strings under `sms.*`, `tasks.sms_ok`, etc.
- Contact phone fields on subcontractor/team cards
- Public sample page `/sms-opt-in`

The inbound webhook (`signalhouse-sms-inbound`) can keep running; it only records YES/STOP replies and does not send product notifications on its own (except keyword replies).

## Web consent (works while SMS is disabled)

These work **before** Step 1–2 below:

- PM: **Get SMS consent link** on contacts / tasks (attestation + shareable URL + QR)
- Public page: `/sms-consent/:token` (no login)
- Sample: `/sms-opt-in`
- Edge functions: `create-sms-consent-link`, `sms-consent-request`, `confirm-sms-web-consent`

See [sms-signalhouse-campaign-registration.md](./sms-signalhouse-campaign-registration.md) and [SMS-SIGNAL-HOUSE.md](./SMS-SIGNAL-HOUSE.md).

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
supabase functions deploy signalhouse-sms-inbound
supabase functions deploy dispatch-notification
supabase functions deploy process-task-notifications
supabase functions deploy invite_or_add_member
supabase functions deploy create-sms-consent-link
supabase functions deploy sms-consent-request
supabase functions deploy confirm-sms-web-consent
```

---

## Step 3: Signal House prerequisites

Confirm Signal House is configured before testing. See [SMS-SIGNAL-HOUSE.md](./SMS-SIGNAL-HOUSE.md).

Required Supabase secrets:

```bash
supabase secrets set SIGNAL_HOUSE_API_KEY=your_api_key
supabase secrets set SIGNAL_HOUSE_FROM_NUMBER=+15129941576
```

Inbound webhook (for YES / STOP / HELP):

1. Deploy `signalhouse-sms-inbound`.
2. In Signal House → number messaging config, point inbound webhook to:
   `https://<project-ref>.supabase.co/functions/v1/signalhouse-sms-inbound`
3. Optional: set `SIGNAL_HOUSE_WEBHOOK_SECRET` and pass it on the webhook URL/header.

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

1. Create a consent link → open `/sms-consent/{token}` → confirm (optional confirm SMS if server flag on).
2. Reply **STOP** from that phone → status opted out; ack SMS received.
3. Reply **HELP** → help body received.
4. Send opt-in → reply **YES** → status confirmed.
5. Manual task ping / invite SMS only after confirmed.

## Kill switch (disable again)

1. Set `SMS_NOTIFICATIONS_ENABLED = false` in `packages/core-logic/src/constants/smsNotifications.js`.
2. `supabase secrets set SMS_NOTIFICATIONS_ENABLED=false` (or unset / any value other than `true`).
3. Redeploy UI and affected functions.
