import React from 'react'
import { useNavigate } from 'react-router-dom'
import LoginForm from '../components/LoginForm'
import LoadingSpinner from '../components/LoadingSpinner'
import { useSession } from '../hooks/useSession'

export default function SignUpView() {
  const navigate = useNavigate()
  const { session, loading } = useSession()

  React.useEffect(() => {
    if (!loading && session) {
      navigate('/', { replace: true })
    }
  }, [loading, session, navigate])

  if (loading || session) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white">
        <LoadingSpinner size="lg" text="Creating your account..." />
      </div>
    )
  }

  return (
    <LoginForm
      mode="signUp"
      onAuthSuccess={() => navigate('/', { replace: true })}
    />
  )
}
