# Twilio SMS campaign registration (A2P / 10DLC)

**Quick path:** Deploy web consent page + edge functions → publish updated legal pages → paste **`docs/legal/twilio-opt-in-script.txt`** into Twilio → add legal URLs + screenshot of `/sms-consent/{token}` as opt-in proof.

| Asset | Location |
|-------|----------|
| Paste script | [docs/legal/twilio-opt-in-script.txt](./legal/twilio-opt-in-script.txt) |
| Privacy Policy (publish to site) | [docs/legal/privacy-policy.md](./legal/privacy-policy.md) |
| Terms of Service (publish to site) | [docs/legal/terms-of-service.md](./legal/terms-of-service.md) |
| Public consent page | `https://www.siteweave.org/sms-consent/{token}` |

Deploy Edge Functions before live SMS so copy matches `supabase/functions/_shared/smsCompliance.ts`.

## “Not verified yet” — how do I get screenshots?

Campaign registration and **sending to real users** are separate. Reviewers mainly need to see **where consent is explained** and **what you will send** — not proof that production SMS already works to strangers.

You do **not** need full 10DLC approval before submitting proof. Use one or more of these:

### Option A — Web consent page (recommended, no Twilio SMS required)

1. Deploy `create-sms-consent-link`, `sms-consent-request`, `confirm-sms-web-consent`, and the web app with `/sms-consent/:token`.
2. In SiteWeave, add a test contact phone and tap **Get SMS consent link**.
3. Open the link on your mobile browser (or use dev tools mobile viewport).
4. Screenshot the page showing disclosure, masked phone, checkbox, and Submit.
5. Host the image at a public `https://` URL and add it to **Opt-in policy proof** alongside the legal page URLs.

The web form works **before** SMS kill switches are enabled — it does not send Twilio messages until optional post-confirm SMS after flags are on.

### Option B — App UI collateral (no SMS required)

Host public `https://` images of:

1. **Contact / trade partner card** — SMS consent status badge + **Get SMS consent link** with PM attestation.
2. **Task row** — **Consent link** button for assignees without confirmed SMS.
3. **Message collateral** — exact opt-in, confirmation, HELP, and STOP texts from `supabase/functions/_shared/smsCompliance.ts`.

### Option C — Reply YES test (alternate path)

If Twilio allows sends to your verified number before campaign approval:

1. Verify your mobile in Twilio Console.
2. Tap **SMS OK?** on a task (requires SMS flags enabled — see [SMS-NOTIFICATIONS-RESTORE.md](./SMS-NOTIFICATIONS-RESTORE.md)).
3. Screenshot opt-in and YES confirmation on your phone.

---

**Order of operations:** deploy web consent → screenshot page → submit campaign with legal URLs + screenshot → get brand/campaign approved → enable SMS kill switches → test end-to-end ping.

## Opt-in type

Choose **Via website** as primary. Document **Via text** (reply YES) as an alternate path in the description field (see paste script).

## Opt-in description

Use the full text in [docs/legal/twilio-opt-in-script.txt](./legal/twilio-opt-in-script.txt). It covers:

- PM generates shareable link / QR
- Recipient opens `/sms-consent/{token}` on phone browser
- Required checkbox + program disclosure
- Alternate YES-reply path via **SMS OK?**
- HELP / STOP / Msg&data rates / legal URLs

## Opt-in policy proof (one HTTPS URL per line)

```
https://www.siteweave.org/legal/privacy-policy
https://www.siteweave.org/legal/terms-of-service
```

Add a hosted screenshot URL of the live web consent page (Option A).

Privacy Section **18** and Terms Section **18** describe both web-form and text-reply consent.

## Technical references

- Web consent: `supabase/functions/_shared/smsWebConsent.ts`, `create-sms-consent-link`, `sms-consent-request`, `confirm-sms-web-consent`
- SMS reply opt-in + gating: `supabase/functions/_shared/smsConsent.ts`, `smsCompliance.ts`
- Inbound YES/STOP/HELP: `supabase/functions/twilio-sms-inbound`
- Schema: `supabase/migrations/20260708180000_sms_consent_requests.sql`
- Deploy:
  ```bash
  supabase functions deploy create-sms-consent-link sms-consent-request confirm-sms-web-consent
  supabase functions deploy twilio-sms-inbound dispatch-notification invite_or_add_member process-task-notifications
  ```
- Setup: [email-deployment-guide.md](./email-deployment-guide.md) (SMS section)
- Enable sends after approval: [SMS-NOTIFICATIONS-RESTORE.md](./SMS-NOTIFICATIONS-RESTORE.md)

## After campaign approval

1. Enable client + server SMS flags (restore doc).
2. PM generates consent link for a real assignee → assignee confirms on phone.
3. Ping task → substantive SMS + email as configured.
4. Verify STOP opts out globally.
