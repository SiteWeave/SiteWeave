# Signal House SMS campaign registration (A2P / 10DLC)

SiteWeave transactional SMS for construction project teams. Primary registration path uses Signal House’s landing-page builder when `www.siteweave.org` alone is not accepted as the opt-in site.

## Opt-in proof URLs

| Role | URL |
|------|-----|
| Signal House intake (submitted with campaign) | `https://site-weave.signalhouse.io/intake/L000070G` |
| SiteWeave sample opt-in (product-shaped UI) | `https://app.siteweave.org/sms-opt-in` |
| Real product consent | `https://app.siteweave.org/sms-consent/{token}` |
| Privacy | `https://www.siteweave.org/legal/privacy-policy` |
| Terms | `https://www.siteweave.org/legal/terms-of-service` |

## Recommended campaign fields

- **Use case:** Account notification
- **Direct lending:** No
- **Alcohol / tobacco / gambling / age-gated:** No
- **Carrier ID:** Default
- **Company:** project management software (construction)
- **Subscriber opt-in / opt-out / help:** Yes
- **Number pooling:** No
- **Embedded link:** Yes
- **Embedded phone number:** No
- **Terms & conditions:** Yes
- **Affiliate marketing:** No
- **MMS samples:** omit if SMS-only

## Sample messages (examples)

Do **not** use STOP-only samples. Carriers compare these to live traffic.

1. `SiteWeave: Reminder — Framing walkthrough starts tomorrow on Oak St. Open: https://app.siteweave.org/guest/tasks/… Reply STOP to opt out from Site Weave.`

2. `SiteWeave: You were added to Riverside Remodel. Open the project: https://app.siteweave.org/… Reply STOP to opt out from Site Weave.`

## Product opt-in (after approval)

PMs use **Get SMS consent link** in the app. Assignees open the tokenized page or reply **YES** to an opt-in text. See [SMS-SIGNAL-HOUSE.md](./SMS-SIGNAL-HOUSE.md) for secrets, webhook, and enabling the kill switches.

## Legacy Twilio docs

Older Twilio scripts under `docs/legal/twilio-*.txt` are archived reference only. Prefer this document and Signal House’s portal.
