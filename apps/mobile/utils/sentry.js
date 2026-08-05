import Constants from 'expo-constants'

let initialized = false
let Sentry = null

function loadSentry() {
  if (Sentry) return Sentry
  try {
    // Native module — may be unavailable in Expo Go
    // eslint-disable-next-line global-require
    Sentry = require('@sentry/react-native')
  } catch (err) {
    console.warn('[sentry] @sentry/react-native unavailable:', err?.message || err)
    Sentry = null
  }
  return Sentry
}

function getExtra() {
  return Constants.expoConfig?.extra || {}
}

function getDsn() {
  const extra = getExtra()
  return process.env.EXPO_PUBLIC_SENTRY_DSN || extra.sentryDsn || null
}

/**
 * Initialize Sentry for Expo. No-ops when DSN is missing or native module unavailable.
 */
export function initSentry() {
  if (initialized) return
  initialized = true

  const dsn = getDsn()
  if (!dsn) return

  const mod = loadSentry()
  if (!mod) return

  mod.init({
    dsn,
    environment:
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ||
      extraEnvironment() ||
      (typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production'),
    enableAutoSessionTracking: true,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}

function extraEnvironment() {
  return getExtra().sentryEnvironment || null
}

/**
 * @param {unknown} error
 * @param {object} [hint]
 * @returns {string|null}
 */
export function captureException(error, hint = {}) {
  if (!getDsn()) return null
  const mod = loadSentry()
  if (!mod) return null
  try {
    const eventId = mod.captureException(
      error instanceof Error ? error : new Error(String(error?.message || error)),
      hint,
    )
    return eventId || null
  } catch {
    return null
  }
}

/**
 * @param {{ id: string, email?: string }|null} user
 */
export function setSentryUser(user) {
  if (!getDsn()) return
  const mod = loadSentry()
  if (!mod) return
  try {
    if (!user) {
      mod.setUser(null)
      return
    }
    mod.setUser({ id: user.id, email: user.email || undefined })
  } catch {
    // ignore
  }
}

export { Sentry }
