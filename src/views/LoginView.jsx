import React from 'react'
import { useNavigate } from 'react-router-dom'
import LoginForm from '../components/LoginForm'
import LoadingSpinner from '../components/LoadingSpinner'
import { useSession } from '../hooks/useSession'
import { getPostAuthNavigatePath } from '../utils/workspaceClient'

/**
 * Same screen as desktop: shared LoginForm. Redirects home if already signed in (e.g. after OAuth),
 * or back to a pending project invite when one is stored.
 */
export default function LoginView() {
  const navigate = useNavigate()
  const { session, loading } = useSession()

  const goAfterAuth = React.useCallback(() => {
    navigate(getPostAuthNavigatePath(), { replace: true })
  }, [navigate])

  React.useEffect(() => {
    if (!loading && session) {
      goAfterAuth()
    }
  }, [loading, session, goAfterAuth])

  if (loading || session) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white">
        <LoadingSpinner size="lg" text="Signing you in..." />
      </div>
    )
  }

  return (
    <LoginForm
      mode="signIn"
      onAuthSuccess={goAfterAuth}
    />
  )
}
