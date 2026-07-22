# Legal documents (source of truth)

Publish these to **https://www.siteweave.org/legal/** so they match links in the app and SMS messages.

| File | Public URL |
|------|------------|
| `privacy-policy.md` | https://www.siteweave.org/legal/privacy-policy |
| `terms-of-service.md` | https://www.siteweave.org/legal/terms-of-service |

## Signal House / 10DLC registration

- Ops + secrets: [`../SMS-SIGNAL-HOUSE.md`](../SMS-SIGNAL-HOUSE.md)
- Campaign paste guide: [`../sms-signalhouse-campaign-registration.md`](../sms-signalhouse-campaign-registration.md)
- Product sample opt-in: https://app.siteweave.org/sms-opt-in

Legacy Twilio paste scripts (`twilio-*.txt`) are archived; do not use for new submissions.

## After publishing

1. Confirm privacy/terms pages load without login.
2. Confirm SMS sections name **Signal House** and consent links use **app.siteweave.org**.
3. Optional: bump `TOS_VERSION` in `apps/mobile/constants/legal.js` if you want in-app re-acceptance of updated Terms.

## Code references

SMS message copy: `supabase/functions/_shared/smsCompliance.ts`
