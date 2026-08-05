import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './AppStandalone.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { i18nReady } from './i18n/config.js'
import { initSentry } from './utils/sentry.js'
import { initPostHog } from './utils/posthog.js'
import './index.css'

initSentry()
initPostHog()

const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev'
const BUILD_VERSION_KEY = 'siteweave_build_version'

if (typeof window !== 'undefined') {
  const previousBuild = localStorage.getItem(BUILD_VERSION_KEY)
  if (previousBuild && previousBuild !== APP_VERSION) {
    sessionStorage.removeItem('siteweave_app_state')
    sessionStorage.removeItem('siteweave_app_state_v2')
    sessionStorage.removeItem('siteweave_user_id')
  }
  localStorage.setItem(BUILD_VERSION_KEY, APP_VERSION)
}

// Unregister stale service workers (desktop parity; avoids cached shell on deploy)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister()
    }
  }).catch(() => {})
}

// Suppress noisy Supabase Realtime websocket + stale refresh-token console errors
if (typeof window !== 'undefined') {
  const originalError = console.error
  console.error = function (...args) {
    const first = args[0]
    const firstMsg =
      typeof first === 'string'
        ? first
        : first instanceof Error
          ? first.message
          : String(first ?? '')
    const name = first instanceof Error ? first.name : ''
    const joined = [firstMsg, ...args.slice(1).filter((a) => typeof a === 'string')].join(' ')

    const suppressRealtime =
      (/wss?:\/\//i.test(joined) &&
        /supabase|realtime|websocket/i.test(joined) &&
        /failed|error|closed|1006/i.test(joined)) ||
      (firstMsg.includes('WebSocket') && firstMsg.includes('failed'))

    const suppressStaleRefresh =
      name === 'AuthApiError' ||
      /invalid refresh token|refresh token not found|refresh_token_not_found/i.test(firstMsg)

    if (suppressRealtime || suppressStaleRefresh) return
    originalError.apply(console, args)
  }
}

i18nReady.then(() => {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  )
})
