import React from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import RouteErrorElement from './components/RouteErrorElement.jsx'
import { AppProvider } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import { i18nReady } from './i18n/config'
import { initSentry } from './utils/sentry'
import { initPostHog } from './utils/posthog'
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

// Unregister any existing service workers to prevent caching issues
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (let registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {});
}

// Suppress WebSocket connection errors from Supabase realtime subscriptions
// These errors are expected when realtime is not enabled for certain tables
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = function(...args) {
    const message = args[0]?.toString() || '';
    const name = args[0]?.name || '';
    // Filter out WebSocket connection errors
    if (message.includes('WebSocket') && message.includes('failed')) {
      return;
    }
    // Stale Supabase refresh token on startup — session is cleared automatically
    if (
      name === 'AuthApiError' ||
      message.includes('Invalid Refresh Token') ||
      message.includes('Refresh Token Not Found') ||
      message.includes('refresh_token_not_found')
    ) {
      return;
    }
    originalError.apply(console, args);
  };
}

const router = createHashRouter([
  { 
    path: '/*', 
    element: <App />,
    errorElement: <RouteErrorElement />
  }
])

i18nReady.then(() => {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <AppProvider>
            <RouterProvider router={router} />
          </AppProvider>
        </ToastProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
})
