import React from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import LoadingSpinner from './components/LoadingSpinner'
import InviteAcceptPage from './components/InviteAcceptPage'
import GuestTaskShareView from './views/GuestTaskShareView'
import ForcePasswordReset from './components/ForcePasswordReset'
import AppShell from './layouts/AppShell'
import LoginView from './views/LoginView'
import SignUpView from './views/SignUpView'
import ProjectInviteAcceptPage from './components/ProjectInviteAcceptPage'
import ProjectWorkspaceView from './views/ProjectWorkspaceView'
import DashboardView from './views/DashboardView'
import CalendarView from './views/CalendarView'
import TeamView from './views/TeamView'
import TeamHubView from './views/TeamHubView'
import SettingsView from './views/SettingsView'
import NoOrganizationView from './views/NoOrganizationView'
import { ROUTE_PATHS } from './config/routes'
import { parseLegacyProjectQuery } from './utils/deepLinking'
import { useSession } from './hooks/useSession'
import { trackRouteChange } from './utils/webTelemetry'
import { AppProvider, useAppContext } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import SetupWizardModal from './components/SetupWizardModal'

/** Prevent duplicate OAuth processing (matches desktop `App.jsx` behavior). */
let oauthCallbackProcessing = false
let oauthCallbackProcessed = false

function RouteStateSync({ view, children }) {
  const { state, dispatch } = useAppContext()

  React.useEffect(() => {
    if (state.activeView !== view) {
      dispatch({ type: 'SET_VIEW', payload: view })
    }
  }, [view, state.activeView, dispatch])

  return children
}

function WorkspaceLayout({ session }) {
  const { state, dispatch } = useAppContext()
  const [showSetupWizard, setShowSetupWizard] = React.useState(false)

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

  const handleSetupComplete = async () => {
    if (state.currentOrganization?.id) {
      const { data: org } = await supabase
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

  if (state.authLoading || state.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Loading workspace..." />
      </div>
    )
  }

  if (state.organizationLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Checking organization access..." />
      </div>
    )
  }

  if (state.organizationError && !state.isProjectCollaborator) {
    return <NoOrganizationView />
  }

  return (
    <>
      <AppShell session={session} />
      {showSetupWizard && (
        <SetupWizardModal show={showSetupWizard} onComplete={handleSetupComplete} />
      )}
      <ForcePasswordReset
        show={Boolean(state.mustChangePassword)}
        onComplete={() => dispatch({ type: 'SET_MUST_CHANGE_PASSWORD', payload: false })}
      />
    </>
  )
}

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to={ROUTE_PATHS.login} replace />
  return children
}

function ProjectWorkspaceRoute({ routeTab }) {
  return (
    <RouteStateSync view="Projects">
      <ProjectWorkspaceView routeTab={routeTab} />
    </RouteStateSync>
  )
}

function DashboardRoute() {
  const { dispatch } = useAppContext()

  React.useEffect(() => {
    dispatch({ type: 'SET_PROJECT', payload: null })
  }, [dispatch])

  return (
    <RouteStateSync view="Dashboard">
      <DashboardView />
    </RouteStateSync>
  )
}

function ProjectsRoute() {
  return (
    <RouteStateSync view="Projects">
      <DashboardView />
    </RouteStateSync>
  )
}

