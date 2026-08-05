import posthog from 'posthog-js'

let initialized = false

/**
 * Initialize PostHog once. No-ops when key is missing.
 */
export function initPostHog() {
  if (initialized) return
  initialized = true

  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return

  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

  posthog.init(key, {
    api_host: apiHost,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  })
}

/**
 * @param {string} pathname
 */
export function trackPageView(pathname) {
  if (!import.meta.env.VITE_POSTHOG_KEY) return
  try {
    posthog.capture('$pageview', { $current_url: pathname })
  } catch {
    // ignore
  }
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [properties]
 */
export function trackEvent(event, properties = {}) {
  if (!import.meta.env.VITE_POSTHOG_KEY) return
  try {
    posthog.capture(event, properties)
  } catch {
    // ignore
  }
}

/**
 * @param {{ id: string, email?: string }|null} user
 * @param {{ id?: string, name?: string }|null} [organization]
 */
export function identifyUser(user, organization = null) {
  if (!import.meta.env.VITE_POSTHOG_KEY) return
  try {
    if (!user?.id) {
      posthog.reset()
      return
    }
    posthog.identify(user.id, {
      email: user.email || undefined,
    })
    if (organization?.id) {
      posthog.group('organization', organization.id, {
        name: organization.name || undefined,
      })
    }
  } catch {
    // ignore
  }
}

export { posthog }
