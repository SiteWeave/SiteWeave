import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
    this.setState({ errorInfo })
    
    // Optionally log to error reporting service
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  handleGoHome = () => {
    this.handleReset()
    // Use window.location if navigate is not available (outside Router context)
    if (this.props.navigate) {
      this.props.navigate('/')
    } else {
      window.location.href = '/'
    }
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return <FallbackComponent error={this.state.error} resetError={this.handleReset} />
      }

      const { error } = this.state
      const isDev = import.meta.env.DEV
      const errorMessage = error?.message || 'An unexpected error occurred'
      const errorStack = error?.stack

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
                    <h2 className="text-xl font-bold text-gray-900">Something went wrong</h2>
                    <p className="text-sm text-gray-600 mt-0.5">We encountered an unexpected error</p>
                  </div>
                </div>
              </div>

              {/* Error Details */}
              <div className="px-6 py-5">
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
                    <li>Refresh the page to reload the application</li>
                    <li>Clear your browser cache and try again</li>
                    <li>If the problem persists, try logging out and back in</li>
                    <li>Contact support if the issue continues</li>
                  </ul>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-3">
                  <button type="button"
                    onClick={this.handleReset}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                  <button type="button"
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Refresh Page
                  </button>
                  {this.props.showHomeButton && (
                    <button type="button"
                      onClick={this.handleGoHome}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Go Home
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Export the class component for extending
export { ErrorBoundary }

// Default export - works both inside and outside Router context
// If navigate prop is provided, it will be used. Otherwise, window.location is used as fallback
export default function ErrorBoundaryWrapper(props) {
  // Don't use navigate hook here since this component may be outside Router context
  // The ErrorBoundary class will handle navigation via window.location if navigate is not provided
  return <ErrorBoundary {...props} showHomeButton={true} />
}

