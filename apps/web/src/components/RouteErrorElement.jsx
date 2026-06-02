import React from 'react'
import { useRouteError, useNavigate, Link } from 'react-router-dom'

export default function RouteErrorElement() {
  const error = useRouteError()
  const navigate = useNavigate()
  const isDev = import.meta.env.DEV

  let errorMessage = 'An unexpected error occurred'
  let errorStatus = null
  let errorStack = null

  if (error) {
    if (typeof error === 'string') {
      errorMessage = error
    } else if (error.message) {
      errorMessage = error.message
    } else if (error.statusText) {
      errorMessage = error.statusText
      errorStatus = error.status
    }
    errorStack = error.stack
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="max-w-2xl w-full">
        <div className="rounded-xl border border-red-200 bg-white shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-red-50 px-6 py-4 border-b border-red-200">
            <div className="flex items-center gap-3">
              <svg className="h-8 w-8 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {errorStatus === 404 ? 'Page Not Found' : 'Route Error'}
                </h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  {errorStatus === 404 
                    ? 'The page you\'re looking for doesn\'t exist'
                    : 'We encountered an error loading this page'}
                </p>
              </div>
            </div>
          </div>

          {/* Error Details */}
          <div className="px-6 py-5">
            {errorStatus && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-1">Status code:</p>
                <p className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2 font-mono inline-block">
                  {errorStatus}
                </p>
              </div>
            )}

            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Error message:</p>
              <p className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2 font-mono wrap-break-word">
                {errorMessage}
              </p>
            </div>

            {/* Show stack trace in development */}
            {isDev && errorStack && (
              <details className="mb-4">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900 mb-2">
                  Stack trace (development only)
                </summary>
                <pre className="text-xs text-gray-600 bg-gray-50 rounded-md p-3 overflow-auto max-h-64 font-mono">
                  {errorStack}
                </pre>
              </details>
            )}

            {/* Common solutions */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
              <p className="text-sm font-medium text-blue-900 mb-2">Try these steps:</p>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                {errorStatus === 404 ? (
                  <>
                    <li>Check the URL for typos</li>
                    <li>Navigate back to the home page</li>
                    <li>The page may have been moved or deleted</li>
                  </>
                ) : (
                  <>
                    <li>Try navigating back to the previous page</li>
                    <li>Refresh the page to reload the application</li>
                    <li>Clear your browser cache and try again</li>
                    <li>Contact support if the issue continues</li>
                  </>
                )}
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button type="button"
                onClick={() => navigate(-1)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Go Back
              </button>
              <Link
                to="/"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors inline-block text-center"
              >
                Go Home
              </Link>
              <button type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
