import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Icon from './Icon';
import LiveActivityIndicator from './LiveActivityIndicator';
import EditableProfileAvatar from './EditableProfileAvatar';
import { VIEW_ROUTE_PATHS } from '../config/routes';

const ICONS = {
    Dashboard: <Icon path="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />,
    Projects: <Icon path="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />,
    Calendar: <Icon path="M6.75 3v2.25m10.5-2.25v2.25M3.75 11.25h16.5m-16.5 5.25h16.5m-16.5 5.25h16.5M5.625 3.75h12.75c1.035 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875H5.625c-1.035 0-1.875-.84-1.875-1.875V5.625c0-1.035.84-1.875 1.875-1.875z" />,
    Team: <Icon path="M7.5 6a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm7.5 2.25a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zM3 18.75a4.5 4.5 0 019 0v.75H3v-.75zm10.5.75v-.75a4.5 4.5 0 014.5-4.5 4.5 4.5 0 014.5 4.5v.75h-9z" />,
    Messages: <Icon path="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />,
    Contacts: <Icon path="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />,
    Organization: <Icon path="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />,
    Settings: <Icon path="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
};

const NAV_KEYS = { Dashboard: 'dashboard', Projects: 'projects', Calendar: 'calendar', Team: 'trade_partners', Organization: 'organization', Settings: 'settings' };

