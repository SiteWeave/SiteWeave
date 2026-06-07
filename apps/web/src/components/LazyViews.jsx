import React, { Suspense, lazy } from 'react'
import LoadingSpinner from './LoadingSpinner'
import { ErrorBoundary } from './ErrorBoundary'

export const DashboardView = lazy(() => import('../views/DashboardView'))
export const ProjectWorkspaceView = lazy(() => import('../views/ProjectWorkspaceView'))
export const CalendarView = lazy(() => import('../views/CalendarView'))
export const TeamHubView = lazy(() => import('../views/TeamHubView'))
export const TeamView = lazy(() => import('../views/TeamView'))
export const SettingsView = lazy(() => import('../views/SettingsView'))

const ViewErrorFallback = ({ error, resetError }) => (
  <div className="flex items-center justify-center h-full p-8">
    <div className="max-w-md w-full">
      <div className="rounded-lg border border-red-200 bg-white p-6 text-center shadow-xs">
        <div className="mb-4">
          <svg className="mx-auto h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load view</h3>
        <p className="text-sm text-gray-600 mb-4">
          {error?.message || 'An error occurred while loading this section.'}
        </p>
        <button
          type="button"
          onClick={resetError}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  </div>
)

class ViewErrorBoundary extends ErrorBoundary {
  render() {
    if (this.state.hasError) {
      return <ViewErrorFallback error={this.state.error} resetError={this.handleReset} />
    }
    return this.props.children
  }
}

export function LazyViewWrapper({ children }) {
  return (
    <ViewErrorBoundary onReset={() => window.location.reload()}>
      <Suspense
        fallback={(
          <div className="flex items-center justify-center h-full min-h-[40vh]">
            <LoadingSpinner variant="spinner" size="lg" />
          </div>
        )}
      >
        {children}
      </Suspense>
    </ViewErrorBoundary>
  )
}
