import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

export function isConfigured() {
  return Boolean(url && serviceKey)
}

export function createOpsClient() {
  if (!isConfigured()) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in apps/ops/.env.local')
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function sentryIssueUrl(eventId) {
  if (!eventId) return null
  const org = import.meta.env.VITE_SENTRY_ORG
  const project = import.meta.env.VITE_SENTRY_PROJECT
  if (org && project) {
    return `https://${org}.sentry.io/issues/?query=${encodeURIComponent(eventId)}`
  }
  return `https://sentry.io/issues/?query=${encodeURIComponent(eventId)}`
}