function Sidebar() {
    const { t } = useTranslation();
    const { state, dispatch } = useAppContext();
    const { addToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const projects = state.projects || [];

    const navigateForView = (targetView, { projectId = null } = {}) => {
        if (projectId) {
            navigate(`/projects/${projectId}/tasks`);
            return;
        }
        const route = VIEW_ROUTE_PATHS[targetView];
        if (!route) return;
        if (location.pathname === route) return;
        navigate(route);
    };

    const handleLogout = async () => {
        try {
            // Check if there's a valid session first
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            if (!session) {
                // No session exists, just clear local state
                console.log('No active session, clearing local state');
                dispatch({ type: 'SET_USER', payload: null });
                addToast(t('toast.signed_out_successfully'), 'success');
                return;
            }
            
            // Try to sign out
            const { error } = await supabaseClient.auth.signOut();
            if (error) {
                // If session is already missing or invalid, just clear local state
                if (error.message?.includes('session') || 
                    error.message?.includes('Session') || 
                    error.message?.includes('403') ||
                    error.status === 403) {
                    console.log('Session invalid, clearing local state');
                    dispatch({ type: 'SET_USER', payload: null });
                    addToast(t('toast.signed_out_successfully'), 'success');
                } else {
                    console.error('Sign out error:', error);
                    // Still clear local state even if there's an error
                    dispatch({ type: 'SET_USER', payload: null });
                    addToast(t('toast.signed_out_successfully'), 'success');
                }
            } else {
                addToast(t('toast.signed_out_successfully'), 'success');
            }
        } catch (err) {
            // Handle any errors gracefully - always clear local state
            console.log('Sign out error caught, clearing local state:', err);
            dispatch({ type: 'SET_USER', payload: null });
            addToast(t('toast.signed_out_successfully'), 'success');
        }
    };

    const handleStartTour = () => {
        // Clear onboarding preferences and trigger tour
        if (state.user) {
            localStorage.removeItem(`onboarding_${state.user.id}`);
            // Dispatch a custom event to trigger onboarding
            window.dispatchEvent(new CustomEvent('restartOnboarding'));
        }
    };
    const navItems = [
        { id: 'Dashboard', view: 'Dashboard' },
        { id: 'Projects', view: 'Projects' },
        { id: 'Calendar', view: 'Calendar' },
        { id: 'Team', view: 'Messages' },
        { id: 'Organization', view: 'Organization' },
        { id: 'Settings', view: 'Settings' }
    ];

    const stopSidebarWheelPropagation = (event) => {
        event.stopPropagation();
    };

    return (
        <aside
            className={`${isCollapsed ? 'w-16' : 'w-64'} min-w-16 h-screen sticky top-0 bg-white flex flex-col flex-shrink-0 border-r border-gray-100 overflow-hidden overscroll-y-contain transition-all duration-300`}
            onWheel={stopSidebarWheelPropagation}
        >
            <div className="shrink-0 h-16 flex items-center px-5 font-bold text-xl text-gray-800 border-b border-gray-100">
                {!isCollapsed && (
                    <span>SiteWeave</span>
                )}
                <button type="button" 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="ml-auto p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title={isCollapsed ? t('common.expand_sidebar') : t('common.collapse_sidebar')}
                    aria-label={isCollapsed ? t('common.expand_sidebar') : t('common.collapse_sidebar')}
                >
                    <Icon path={isCollapsed ? "M11 19l-7-7 7-7m8 14l-7-7 7-7" : "M13 5l7 7-7 7M5 5l7 7-7 7"} className="w-4 h-4" />
                </button>
            </div>
            {/* Organization Display */}
            {!isCollapsed && (
              <div className="shrink-0 px-5 py-3 border-b border-gray-200">
                {state.currentOrganization ? (
                  <>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{t('sidebar.organization')}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1 truncate">
                      {state.currentOrganization.name}
                    </p>
                  </>
                ) : state.isProjectCollaborator ? (
                  <>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{t('sidebar.guest_access')}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">
                      {t('sidebar.project_collaborator')}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {state.collaborationProjects.length === 1 ? t('sidebar.projects_accessible', { count: 1 }) : t('sidebar.projects_accessible_plural', { count: state.collaborationProjects.length })}
                    </p>
                  </>
                ) : state.organizationLoading ? (
                  <p className="text-xs text-gray-500">{t('sidebar.loading')}</p>
                ) : (
                  <p className="text-xs text-gray-500">{t('sidebar.no_organization')}</p>
                )}
              </div>
            )}
            <nav className="flex-1 min-h-0 px-3 py-2 space-y-1 overflow-y-auto overscroll-y-contain" data-onboarding="sidebar-nav" role="navigation" aria-label={t('sidebar.main_navigation')}>
                {navItems.map(item => (
                    <div key={item.id}>
                        <button type="button" 
                            onClick={() => {
                                const targetView = item.id === 'Team' && ['Messages', 'Contacts'].includes(state.activeView)
                                    ? state.activeView
                                    : item.view;
                                dispatch({type: 'SET_VIEW', payload: targetView});
                                let nextProjectId = state.selectedProjectId;
                                // Clear selected project when navigating away from Projects view
                                if (item.view !== 'Projects' && state.selectedProjectId) {
                                    dispatch({type: 'SET_PROJECT', payload: null});
                                    nextProjectId = null;
                                }
                                // Auto-select first project when clicking Projects if none is selected
                                if (item.view === 'Projects' && !state.selectedProjectId && projects.length > 0) {
                                    nextProjectId = projects[0].id;
                                    dispatch({type: 'SET_PROJECT', payload: nextProjectId});
                                }
                                if (item.view === 'Projects' && nextProjectId) {
                                    navigateForView('Projects', { projectId: nextProjectId });
                                } else {
                                    navigateForView(targetView);
                                }
                            }}
                            data-onboarding={item.id.toLowerCase()}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left ${
                                (item.id === 'Team'
                                    ? ['Team', 'Messages', 'Contacts'].includes(state.activeView)
                                    : state.activeView === item.view)
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                            title={isCollapsed ? t(`navigation.${NAV_KEYS[item.id]}`) : ''}
                            aria-label={t('common.navigate_to', { item: t(`navigation.${NAV_KEYS[item.id]}`) })}
                            aria-current={(item.id === 'Team'
                                ? ['Team', 'Messages', 'Contacts'].includes(state.activeView)
                                : state.activeView === item.view) ? 'page' : undefined}>
                            {React.cloneElement(ICONS[item.id], { className: "w-5 h-5 flex-shrink-0" })}
                            {!isCollapsed && <span className="ui-ellipsis-1">{t(`navigation.${NAV_KEYS[item.id]}`)}</span>}
                        </button>
                        {item.id === 'Projects' && state.activeView === 'Projects' && !isCollapsed && (
                            <div className="pl-8 mt-1.5 space-y-1 border-l-2 border-gray-200 ml-2.5" role="group" aria-label={t('sidebar.project_list')}>
                                {projects.map(p => (
                                    <button type="button" 
                                        key={p.id} 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            dispatch({type: 'SET_PROJECT', payload: p.id});
                                            // Ensure we're on Projects view to show project details
                                            if (state.activeView !== 'Projects') {
                                                dispatch({type: 'SET_VIEW', payload: 'Projects'});
                                            }
                                            navigateForView('Projects', { projectId: p.id });
                                        }}
                                        className={`block text-sm py-1 truncate w-full text-left ${state.selectedProjectId === p.id ? 'text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-800'}`}
                                        aria-label={t('common.select_project', { name: p.name })}
                                        aria-current={state.selectedProjectId === p.id ? 'page' : undefined}>
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </nav>
             <div className="shrink-0 p-4 border-t border-gray-200 space-y-3">
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {isCollapsed ? (
                        <EditableProfileAvatar
                            name={state.user?.user_metadata?.full_name || state.user?.email}
                            size="lg"
                            hintClassName="sr-only"
                        />
                    ) : null}
                    {!isCollapsed && (
                        <div className="flex items-center gap-3">
                            <EditableProfileAvatar
                                name={state.user?.user_metadata?.full_name || state.user?.email}
                                size="lg"
                                hintClassName="sr-only"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">
                                    {state.user?.user_metadata?.full_name || state.user?.email}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                    {state.userRole?.name || (state.isProjectCollaborator ? t('settings.guest_collaborator') : t('common.user'))}
                                </p>
                            </div>
                        </div>
                    )}
                    <button type="button"
                        onClick={handleLogout}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                        title={t('common.sign_out')}
                    >
                        <Icon path="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" className="w-4 h-4" />
                    </button>
                </div>
                
                <LiveActivityIndicator />
            </div>
        </aside>
    );
}

export default Sidebar;