import posthog from 'posthog-js'

let initialized = false

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

export function trackPageView(pathname) {
  if (!import.meta.env.VITE_POSTHOG_KEY) return
  try {
    posthog.capture('$pageview', { $current_url: pathname })
  } catch {
    // ignore
  }
}

export function trackEvent(event, properties = {}) {
  if (!import.meta.env.VITE_POSTHOG_KEY) return
  try {
    posthog.capture(event, properties)
  } catch {
    // ignore
  }
}

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
