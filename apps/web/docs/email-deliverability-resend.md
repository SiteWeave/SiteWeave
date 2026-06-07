# Email deliverability (Resend, SPF, DKIM, DMARC)

All product email is sent through **Resend** using a shared transactional layout (`supabase/functions/_shared/transactionalEmailLayout.ts`).

## What to configure

1. **Domain in Resend**  
   Verify `siteweave.org` in the [Resend dashboard](https://resend.com/docs/dashboard/domains/introduction).

2. **DNS records** (at your DNS host for `siteweave.org`)  
   - **SPF** — Resend TXT record authorizing their servers.  
   - **DKIM** — Resend DKIM keys.  
   - **DMARC** — `_dmarc.siteweave.org` TXT, e.g. `v=DMARC1; p=none; rua=mailto:you@siteweave.org`, then tighten to `quarantine` / `reject` once stable.

3. **Supabase Edge Function secrets**  
   ```bash
   supabase secrets set RESEND_API_KEY=re_...
   supabase secrets set RESEND_FROM="SiteWeave <notifications@siteweave.org>"
   supabase secrets set RESEND_VERIFIED_DOMAIN=siteweave.org
   ```
   All transactional mail uses **`notifications@siteweave.org`** (no `invitations@` or `noreply@` in code).

4. **Google Postmaster Tools**  
   Register `siteweave.org` to monitor spam/promotions placement.

## Transactional content guidelines (Primary inbox)

- One primary CTA; plain URL fallback below the button.  
- No gradient heroes, emoji headers, or marketing feature grids.  
- Subject names the inviter + context (`Alex invited you to Rivera Construction`), not “Join …” or “You're Invited!”.  
- **`reply_to`** set to inviter when available.  
- **Plain-text part** on every message.  
- **Physical address** in every footer: `2965 Hero Way Ste 100, Leander, TX 78641`.  
- Resend tag: `category: transactional`.  
- Do **not** add `List-Unsubscribe` on transactional mail.

## QA: send all templates to one inbox

After deploy:

```bash
supabase functions deploy send-email-fixtures
curl -X POST "https://<project-ref>.supabase.co/functions/v1/send-email-fixtures" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"djpugst3r@gmail.com\"}"
```

Sends 14 messages prefixed `[SiteWeave QA] …`. Check Gmail **Primary vs Promotions vs Spam** and confirm Hero address in each footer.

## Further reading

- [Resend: Domain verification](https://resend.com/docs/dashboard/domains/introduction)  
- [DMARC overview (DMARC.org)](https://dmarc.org/)
