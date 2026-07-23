# Signal House SMS — secrets, deploy, and cutover

SiteWeave sends transactional SMS via **Signal House** (not Twilio). Consent gates and message templates are unchanged.

## Public URLs

| Purpose | URL |
|---------|-----|
| Sample opt-in (registration / review) | https://app.siteweave.org/sms-opt-in |
| Real per-contact consent | https://app.siteweave.org/sms-consent/{token} |
| Privacy Policy | https://www.siteweave.org/legal/privacy-policy |
| Terms of Service | https://www.siteweave.org/legal/terms-of-service |
| Signal House intake (carrier registration) | https://site-weave.signalhouse.io/intake/L000070G |

## Supabase secrets (required)

Set in **Dashboard → Edge Functions → Secrets** or CLI. Do **not** put these in the web app `.env`.

```bash
supabase secrets set SIGNAL_HOUSE_API_KEY=your_api_key_here
supabase secrets set SIGNAL_HOUSE_FROM_NUMBER=+15129941576
```

Optional:

```bash
# Default if omitted:
# supabase secrets set SIGNAL_HOUSE_BASE_URL=https://v2.signalhouse.io

# If set, inbound webhook must send the same value as header
# x-signal-house-secret / x-webhook-secret or ?secret=
# supabase secrets set SIGNAL_HOUSE_WEBHOOK_SECRET=long_random_string
```

`SIGNAL_HOUSE_FROM_NUMBER` format: E.164 like `+15129941576` (preferred). The client strips non-digits and sends **US 11-digit** form (`15129941576`). Bare 10-digit values return Signal House **Number not found**. The number must be purchased/assigned and active on the same Signal House account as `SIGNAL_HOUSE_API_KEY`. Outbound SMS sends `recipientPhoneNumber` as a **one-element array** (API rejects a plain string).

Also keep the kill switch secret when enabling product SMS:

```bash
supabase secrets set SMS_NOTIFICATIONS_ENABLED=true
```

## Deploy edge functions

From the monorepo (canonical tree: `supabase/functions/`):

```bash
supabase functions deploy signalhouse-sms-inbound
supabase functions deploy dispatch-notification
supabase functions deploy process-task-notifications
supabase functions deploy invite_or_add_member
supabase functions deploy create-sms-consent-link
supabase functions deploy sms-consent-request
supabase functions deploy confirm-sms-web-consent
```

## Inbound webhook (Signal House dashboard)

1. Assign your sender number to an **approved** brand/campaign.
2. Configure the number’s **messaging / inbound webhook** to:

   `https://tchqmlyiwsqxwopvyxjx.supabase.co/functions/v1/signalhouse-sms-inbound`

3. If you set `SIGNAL_HOUSE_WEBHOOK_SECRET`, append `?secret=...` or configure Signal House to send that header (if supported).

Handles: **YES** / **YES {code}**, **STOP** / **STOPALL** / **UNSUBSCRIBE**, **HELP**. Replies are sent via the outbound API (not TwiML).

## Enable product SMS (after campaign approval)

1. Client: set `SMS_NOTIFICATIONS_ENABLED = true` in [`packages/core-logic/src/constants/smsNotifications.js`](../packages/core-logic/src/constants/smsNotifications.js) and redeploy web UI.
2. Server: `supabase secrets set SMS_NOTIFICATIONS_ENABLED=true`
3. Smoke test: web consent confirm → STOP → HELP → YES reply path.

## Registration checklist (Signal House portal)

- Use case: **Account notification** (not Marketing)
- Direct lending: **No** · Age-gated: **No** · Carrier: **Default**
- Embedded link: **Yes** · Embedded phone number: **No** (unless bodies include a phone number)
- Sample messages: real reminder/invite text **plus** `Reply STOP to opt out from Site Weave.`
- Company website: `https://www.siteweave.org` (business site)
- Opt-in / 10DLC page: Signal House landing and/or `https://app.siteweave.org/sms-opt-in`

See also [sms-signalhouse-campaign-registration.md](./sms-signalhouse-campaign-registration.md).

## Legacy Twilio

`twilio-sms-inbound` remains in the repo for reference but is **retired**. Do not point new numbers at it. Twilio secrets can be removed after cutover.
