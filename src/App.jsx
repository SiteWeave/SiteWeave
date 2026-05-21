import React from 'react'
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom'
import { useAppContext } from './context/AppContext'
import { supabaseClient } from './context/AppContext'
import LoadingSpinner from './components/LoadingSpinner'
import ErrorBoundary from './components/ErrorBoundary'
import Sidebar from './components/Sidebar'
import InviteAcceptPage from './components/InviteAcceptPage'
import ProjectInviteAcceptPage from './components/ProjectInviteAcceptPage'
import SignUpView from './views/SignUpView'
import LoginView from './views/LoginView'
import GuestTaskShareView from './views/GuestTaskShareView'
import SetupWizardModal from './components/SetupWizardModal'
import DirectoryManagementModal from './components/DirectoryManagementModal'
import PermissionGuard from './components/PermissionGuard'
import ForcePasswordReset from './components/ForcePasswordReset'
import UpdateNotification from './components/UpdateNotification'
import { LazyViewWrapper, DashboardView, ProjectDetailsView, CalendarView, TeamHubView, TeamView, SettingsView } from './components/LazyViews'
import NoOrganizationView from './views/NoOrganizationView'

let oauthCallbackProcessing = false
let oauthCallbackProcessed = false

function App() {
  const { state, dispatch } = useAppContext()
  const location = useLocation()
  const navigate = useNavigate()
  const [showSetupWizard, setShowSetupWizard] = React.useState(false)
  const [showTeamModal, setShowTeamModal] = React.useState(false)
  const [showPasswordReset, setShowPasswordReset] = React.useState(false)

  // Handle OAuth callback - check for auth code in URL or hash fragments
  React.useEffect(() => {
    const handleAuthCallback = async () => {
      if (oauthCallbackProcessing || oauthCallbackProcessed) return
      // Check for hash fragment tokens (implicit flow)
      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {
        oauthCallbackProcessing = true
        console.log('OAuth callback detected (hash fragment), processing tokens...')
        try {
          // Parse hash fragment
          const hashParams = new URLSearchParams(hash.substring(1))
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')
          
          if (accessToken) {
            // Set session from hash fragment tokens
            const { data, error: setSessionError } = await supabaseClient.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            })
            
            if (setSessionError) {
              console.error('Error setting session from hash fragment:', setSessionError)
              oauthCallbackProcessing = false
              return
            }
            
            if (data.session) {
              console.log('OAuth login successful (hash fragment), redirecting to home...')
              oauthCallbackProcessed = true
              // Clear the hash from URL
              window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
              navigate('/')
              oauthCallbackProcessing = false
              return
            }
          }
        } catch (error) {
          console.error('Error processing hash fragment:', error)
          oauthCallbackProcessing = false
          return
        }
        oauthCallbackProcessing = false
      }
      
      // Check for query parameters (PKCE flow)
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      const error = urlParams.get('error')
      
      if (error) {
        console.error('OAuth error:', error)
        return
      }
      
      if (code) {
        oauthCallbackProcessing = true
        console.log('OAuth callback detected (PKCE), exchanging code for session...')
        try {
          // Exchange code for session (PKCE flow)
          const { data, error: exchangeError } = await supabaseClient.auth.exchangeCodeForSession(code)
          
          if (exchangeError) {
            console.error('Error exchanging code for session:', exchangeError)
            // Try to get session as fallback (in case Supabase processed it automatically)
            const { data: { session } } = await supabaseClient.auth.getSession()
            if (session) {
              console.log('Session found after exchange error, proceeding...')
              oauthCallbackProcessed = true
              window.history.replaceState({}, document.title, window.location.pathname)
              navigate('/')
              oauthCallbackProcessing = false
              return
            }
            oauthCallbackProcessing = false
            return
          }
          
          if (data.session) {
            console.log('OAuth login successful (PKCE), redirecting to home...')
            oauthCallbackProcessed = true
            // Clear the OAuth code from URL
            window.history.replaceState({}, document.title, window.location.pathname)
            navigate('/')
            oauthCallbackProcessing = false
            return
          } else {
            console.warn('Code exchange succeeded but no session returned')
          }
        } catch (error) {
          console.error('Error during code exchange:', error)
          oauthCallbackProcessing = false
          return
        }
        oauthCallbackProcessing = false
      }
    }
    handleAuthCallback()
  }, [navigate])

  // Check if user must change password (managed accounts)
  React.useEffect(() => {
    if (state.user && state.mustChangePassword) {
      setShowPasswordReset(true)
    }
  }, [state.user, state.mustChangePassword])

  // Setup wizard: founding Org Admin only, until organizations.setup_wizard_completed_at is set (server-side)
  React.useEffect(() => {
    if (!state.user || !state.currentOrganization || state.mustChangePassword || !state.userRole) {
      setShowSetupWizard(false)
      return
    }

    const isPersonal = state.currentOrganization.workspace_type === 'personal'
    const isOrgAdmin = state.userRole?.name === 'Org Admin'
    const isFoundingAdmin =
      state.currentOrganization.created_by_user_id != null &&
      state.currentOrganization.created_by_user_id === state.user.id
    const wizardPending = !state.currentOrganization.setup_wizard_completed_at

    if (!isPersonal && isOrgAdmin && isFoundingAdmin && wizardPending) {
      setShowSetupWizard(true)
    } else {
      setShowSetupWizard(false)
    }
  }, [state.user, state.userRole, state.currentOrganization, state.mustChangePassword])

  // Handle invite route
  React.useEffect(() => {
    if (location.pathname.startsWith('/invite/')) {
      const token = location.pathname.split('/invite/')[1]
      // InviteAcceptPage will handle the rest
    }
  }, [location.pathname])

  // Handle project selection from URL
  const { id: projectIdFromUrl } = useParams()
  React.useEffect(() => {
    if (projectIdFromUrl && state.projects.length > 0) {
      const project = state.projects.find(p => p.id === projectIdFromUrl)
      if (project) {
        dispatch({ type: 'SET_PROJECT', payload: projectIdFromUrl })
        dispatch({ type: 'SET_VIEW', payload: 'Projects' })
      }
    }
  }, [projectIdFromUrl, state.projects, dispatch])

  // Show loading while auth is being checked
  if (state.authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  }

  // Public routes — available signed in or out (invite links, guest task shares)
  if (location.pathname.startsWith('/guest/tasks/')) {
    return <GuestTaskShareView />
  }
  if (location.pathname.startsWith('/project-invite/')) {
    return <ProjectInviteAcceptPage />
  }
  if (location.pathname.startsWith('/invite/')) {
    return <InviteAcceptPage />
  }

  // Show login if not authenticated
  if (!state.user) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/project-invite/:token" element={<ProjectInviteAcceptPage />} />
        <Route path="/guest/tasks/:token" element={<GuestTaskShareView />} />
        <Route path="/signup" element={<SignUpView />} />
        <Route path="/login" element={<LoginView />} />
        <Route path="*" element={<LoginView />} />
      </Routes>
    )
  }

  // Show no organization screen if user is logged in but has no organization
  // UNLESS they are a project collaborator
  if (!state.organizationLoading && state.user && !state.currentOrganization && state.organizationError && !state.isProjectCollaborator) {
    return <NoOrganizationView />
  }

  // Render main app with Sidebar
  const renderView = () => {
    // If a project is selected AND we're on Projects view, show project details
    if (state.selectedProjectId && state.activeView === 'Projects') {
      return (
        <LazyViewWrapper>
          <ProjectDetailsView />
        </LazyViewWrapper>
      )
    }

    // Otherwise, render based on activeView
    switch (state.activeView) {
      case 'Dashboard':
        return (
          <LazyViewWrapper>
            <DashboardView />
          </LazyViewWrapper>
        )
      case 'Projects':
        return (
          <LazyViewWrapper>
            <DashboardView />
          </LazyViewWrapper>
        )
      case 'Calendar':
        return (
          <LazyViewWrapper>
            <CalendarView />
          </LazyViewWrapper>
        )
      case 'Messages':
      case 'Contacts':
      case 'Team':
        return (
          <LazyViewWrapper>
            <TeamHubView />
          </LazyViewWrapper>
        )
      case 'Organization':
        return (
          <LazyViewWrapper>
            <TeamView />
          </LazyViewWrapper>
        )
      case 'Settings':
        return (
          <LazyViewWrapper>
            <SettingsView />
          </LazyViewWrapper>
        )
      default:
        return (
          <LazyViewWrapper>
            <DashboardView />
          </LazyViewWrapper>
        )
    }
  }

  const handleSetupComplete = async () => {
    if (state.currentOrganization?.id) {
      const { data: org } = await supabaseClient
        .from('organizations')
        .select('*')
        .eq('id', state.currentOrganization.id)
        .single()
      if (org) {
        dispatch({ type: 'SET_ORGANIZATION', payload: org })
      }
    }
    setShowSetupWizard(false)
  }

  const handlePasswordResetComplete = () => {
    setShowPasswordReset(false)
    dispatch({ type: 'SET_MUST_CHANGE_PASSWORD', payload: false })
    // Refresh profile to get updated must_change_password flag
    if (state.user) {
      supabaseClient
        .from('profiles')
        .select('must_change_password')
        .eq('id', state.user.id)
        .single()
        .then(({ data }) => {
          if (data && !data.must_change_password) {
            dispatch({ type: 'SET_MUST_CHANGE_PASSWORD', payload: false })
          }
        })
    }
  }

  return (
    <div className="flex h-screen min-w-0 bg-gray-50 overflow-hidden">
      {/* Sidebar - granular boundary so main content can stay up if sidebar crashes */}
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>

      {/* Main Content - boundary so sidebar stays up if view crashes */}
      <main className="flex-1 min-w-0 overflow-y-auto px-4 py-6 lg:px-6">
        <ErrorBoundary>
          {renderView()}
        </ErrorBoundary>
      </main>

      {/* Setup Wizard - Shows on first login for Org Admins */}
      {showSetupWizard && (
        <ErrorBoundary>
          <SetupWizardModal 
            show={showSetupWizard} 
            onComplete={handleSetupComplete}
          />
        </ErrorBoundary>
      )}

      {/* Directory Management Modal */}
      <ErrorBoundary>
        <DirectoryManagementModal 
          show={showTeamModal} 
          onClose={() => setShowTeamModal(false)} 
        />
      </ErrorBoundary>

      {/* Force Password Reset - Shows when must_change_password is true */}
      {showPasswordReset && (
        <ErrorBoundary>
          <ForcePasswordReset
            show={showPasswordReset}
            onComplete={handlePasswordResetComplete}
          />
        </ErrorBoundary>
      )}

      {/* Update Notification - Shows in Electron app when updates are available */}
      <UpdateNotification />
    </div>
  )
}

export default App
