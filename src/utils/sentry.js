import * as Sentry from '@sentry/react'

let initialized = false

/**
 * @returns {'web'|'electron'}
 */
export function getClientSource() {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return 'electron'
  }
  return 'web'
}

export function initSentry() {
  if (initialized) return
  initialized = true

  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  const environment =
    import.meta.env.VITE_SENTRY_ENVIRONMENT ||
    import.meta.env.MODE ||
    'development'

  Sentry.init({
    dsn,
    environment,
    release: import.meta.env.VITE_APP_VERSION
      ? `siteweave@${import.meta.env.VITE_APP_VERSION}`
      : undefined,
    sendDefaultPii: false,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.1),
  })
}

export function captureException(error, hint = {}) {
  if (!import.meta.env.VITE_SENTRY_DSN) return null
  try {
    const eventId = Sentry.captureException(
      error instanceof Error ? error : new Error(String(error?.message || error)),
      hint,
    )
    return eventId || null
  } catch {
    return null
  }
}

export function setSentryUser(user) {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  try {
    if (!user) {
      Sentry.setUser(null)
      return
    }
    Sentry.setUser({
      id: user.id,
      email: user.email || undefined,
    })
  } catch {
    // ignore
  }
}

export { Sentry }