export default function AppStandalone() {
  const { session, loading } = useSession()
  const location = useLocation()
  const navigate = useNavigate()

  React.useEffect(() => {
    trackRouteChange(location.pathname)
  }, [location.pathname])

  React.useEffect(() => {
    const legacy = parseLegacyProjectQuery(window.location.search)
    if (legacy) {
      navigate(legacy.redirectPath, { replace: true })
      return
    }

    const handleAuthCallback = async () => {
      if (oauthCallbackProcessing || oauthCallbackProcessed) return

      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {
        oauthCallbackProcessing = true
        try {
          const hashParams = new URLSearchParams(hash.substring(1))
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')

          if (accessToken) {
            const { data, error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            })

            if (setSessionError) {
              console.error('Error setting session from hash fragment:', setSessionError)
              oauthCallbackProcessing = false
              return
            }

            if (data.session) {
              oauthCallbackProcessed = true
              window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
              navigate('/')
              oauthCallbackProcessing = false
              return
            }
          }
        } catch (err) {
          console.error('Error processing hash fragment OAuth:', err)
          oauthCallbackProcessing = false
          return
        }
        oauthCallbackProcessing = false
      }

      const urlParams = new URLSearchParams(window.location.search)
      const oauthErr = urlParams.get('error')
      if (oauthErr) {
        console.error('OAuth error:', oauthErr, urlParams.get('error_description') || '')
        return
      }

      const code = urlParams.get('code')
      if (!code) return

      oauthCallbackProcessing = true
      try {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError) {
          console.error('Error exchanging code for session:', exchangeError)
          const { data: { session: existing } } = await supabase.auth.getSession()
          if (existing) {
            oauthCallbackProcessed = true
            window.history.replaceState({}, document.title, window.location.pathname)
            navigate('/')
          }
          oauthCallbackProcessing = false
          return
        }

        if (data.session) {
          oauthCallbackProcessed = true
          window.history.replaceState({}, document.title, window.location.pathname)
          navigate('/')
        }
      } catch (err) {
        console.error('Error during OAuth code exchange:', err)
      } finally {
        oauthCallbackProcessing = false
      }
    }

    handleAuthCallback()
  }, [navigate, location.search, location.hash])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  }

  return (
    <ToastProvider>
    <Routes>
      <Route path={ROUTE_PATHS.invite} element={<InviteAcceptPage />} />
      <Route path={ROUTE_PATHS.guestTaskShare} element={<GuestTaskShareView />} />
      <Route path={ROUTE_PATHS.login} element={<LoginView />} />
      <Route path={ROUTE_PATHS.signup} element={<SignUpView />} />
      <Route path={ROUTE_PATHS.projectInvite} element={<ProjectInviteAcceptPage />} />
      <Route
        element={(
          <ProtectedRoute session={session}>
            <AppProvider>
                <WorkspaceLayout session={session} />
            </AppProvider>
          </ProtectedRoute>
        )}
      >
        <Route path={ROUTE_PATHS.home} element={<DashboardRoute />} />
        <Route path={ROUTE_PATHS.projects} element={<ProjectsRoute />} />
        <Route path={ROUTE_PATHS.project} element={<Navigate to="tasks" replace />} />
        <Route path={ROUTE_PATHS.projectTasks} element={<ProjectWorkspaceRoute routeTab="tasks" />} />
        <Route path={ROUTE_PATHS.projectGantt} element={<ProjectWorkspaceRoute routeTab="gantt" />} />
        <Route path={ROUTE_PATHS.projectUpdates} element={<ProjectWorkspaceRoute routeTab="updates" />} />
        <Route path={ROUTE_PATHS.projectFieldIssues} element={<ProjectWorkspaceRoute routeTab="field-issues" />} />
        <Route path={ROUTE_PATHS.projectActivity} element={<ProjectWorkspaceRoute routeTab="activity" />} />
        <Route path={ROUTE_PATHS.projectStream} element={<ProjectWorkspaceRoute routeTab="stream" />} />
        <Route path={ROUTE_PATHS.messages} element={<Navigate to={ROUTE_PATHS.teamDirectory} replace />} />
        <Route path={ROUTE_PATHS.team} element={<Navigate to={ROUTE_PATHS.teamDirectory} replace />} />
        <Route path={ROUTE_PATHS.calendar} element={<RouteStateSync view="Calendar"><CalendarView /></RouteStateSync>} />
        <Route path={ROUTE_PATHS.teamDirectory} element={<TeamHubView />} />
        <Route path={ROUTE_PATHS.organization} element={<RouteStateSync view="Organization"><TeamView /></RouteStateSync>} />
        <Route path={ROUTE_PATHS.settings} element={<RouteStateSync view="Settings"><SettingsView /></RouteStateSync>} />
        <Route path={ROUTE_PATHS.notifications} element={<RouteStateSync view="Settings"><SettingsView /></RouteStateSync>} />
      </Route>
    </Routes>
    </ToastProvider>
  )
}
