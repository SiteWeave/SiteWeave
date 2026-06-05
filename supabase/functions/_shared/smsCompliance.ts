/** Public legal URLs — must stay in sync with apps/mobile/constants/legal.js */
export const SMS_TERMS_URL = 'https://www.siteweave.org/legal/terms-of-service'
export const SMS_PRIVACY_URL = 'https://www.siteweave.org/legal/privacy-policy'

/** Short legal hub for SMS bodies (Terms + Privacy live under /legal). */
export const SMS_LEGAL_SHORT = 'www.siteweave.org/legal'

/** Shorter hosts for HELP / Twilio forms (full https URLs). */
export const SMS_TERMS_SHORT = 'www.siteweave.org/legal/terms-of-service'
export const SMS_PRIVACY_SHORT = 'www.siteweave.org/legal/privacy-policy'

const OPT_IN_CONFIRM_KEYWORD = 'YES'

export function buildOptInSmsBody(orgName: string, token: string): string {
  const org = (orgName || 'Your team').slice(0, 32)
  return (
    `${org} via (SiteWeave): Welcome! Reply ${OPT_IN_CONFIRM_KEYWORD} ${token} to confirm receiving project task SMS alerts. ` +
    `Msg&data rates may apply. HELP/STOP anytime. Terms/Privacy: ${SMS_LEGAL_SHORT}`
  )
}

export function buildOptInConfirmedSmsBody(): string {
  return (
    "You're confirmed for SiteWeave project SMS. You'll receive task and project messages as needed. " +
    'Msg&data rates may apply. Reply STOP to opt out.'
  )
}

export function buildHelpSmsBody(): string {
  return (
    `SiteWeave: Reply ${OPT_IN_CONFIRM_KEYWORD} plus the 6-character code we texted you to confirm SMS. ` +
    `Msg&data rates may apply. HELP/STOP anytime. Terms/Privacy: ${SMS_LEGAL_SHORT}`
  )
}

export function buildOptOutConfirmedSmsBody(): string {
  return 'SiteWeave: You are unsubscribed from SMS and will not receive further texts from us.'
}

/** Appended to substantive (post-consent) messages for carrier opt-out visibility. */
export function withTransactionalSmsFooter(body: string): string {
  const suffix = ' Reply STOP to opt out.'
  const max = 1600 - suffix.length
  const trimmed = body.length > max ? `${body.slice(0, max - 3)}...` : body
  return trimmed + suffix
}
