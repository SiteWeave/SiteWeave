import React from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PRIMARY_NAV_ITEMS, ROUTE_PATHS } from '../config/routes'
import { supabase } from '../supabaseClient'
import { useAppContext } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import TrialCountdownBanner from '../components/TrialCountdownBanner'
import GlobalSearch from '../components/GlobalSearch'

const NAV_I18N_KEYS = {
  Dashboard: 'dashboard',
  Projects: 'projects',
  Calendar: 'calendar',
  'Trade Partners': 'trade_partners',
  Organization: 'organization',
  Settings: 'settings',
}

const GUEST_HIDDEN_PATHS = new Set([
  ROUTE_PATHS.organization,
  ROUTE_PATHS.tradePartners,
  ROUTE_PATHS.team,
  ROUTE_PATHS.teamDirectory,
  ROUTE_PATHS.messages,
])

export default function AppShell({ session }) {
  const { t } = useTranslation()
  const { state, dispatch } = useAppContext()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = React.useState(false)

  const isGuestOnly = Boolean(state.isProjectCollaborator && !state.currentOrganization)
  const navItems = React.useMemo(() => {
    if (!isGuestOnly) return PRIMARY_NAV_ITEMS
    return PRIMARY_NAV_ITEMS.filter((item) => !GUEST_HIDDEN_PATHS.has(item.to))
  }, [isGuestOnly])

  React.useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (isGuestOnly && GUEST_HIDDEN_PATHS.has(location.pathname)) {
    return <Navigate to={ROUTE_PATHS.home} replace />
  }

  const displayName = session?.user?.user_metadata?.full_name || session?.user?.email || 'User'
  const roleLabel =
    state.userRole?.name ||
    (state.isProjectCollaborator ? t('sidebar.project_collaborator') : 'User')

  const handleLogout = async () => {
    try {
      const { data: { session: current } } = await supabase.auth.getSession()

      if (!current) {
        dispatch({ type: 'SET_USER', payload: null })
        addToast('Signed out successfully', 'success')
        navigate('/login', { replace: true })
        return
      }

      const { error } = await supabase.auth.signOut()
      if (error) {
        if (
          error.message?.includes('session') ||
          error.message?.includes('Session') ||
          error.message?.includes('403') ||
          error.status === 403
        ) {
          dispatch({ type: 'SET_USER', payload: null })
          addToast('Signed out successfully', 'success')
        } else {
          console.error('Sign out error:', error)
          dispatch({ type: 'SET_USER', payload: null })
          addToast('Signed out successfully', 'success')
        }
      } else {
        addToast('Signed out successfully', 'success')
      }
    } catch (err) {
      console.log('Sign out error caught, clearing local state:', err)
      dispatch({ type: 'SET_USER', payload: null })
      addToast('Signed out successfully', 'success')
    }
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100" data-testid="app-shell">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-screen">
        <aside
          className="hidden lg:flex flex-col h-screen sticky top-0 overflow-hidden overscroll-y-contain border-r border-slate-200 bg-white/95 backdrop-blur-xs"
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="h-16 px-6 border-b border-slate-200 flex items-center justify-between">
            <Link to="/" className="text-lg font-bold tracking-tight text-slate-900">SiteWeave</Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                aria-label="Search"
                data-testid="open-global-search"
              >
                <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="w-5 h-5" />
              </button>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                WEB
              </span>
            </div>
          </div>
          <div className="px-4 py-3 border-b border-slate-200">
            {state.currentOrganization ? (
              <>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">{t('sidebar.organization')}</p>
                <p className="text-sm font-semibold text-slate-800 mt-1 truncate">
                  {state.currentOrganization.name}
                </p>
                <TrialCountdownBanner className="mt-2" />
              </>
            ) : isGuestOnly ? (
              <>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">{t('sidebar.guest_access')}</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{t('sidebar.project_collaborator')}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {(state.collaborationProjects?.length || 0) === 1
                    ? t('sidebar.projects_accessible', { count: 1 })
                    : t('sidebar.projects_accessible_plural', { count: state.collaborationProjects?.length || 0 })}
                </p>
              </>
            ) : state.organizationLoading ? (
              <p className="text-xs text-slate-500">{t('sidebar.loading')}</p>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">{t('sidebar.organization')}</p>
                <p className="text-sm font-semibold text-slate-800 mt-1 truncate">{t('sidebar.no_organization')}</p>
              </>
            )}
          </div>
          <nav className="px-3 py-3 space-y-1 flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
            {navItems.map((item) => {
              const i18nKey = NAV_I18N_KEYS[item.label] || item.label.toLowerCase()
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={({ isActive }) => `block px-3 py-2.5 rounded-lg text-sm font-medium ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                >
                  {t(`navigation.${i18nKey}`)}
                </NavLink>
              )
            })}
          </nav>

          <div className="shrink-0 p-4 border-t border-slate-200 mt-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar name={displayName} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                title="Sign out"
                aria-label="Sign out"
              >
                <Icon path="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        <div className="flex flex-col min-h-0 h-screen max-h-screen overflow-hidden">
          <header className="lg:hidden shrink-0 bg-white/95 border-b border-slate-200 backdrop-blur-xs px-4 py-2 space-y-2">
            <nav className="flex items-center gap-1 flex-wrap">
              {navItems.map((item) => {
                const i18nKey = NAV_I18N_KEYS[item.label] || item.label.toLowerCase()
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `px-2.5 py-1.5 rounded-md text-xs font-medium ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                  >
                    {t(`navigation.${i18nKey}`)}
                  </NavLink>
                )
              })}
            </nav>
            <div className="flex items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Avatar name={displayName} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{displayName}</p>
                  <p className="text-[11px] text-slate-500 truncate">{roleLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                title="Sign out"
                aria-label="Sign out"
              >
                <Icon path="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" className="w-4 h-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 sm:p-6 pb-24">
            <div className="mx-auto max-w-[1600px] min-h-min">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
