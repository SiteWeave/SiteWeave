import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './AppStandalone.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './i18n/config.js'
import './index.css'

// Narrow suppression: noisy Supabase Realtime websocket failures only.
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
    const joined = [firstMsg, ...args.slice(1).filter((a) => typeof a === 'string')].join(' ')
    const shouldSuppress =
      /wss?:\/\//i.test(joined) &&
      /supabase|realtime|websocket/i.test(joined) &&
      /failed|error|closed|1006/i.test(joined)

    if (shouldSuppress) return
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


