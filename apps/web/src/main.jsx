import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './AppStandalone.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './i18n/config.js'
import './index.css'

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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
