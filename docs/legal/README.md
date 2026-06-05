# Legal documents (source of truth)

Publish these to **https://www.siteweave.org/legal/** so they match links in the app and SMS messages.

| File | Public URL |
|------|------------|
| `privacy-policy.md` | https://www.siteweave.org/legal/privacy-policy |
| `terms-of-service.md` | https://www.siteweave.org/legal/terms-of-service |

## Twilio registration

Copy-paste script (no screenshots required): **`twilio-opt-in-script.txt`**

Use the two legal URLs above as **Opt-in policy proof** (one `https://` URL per line).

## After publishing

1. Confirm pages load without login.
2. Submit Twilio campaign using `twilio-opt-in-script.txt`.
3. Optional: bump `TOS_VERSION` in `apps/mobile/constants/legal.js` if you want in-app re-acceptance of updated Terms.

## Code references

SMS message copy: `supabase/functions/_shared/smsCompliance.ts`
