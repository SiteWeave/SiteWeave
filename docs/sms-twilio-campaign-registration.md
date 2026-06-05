# Twilio SMS campaign registration (A2P / 10DLC)

**Quick path:** Publish updated legal pages → paste **`docs/legal/twilio-opt-in-script.txt`** into Twilio → use the two legal URLs as opt-in proof. No screenshots required.

| Asset | Location |
|-------|----------|
| Paste script | [docs/legal/twilio-opt-in-script.txt](./legal/twilio-opt-in-script.txt) |
| Privacy Policy (publish to site) | [docs/legal/privacy-policy.md](./legal/privacy-policy.md) |
| Terms of Service (publish to site) | [docs/legal/terms-of-service.md](./legal/terms-of-service.md) |

Deploy Edge Functions before live SMS so copy matches `supabase/functions/_shared/smsCompliance.ts`.

## “Not verified yet” — how do I get screenshots?

Campaign registration and **sending to real users** are separate. Reviewers mainly need to see **what you will send** and **where consent is explained** — not proof that production SMS already works to strangers.

You do **not** need full 10DLC approval before submitting proof. Use one or more of these:

### Option A — No SMS required (usually enough)

Host public `https://` images (OneDrive/Google Drive “Anyone with the link”) of:

1. **App UI** — task row with **SMS OK?** / pending consent (no Twilio needed).
2. **App UI** — contact form phone field with the SMS consent hint (no Twilio needed).
3. **Message collateral** — a single image or PDF showing the **exact** opt-in, confirmation, HELP, and STOP reply texts (copy from the “Opt-in description” section below, or from `supabase/functions/_shared/smsCompliance.ts`). Twilio calls this “campaign collateral”; it does not have to be a photo of a live thread.

Paste those URLs into **Opt-in policy proof** (one per line). Pair with the detailed **Opt-in description** text field — that is often what reviewers read most closely.

### Option B — One real test to your own phone (if Twilio lets you send at all)

Many accounts can still send **before** the campaign is approved, with limits:

| Account state | What usually works |
|---------------|-------------------|
| **Trial** | SMS only to [phone numbers you verify in Twilio Console](https://console.twilio.com/us1/develop/phone-numbers/manage/verified) (your mobile). |
| **Paid, brand/campaign pending** | Often the same: test to your verified number, or low-volume sends until US carrier filtering blocks unregistered traffic. |
| **Campaign approved** | Send to assignees in production. |

Steps:

1. In Twilio Console → **Phone Numbers** → **Verified Caller IDs** (or **Verified** numbers), add **your** mobile.
2. Configure Supabase Twilio secrets + deploy `twilio-sms-inbound` (see [email-deployment-guide.md](./email-deployment-guide.md)).
3. In SiteWeave, add your number on a test contact/task and tap **SMS OK?** (or trigger `sms_opt_in_request`).
4. Screenshot the opt-in on your phone; reply **YES**; screenshot confirmation.

If send fails with “unregistered campaign” / 30034, fall back to **Option A** — that is normal pre-approval.

### Option C — Twilio Console test (no SiteWeave deploy)

In **Messaging** → your Messaging Service or number, some accounts can send a **test message** to a verified number with the same body text you document. Screenshot that thread for proof.

---

**Order of operations that works in practice:** submit campaign with Option A proofs → get brand/campaign approved → then turn on production sends to assignees.

## Opt-in type

Choose **Via text** (reply-based double opt-in, not a public keyword ad).

## Opt-in description (paste and replace placeholders)

Replace `[YOUR_TWILIO_NUMBER]` with your production long code or the number on your Messaging Service.

```
SiteWeave sends transactional project SMS only after explicit text consent.

1. Keyword / confirmation: Assignees reply YES (optionally with a 6-character code included in the first message, e.g. "Reply YES ABC123").
2. Number to text: Recipients reply to [YOUR_TWILIO_NUMBER] (the same SiteWeave sender that delivered the opt-in SMS).
3. Welcome / initial message (sent automatically when a PM adds a phone or taps "SMS OK?" on a task): "{Org} via (SiteWeave): Welcome! Reply YES {code} to confirm receiving project task SMS alerts. Msg&data rates may apply. HELP/STOP anytime. Terms/Privacy: www.siteweave.org/legal"
4. Message frequency: As needed for assigned project work (task due reminders, assignment pings, invites)—not scheduled marketing; typically low volume per recipient.
5. Disclaimers: Msg&data rates may apply on opt-in, HELP, confirmation, and substantive messages.
6. HELP / STOP: HELP returns program instructions and legal links; STOP (or STOPALL/UNSUBSCRIBE) opts the number out globally and sends an unsubscribe confirmation.
7. Terms & Privacy: https://www.siteweave.org/legal/terms-of-service and https://www.siteweave.org/legal/privacy-policy (also referenced in the opt-in SMS).
8. Double opt-in: The initial SMS asks the recipient to reply YES{code}; substantive SMS is blocked in sms_phone_consent until status=confirmed.
9. Confirmation message after YES: "You're confirmed for SiteWeave project SMS. You'll receive task and project messages as needed. Msg&data rates may apply. Reply STOP to opt out."

Substantive examples (only after confirmation): task due reminders and "open project" links. Each includes "Reply STOP to opt out."
```

## Opt-in policy proof (one HTTPS URL per line)

After publishing the updated legal pages, paste:

```
https://www.siteweave.org/legal/privacy-policy
https://www.siteweave.org/legal/terms-of-service
```

These pages include Sections **16** (Privacy — SMS program) and **18** (Terms — SMS terms) with the full flow, HELP/STOP, and message samples.

Optional extras: app UI screenshots or hosted message-collateral images (see Option A above).

## Technical references

- Opt-in + gating: `supabase/functions/_shared/smsConsent.ts`, `smsCompliance.ts`
- Inbound YES/STOP/HELP: `supabase/functions/twilio-sms-inbound`
- Deploy: `supabase functions deploy twilio-sms-inbound dispatch-notification invite_or_add_member process-task-notifications`
- Setup: [email-deployment-guide.md](./email-deployment-guide.md) (SMS section)

## After code changes (production)

1. Deploy functions (above).
2. After campaign approval, send a real opt-in to an assignee (or your verified test number).
3. Keep Option A collateral URLs in the registration; update with live phone screenshots if Twilio asks for more detail.
