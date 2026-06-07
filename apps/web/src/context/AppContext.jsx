import React, { createContext, useContext, useEffect, useReducer, useState, useRef, useCallback } from 'react';
import {
  clearMemoryCache,
  PROJECT_LIST_COLUMNS,
  loadWithFallback,
  clearStaleSupabaseSession,
  isStaleRefreshTokenError,
  sortProjectsByRecency,
} from '@siteweave/core-logic';
import supabaseElectronAuth from '../utils/supabaseElectronAuth';
import { resetInviteBootstrapState } from '../utils/workspaceClient';
import { dedupeTasksById } from '../utils/taskDedupe';
import {
  analyzeSemanticTaskDuplicates,
  analyzeTaskDuplicates,
  logSemanticTaskDuplicateReport,
  logTaskDuplicateReport,
} from '../utils/taskDuplicateDiagnostics';

// --- SUPABASE CLIENT (single instance — must match useSession / LoginForm) ---
import { supabase as supabaseClient } from '../supabaseClient';

// Inject the canonical client into the Electron OAuth handler so it can do the
// PKCE code-for-session exchange itself (no React mount required).
supabaseElectronAuth.init(supabaseClient);

export { supabaseClient };

export const AppContext = createContext();

/** Latest reducer state for lazy loaders (avoids stale closures across `await import()` / network). */
const appStateRefForLazy = { current: null };

// Helper functions for sessionStorage persistence
const STORAGE_KEY = 'siteweave_app_state';
const STORAGE_USER_KEY = 'siteweave_user_id';

/** Stable project shape for UI/debug (e.g. start_date always present, not omitted by realtime payloads). */
function normalizeProjectRecord(p) {
  if (!p || typeof p !== 'object') return p;
  return { ...p, start_date: p.start_date ?? null };
}

function normalizeProjectsArray(list) {
  if (!Array.isArray(list)) return list;
  return sortProjectsByRecency(list.map(normalizeProjectRecord));
}

const saveStateToStorage = (state) => {
  try {
    // Only save data arrays, not user/auth state
    const dataToSave = {
      projects: state.projects,
      contacts: state.contacts,
      tasks: state.tasks,
      files: state.files,
      calendarEvents: state.calendarEvents,
      activityLog: state.activityLog,
      selectedProjectId: state.selectedProjectId,
      activeView: state.activeView,
      timestamp: Date.now()
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    if (state.user?.id) {
      sessionStorage.setItem(STORAGE_USER_KEY, state.user.id);
    }
  } catch (error) {
    console.warn('Failed to save state to sessionStorage:', error);
  }
};

const loadStateFromStorage = (currentUserId) => {
  try {
    const savedUserId = sessionStorage.getItem(STORAGE_USER_KEY);
    // Only restore if it's the same user
    if (!currentUserId || savedUserId !== currentUserId) {
      return null;
    }
    
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    
    const parsed = JSON.parse(saved);
    // Only use cached data if it's less than 10 minutes old
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - parsed.timestamp > maxAge) {
      return null;
    }
    
    return {
      projects: normalizeProjectsArray(parsed.projects || []),
      contacts: parsed.contacts || [],
      tasks: parsed.tasks || [],
      files: parsed.files || [],
      calendarEvents: parsed.calendarEvents || [],
      activityLog: parsed.activityLog || [],
      selectedProjectId: parsed.selectedProjectId || null,
      activeView: parsed.activeView || 'Dashboard'
    };
  } catch (error) {
    console.warn('Failed to load state from sessionStorage:', error);
    return null;
  }
};

const getInitialState = () => {
  const baseState = {
    isLoading: true, 
    authLoading: true, // Add separate auth loading state
    activeView: 'Dashboard', 
    selectedProjectId: null, 
    projects: [], contacts: [], tasks: [], files: [], calendarEvents: [], activityLog: [],
    user: null, // Changed from hardcoded user to null for proper auth
    userContactId: null, // The user's linked contact_id (from profiles table) — used for matching assignee_id on tasks
    profileAvatarUrl: null, // Canonical contacts.avatar_url for the signed-in user
    userPreferences: null, // Add user preferences for onboarding
    currentOrganization: null, // Current organization context
    userRole: null, // User's role with permissions
    mustChangePassword: false, // Flag to force password reset for managed accounts
    organizationError: null, // Error message if user has no organization
    organizationLoading: false, // Loading state for organization check
    isProjectCollaborator: false, // User is a guest collaborator
    collaborationProjects: [], // Projects user can access as collaborator
    accountIntent: 'workspace_owner',
    // Lazy loading flags
    tasksLoaded: false,
    filesLoaded: false,
    calendarEventsLoaded: false,
    myDayTasksLoaded: false,
    projectPhasesByProjectId: {},
    projectPhasesLoadingByProjectId: {},
  };
  
  // Try to restore from sessionStorage (will be null if no user or different user)
  const restored = loadStateFromStorage(null); // We'll restore after user is known
  if (restored) {
    return { ...baseState, ...restored };
  }
  
  return baseState;
};

const initialState = getInitialState();

function appReducer(state, action) {
  let newState;
  switch (action.type) {
    case 'SET_DATA': {
      // Preserve current activeView if not provided in payload (to prevent resetting on data refresh)
      const payload = { ...action.payload };
      if (payload.projects !== undefined) {
        payload.projects = normalizeProjectsArray(payload.projects);
      }
      newState = {
        ...state,
        ...payload,
        activeView: action.payload.activeView !== undefined ? action.payload.activeView : state.activeView,
        isLoading: false,
      };
      saveStateToStorage(newState);
      return newState;
    }
    case 'SET_VIEW': 
      newState = { ...state, activeView: action.payload };
      saveStateToStorage(newState);
      return newState;
    case 'SET_PROJECT': return { ...state, selectedProjectId: action.payload };
    case 'SET_USER': 
      // When user is cleared (logout), also clear userContactId to prevent stale data
      return {
        ...state,
        user: action.payload,
        userContactId: action.payload ? state.userContactId : null,
        profileAvatarUrl: action.payload ? state.profileAvatarUrl : null,
      };
    case 'SET_USER_CONTACT_ID': return { ...state, userContactId: action.payload };
    case 'SET_PROFILE_AVATAR_URL': return { ...state, profileAvatarUrl: action.payload };
    case 'SET_AUTH_LOADING': return { ...state, authLoading: action.payload };
    case 'ADD_PROJECT': {
      const project = normalizeProjectRecord(action.payload);
      const withoutDup = state.projects.filter((p) => p.id !== project.id);
      newState = { ...state, projects: [project, ...withoutDup] };
      saveStateToStorage(newState);
      return newState;
    }
    case 'UPDATE_PROJECT': {
      const existing = state.projects.find((p) => p.id === action.payload.id);
      const updated = normalizeProjectRecord({ ...existing, ...action.payload });
      const rest = state.projects.filter((p) => p.id !== updated.id);
      newState = { ...state, projects: [updated, ...rest] };
      saveStateToStorage(newState);
      return newState;
    }
    case 'DELETE_PROJECT': 
      newState = { ...state, projects: state.projects.filter(p => p.id !== action.payload) };
      saveStateToStorage(newState);
      return newState;
    case 'ADD_TASK': {
      const id = action.payload?.id;
      if (id != null) {
        const key = String(id);
        const idx = state.tasks.findIndex((t) => t?.id != null && String(t.id) === key);
        if (idx >= 0) {
          const next = state.tasks.slice();
          next[idx] = action.payload;
          return { ...state, tasks: next };
        }
      }
      return { ...state, tasks: [...state.tasks, action.payload] };
    }
    case 'UPDATE_TASK': return { ...state, tasks: state.tasks.map(task => task.id === action.payload.id ? action.payload : task) };
    case 'DELETE_TASK': return { ...state, tasks: state.tasks.filter(task => task.id !== action.payload) };
    case 'REORDER_TASKS': return { ...state, tasks: action.payload };
    case 'ADD_FILE': return { ...state, files: [...state.files, action.payload] };
    case 'ADD_EVENT': return { ...state, calendarEvents: [...state.calendarEvents, action.payload] };
    case 'UPDATE_EVENT': return { 
      ...state, 
      calendarEvents: state.calendarEvents.map(event => 
        event.id === action.payload.id ? action.payload : event
      ) 
    };
    case 'DELETE_EVENT': return { 
      ...state, 
      calendarEvents: state.calendarEvents.filter(event => event.id !== action.payload) 
    };
    case 'ADD_ACTIVITY': return { ...state, activityLog: [action.payload, ...state.activityLog].slice(0, 50) }; // Keep latest 50
    case 'ADD_CONTACT': {
      // Ensure project_contacts is always an array and prevent duplicates
      const newContact = { ...action.payload, project_contacts: Array.isArray(action.payload.project_contacts) ? action.payload.project_contacts : [] };

      // Check if contact already exists (to prevent duplicates from real-time subscription)
      const exists = state.contacts.some(c => c.id === newContact.id);
      if (exists) {
        const existing = state.contacts.find(c => c.id === newContact.id);
        const mergedProjectContacts = [...(Array.isArray(existing?.project_contacts) ? existing.project_contacts : [])];
        for (const pc of newContact.project_contacts) {
          if (!mergedProjectContacts.some((p) => String(p.project_id) === String(pc.project_id))) {
            mergedProjectContacts.push(pc);
          }
        }
        return {
          ...state,
          contacts: state.contacts.map(c => c.id === newContact.id
            ? { ...newContact, project_contacts: mergedProjectContacts }
            : c),
        };
      }

      return { ...state, contacts: [...state.contacts, newContact] };
    }
    case 'UPDATE_CONTACT': return { 
      ...state, 
      contacts: state.contacts.map(contact => 
        contact.id === action.payload.id ? action.payload : contact
      ) 
    };
    case 'DELETE_CONTACT': return { 
      ...state, 
      contacts: state.contacts.filter(contact => contact.id !== action.payload) 
    };
    case 'ADD_PROJECT_CONTACT': return {
      ...state,
      contacts: state.contacts.map(c => {
        if (c.id !== action.payload.contact_id) return c;
        const existing = Array.isArray(c.project_contacts) ? c.project_contacts : [];
        const alreadyLinked = existing.some(
          (pc) => String(pc.project_id) === String(action.payload.project_id),
        );
        if (alreadyLinked) return c;
        return {
          ...c,
          project_contacts: [...existing, {
            project_id: action.payload.project_id,
            role: action.payload.role,
          }],
        };
      }),
    };
    case 'REMOVE_PROJECT_CONTACT': return {
      ...state,
      contacts: state.contacts.map(c => c.id === action.payload.contact_id
        ? { ...c, project_contacts: (Array.isArray(c.project_contacts) ? c.project_contacts : []).filter(pc => String(pc.project_id) !== String(action.payload.project_id)) }
        : c
      )
    };
    case 'SET_USER_PREFERENCES': return { ...state, userPreferences: action.payload };
    case 'UPDATE_USER_PREFERENCES': return { ...state, userPreferences: { ...state.userPreferences, ...action.payload } };
    case 'SET_ORGANIZATION': return { ...state, currentOrganization: action.payload };
    case 'SET_USER_ROLE': return { ...state, userRole: action.payload };
    case 'SET_MUST_CHANGE_PASSWORD': return { ...state, mustChangePassword: action.payload };
    case 'SET_ORGANIZATION_ERROR': return { ...state, organizationError: action.payload };
    case 'SET_ORGANIZATION_LOADING': return { ...state, organizationLoading: action.payload };
    case 'SET_COLLABORATOR_STATUS': return {
      ...state,
      isProjectCollaborator: action.payload.isCollaborator,
      collaborationProjects: normalizeProjectsArray(action.payload.projects || []),
    };
    case 'SET_ACCOUNT_INTENT':
      return { ...state, accountIntent: action.payload };
    case 'SET_CONTACTS': {
      newState = { ...state, contacts: action.payload };
      saveStateToStorage(newState);
      return newState;
    }
    case 'SET_PROJECT_PHASES': {
      newState = {
        ...state,
        projectPhasesByProjectId: {
          ...state.projectPhasesByProjectId,
          [action.payload.projectId]: action.payload.phases,
        },
        projectPhasesLoadingByProjectId: {
          ...state.projectPhasesLoadingByProjectId,
          [action.payload.projectId]: false,
        },
      };
      return newState;
    }
    case 'SET_PROJECT_PHASES_LOADING':
      return {
        ...state,
        projectPhasesLoadingByProjectId: {
          ...state.projectPhasesLoadingByProjectId,
          [action.payload.projectId]: action.payload.loading,
        },
      };
    case 'SET_MY_DAY_TASKS_LOADED':
      return { ...state, myDayTasksLoaded: action.payload };
    case 'RESET_LAZY_DATA': {
      newState = {
        ...state,
        tasks: [],
        files: [],
        calendarEvents: [],
        tasksLoaded: false,
        filesLoaded: false,
        calendarEventsLoaded: false,
        myDayTasksLoaded: false,
        projectPhasesByProjectId: {},
        projectPhasesLoadingByProjectId: {},
      };
      saveStateToStorage(newState);
      return newState;
    }
    case 'MERGE_TASKS':
      return { ...state, tasks: dedupeTasksById(action.payload) };
    case 'SET_TASKS_LOADED': return { ...state, tasks: dedupeTasksById(action.payload), tasksLoaded: true };
    case 'SET_FILES_LOADED': return { ...state, files: action.payload, filesLoaded: true };
    case 'SET_CALENDAR_EVENTS_LOADED': return { ...state, calendarEvents: action.payload, calendarEventsLoaded: true };
    default: return state;
  }
}

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  appStateRefForLazy.current = state;
  const currentActiveViewRef = useRef(state.activeView);
  /** Last org id after a successful fetch — used to reset lazy-loaded data on org / user context change */
  const lastOrgIdForLazyRef = useRef(undefined);
  const currentOrganizationIdRef = useRef(state.currentOrganization?.id ?? null);
  const taskDupWatchSigRef = useRef('');

  useEffect(() => {
    currentOrganizationIdRef.current = state.currentOrganization?.id ?? null;
  }, [state.currentOrganization?.id]);

  // Keep ref in sync with state
  useEffect(() => {
    currentActiveViewRef.current = state.activeView;
  }, [state.activeView]);

  useEffect(() => {
    if (!state.user) {
      lastOrgIdForLazyRef.current = undefined;
    }
  }, [state.user]);

  // Expose debug helpers to window for console access (development only)
  useEffect(() => {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      window.__SITEWEAVE_DEBUG__ = {
        getState: () => state,
        getSupabase: () => supabaseClient,
        clearSetupWizard: async () => {
          const orgId = state.currentOrganization?.id;
          if (!orgId) {
            console.log('No current organization — cannot reset setup wizard');
            return;
          }
          const { error } = await supabaseClient
            .from('organizations')
            .update({ setup_wizard_completed_at: null })
            .eq('id', orgId);
          if (error) {
            console.error('clearSetupWizard failed:', error);
          } else {
            console.log('organizations.setup_wizard_completed_at cleared for org', orgId);
          }
        },
        checkSetupWizard: () => {
          if (!state.user?.id) {
            console.log('No user logged in');
            return null;
          }
          const info = {
            userId: state.user.id,
            userRole: state.userRole?.name,
            created_by_user_id: state.currentOrganization?.created_by_user_id,
            isFoundingAdmin:
              state.currentOrganization?.created_by_user_id != null &&
              state.currentOrganization.created_by_user_id === state.user.id,
            setup_wizard_completed_at: state.currentOrganization?.setup_wizard_completed_at,
            wizardWouldShow:
              state.userRole?.name === 'Org Admin' &&
              state.currentOrganization?.created_by_user_id === state.user.id &&
              !state.currentOrganization?.setup_wizard_completed_at
          };
          console.log('Setup wizard status:', info);
          return info;
        },
        getOrganization: () => {
          console.log('Current organization:', state.currentOrganization);
          return state.currentOrganization;
        },
        getUser: () => {
          console.log('Current user:', state.user);
          return state.user;
        },
        /** Pass nothing to analyze current `state.tasks`, or pass any task array. */
        analyzeTaskDuplicates: (tasks) => analyzeTaskDuplicates(tasks ?? state.tasks),
        /** Log duplicate task ids (array indices, text, project_id). Dev only. */
        inspectTaskDuplicates: () => logTaskDuplicateReport(state.tasks, 'state.tasks'),
        /** Log automatically when duplicate ids appear or change. Call with `false` to stop. */
        enableTaskDuplicateWatch: (on = true) => {
          window.__SITEWEAVE_TASK_DUP_WATCH__ = !!on;
          console.log(
            on
              ? '[task-dup-watch] ON — logs when duplicate ids appear or change (dev only).'
              : '[task-dup-watch] OFF.',
          );
        },
        /** Same title + phase + start_date but different task ids. `projectId` optional — defaults to selected project; omit both to scan all tasks. */
        analyzeSemanticTaskDuplicates: (tasks, projectId) => {
          const list = tasks ?? state.tasks;
          let pid = projectId;
          if (pid === undefined || pid === null || pid === '') {
            pid = state.selectedProjectId ?? null;
          }
          return analyzeSemanticTaskDuplicates(list, pid);
        },
        inspectSemanticTaskDuplicates: (projectId) => {
          const tasks = state.tasks || [];
          let pid = projectId;
          if (pid === undefined || pid === null || pid === '') {
            pid = state.selectedProjectId ?? null;
          }
          return logSemanticTaskDuplicateReport(tasks, pid, 'state.tasks');
        },
      };
    }
  }, [state]);

  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env.DEV) return;
    if (!window.__SITEWEAVE_TASK_DUP_WATCH__) return;
    const report = analyzeTaskDuplicates(state.tasks || []);
    const sig = report.duplicateGroups
      .map((g) => `${g.id}:${g.count}`)
      .sort()
      .join('|');
    if (report.duplicateGroups.length === 0) {
      taskDupWatchSigRef.current = '';
      return;
    }
    if (sig === taskDupWatchSigRef.current) return;
    taskDupWatchSigRef.current = sig;
    console.warn('[task-dup-watch] Duplicate task ids detected in state.tasks');
    logTaskDuplicateReport(state.tasks, 'state.tasks (watch)');
  }, [state.tasks]);

  useEffect(() => {
    // Check for existing session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) {
          if (isStaleRefreshTokenError(error)) {
            console.warn('Stale session cleared; sign in again.');
            await clearStaleSupabaseSession(supabaseClient);
            dispatch({ type: 'SET_USER', payload: null });
          } else {
            console.error('Error getting session:', error);
          }
        } else if (session?.user) {
          dispatch({ type: 'SET_USER', payload: session.user });
          // Restore cached data immediately when user is set, but preserve current activeView
            const cachedData = loadStateFromStorage(session.user.id);
          if (cachedData) {
            // Preserve current activeView if it's already set (user is navigating)
            const activeViewToUse = currentActiveViewRef.current && currentActiveViewRef.current !== 'Dashboard' 
              ? currentActiveViewRef.current 
              : (cachedData.activeView || 'Dashboard');
            // Omit tasks so we don't overwrite in-memory tasks loaded by project view
            const { tasks: _omitTasks, ...rest } = cachedData;
            dispatch({ type: 'SET_DATA', payload: { 
              ...rest, 
              activeView: activeViewToUse,
              isLoading: false 
            } });
          }
        }
      } catch (error) {
          if (isStaleRefreshTokenError(error)) {
            console.warn('Stale session cleared; sign in again.');
            await clearStaleSupabaseSession(supabaseClient);
            dispatch({ type: 'SET_USER', payload: null });
            sessionStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(STORAGE_USER_KEY);
          } else {
            console.error('Error getting session:', error);
          }
      } finally {
        dispatch({ type: 'SET_AUTH_LOADING', payload: false });
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        try {
          // Handle token refresh errors
          if (event === 'TOKEN_REFRESHED' && !session) {
            console.warn('Token refresh failed; clearing local session.');
            await clearStaleSupabaseSession(supabaseClient);
            dispatch({ type: 'SET_USER', payload: null });
            sessionStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(STORAGE_USER_KEY);
          } else if (session?.user) {
            dispatch({ type: 'SET_USER', payload: session.user });
            // Do not restore cache here (e.g. on token refresh) so we don't overwrite in-memory state like project tasks
          } else {
            resetInviteBootstrapState();
            dispatch({ type: 'SET_USER', payload: null });
            // Clear cached data on logout
            sessionStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(STORAGE_USER_KEY);
          }
        } catch (error) {
          if (isStaleRefreshTokenError(error)) {
            console.warn('Stale session cleared; sign in again.');
            await clearStaleSupabaseSession(supabaseClient);
            dispatch({ type: 'SET_USER', payload: null });
            sessionStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(STORAGE_USER_KEY);
          } else {
            console.error('Error handling auth state change:', error);
          }
        } finally {
          dispatch({ type: 'SET_AUTH_LOADING', payload: false });
        }
      }
    );

    // Electron OAuth callbacks are handled directly inside `supabaseElectronAuth`
    // (which runs the PKCE code-for-session exchange and dispatches
    // `supabase-oauth-success` / `supabase-oauth-error`). We still listen here as
    // a defensive fallback so the UI updates even if `onAuthStateChange` misses
    // the event for any reason.
    const handleOAuthSuccess = (event) => {
      const session = event?.detail?.session;
      console.log('[OAuth] Success event received in AppContext:', !!session?.user);
      if (session?.user) {
        dispatch({ type: 'SET_USER', payload: session.user });
        dispatch({ type: 'SET_AUTH_LOADING', payload: false });
      }
    };
    window.addEventListener('supabase-oauth-success', handleOAuthSuccess);

    // Listen for postMessage from OAuth callback window
    const handlePostMessage = (event) => {
      if (event.data && event.data.type === 'supabase-oauth-callback') {
        console.log('Received OAuth callback via postMessage:', event.data);
        const { hash } = event.data;
        
        if (hash) {
          // Parse hash parameters
          const hashParams = new URLSearchParams(hash);
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const expiresAt = hashParams.get('expires_at');
          const tokenType = hashParams.get('token_type') || 'bearer';
          
          if (accessToken) {
            // Parse user from token
            let user = null;
            try {
              const payload = JSON.parse(atob(accessToken.split('.')[1]));
              user = {
                id: payload.sub,
                email: payload.email,
                user_metadata: payload.user_metadata || {},
                app_metadata: payload.app_metadata || {}
              };
            } catch (error) {
              console.error('Error parsing token:', error);
            }

            const session = {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: expiresAt ? parseInt(expiresAt) : null,
              token_type: tokenType,
              user: user
            };

            console.log('Setting session from postMessage:', session);
            supabaseClient.auth.setSession(session);
          }
        }
      }
    };

    window.addEventListener('message', handlePostMessage);

    // Global error handler for unhandled Supabase auth errors
    const handleUnhandledError = (event) => {
      const error = event.reason || event.error;
      if (!error) return;
      
      if (isStaleRefreshTokenError(error)) {
        console.warn('Stale session cleared; sign in again.');
        event.preventDefault();
        void clearStaleSupabaseSession(supabaseClient);
        dispatch({ type: 'SET_USER', payload: null });
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledError);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handlePostMessage);
      window.removeEventListener('unhandledrejection', handleUnhandledError);
      window.removeEventListener('supabase-oauth-success', handleOAuthSuccess);
    };
  }, []);

  useEffect(() => {
    if (!state.user) {
      clearMemoryCache();
    }
  }, [state.user]);

  useEffect(() => {
    if (!state.authLoading && state.user) {
      // Only fetch data if user is authenticated
      async function fetchInitialData() {
        const startTime = performance.now();

        // Start projects fetch immediately so the UI can render while profile/org work continues.
        const projectsFetchPromise = (async () => {
          try {
            const { data: projects, error: projectsError } = await supabaseClient
              .from('projects')
              .select(PROJECT_LIST_COLUMNS)
              .order('updated_at', { ascending: false });
            if (projectsError) throw projectsError;
            return projects || [];
          } catch (projectsErr) {
            console.error('Error loading projects on boot:', projectsErr);
            return appStateRefForLazy.current?.projects?.length
              ? appStateRefForLazy.current.projects
              : [];
          }
        })();
        
        try {
          // First, check if user has a profile
          const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', state.user.id)
            .maybeSingle();
          
          if (profileError) {
            console.error('Profile error:', profileError);
          }
          
          let finalProfile = profile;
          let contactId = profile?.contact_id;
          
          // If no profile exists, create one and ensure contact exists
          if (!profile && !profileError) {
            console.log('Creating profile for user:', state.user.id);
            
            // First, check if contact exists by email
            let contactIdToLink = null;
            if (state.user.email) {
              const { data: existingContact } = await supabaseClient
                .from('contacts')
                .select('id')
                .ilike('email', state.user.email)
                .maybeSingle();
              
              if (existingContact) {
                contactIdToLink = existingContact.id;
                console.log('Found existing contact for new profile:', contactIdToLink);
              } else {
                // Create contact for new user
                const { data: newContact, error: contactError } = await supabaseClient
                .from('contacts')
                .insert({
                    name: state.user.user_metadata?.full_name || state.user.email.split('@')[0] || 'User',
                    email: state.user.email,
                    type: 'Team',
                    role: 'Team Member',
                    status: 'Available',
                    created_by_user_id: state.user.id,
                    organization_id: finalProfile?.organization_id || null
                  })
                  .select('id')
                  .single();
                
                if (!contactError && newContact) {
                  contactIdToLink = newContact.id;
                  console.log('Created new contact for new profile:', contactIdToLink);
                } else {
                  console.error('Error creating contact for new profile:', contactError);
                }
              }
            }
            
            const { error: createProfileError } = await supabaseClient
              .from('profiles')
              .upsert({
                id: state.user.id,
                role_id: null, // Will be assigned when user joins organization
                contact_id: contactIdToLink,
                organization_id: null // Will be assigned via invitation
              }, {
                onConflict: 'id'
              });
            
            if (createProfileError) {
              console.error('Error creating profile:', createProfileError);
            } else {
              console.log('Profile created successfully with contact_id:', contactIdToLink);
              // Re-fetch the profile
              const { data: newProfile } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', state.user.id)
                .single();
              finalProfile = newProfile;
              contactId = contactIdToLink;
            }
          }
          
          // If profile exists but no contact_id, ensure user has a contact
          if (finalProfile && !finalProfile.contact_id && state.user.email) {
            console.log('Profile exists but no contact_id. Ensuring contact exists for email:', state.user.email);
            
            // First, try to find existing contact by email
            const { data: existingContact } = await supabaseClient
              .from('contacts')
              .select('id')
              .ilike('email', state.user.email)
              .maybeSingle();
            
            if (existingContact) {
              console.log('Found existing contact, linking to profile:', existingContact.id);
              const { error: linkError } = await supabaseClient
                .from('profiles')
                .update({ contact_id: existingContact.id })
                .eq('id', state.user.id);
              
              if (linkError) {
                console.error('Error linking contact to profile:', linkError);
              } else {
                contactId = existingContact.id;
                console.log('Successfully linked contact to profile');
              }
            } else {
              // No existing contact found - create one for the user
              console.log('No existing contact found. Creating new contact for user:', state.user.email);
              const { data: newContact, error: createContactError } = await supabaseClient
                .from('contacts')
                .insert({
                  name: state.user.user_metadata?.full_name || state.user.email.split('@')[0] || 'User',
                  email: state.user.email,
                  type: finalProfile.role === 'Client' ? 'Client' : 'Team',
                  role: finalProfile.role === 'PM' ? 'PM' : finalProfile.role === 'Admin' ? 'Admin' : 'Team Member',
                  status: 'Available',
                  created_by_user_id: state.user.id,
                  organization_id: finalProfile?.organization_id || null
                })
                .select('id')
                .single();
              
              if (createContactError) {
                console.error('Error creating contact:', createContactError);
              } else if (newContact) {
                console.log('Created new contact:', newContact.id);
                // Link the new contact to the profile
                const { error: linkError } = await supabaseClient
                  .from('profiles')
                  .update({ contact_id: newContact.id })
                  .eq('id', state.user.id);
                
                if (linkError) {
                  console.error('Error linking new contact to profile:', linkError);
                } else {
                  contactId = newContact.id;
                  console.log('Successfully created and linked contact to profile');
                }
              }
            }
          } else if (finalProfile?.contact_id) {
            contactId = finalProfile.contact_id;
          }
          
          // Store the user's contact_id in global state so components can match against assignee_id
          if (contactId) {
            dispatch({ type: 'SET_USER_CONTACT_ID', payload: contactId });
          }

          // Returning-user fast path: existing profile + org, no pending invite/signup flows.
          const {
            isReturningUserFastPath,
            runBackgroundBoot,
          } = await import('../utils/bootBackground');

          if (isReturningUserFastPath(profile, finalProfile, state.user)) {
            const [profileWithOrgResult, orgResult, finalProjects] = await Promise.all([
              supabaseClient
                .from('profiles')
                .select(`
                  organization_id,
                  role_id,
                  account_intent,
                  roles (
                    id,
                    name,
                    permissions,
                    is_system_role
                  )
                `)
                .eq('id', state.user.id)
                .single(),
              supabaseClient
                .from('organizations')
                .select('*')
                .eq('id', finalProfile.organization_id)
                .single(),
              projectsFetchPromise,
            ]);

            const profileWithOrg = profileWithOrgResult.data;
            const organization = orgResult.data;

            if (profileWithOrg && organization && !profileWithOrgResult.error && !orgResult.error) {
              if (profileWithOrg.account_intent) {
                dispatch({ type: 'SET_ACCOUNT_INTENT', payload: profileWithOrg.account_intent });
              }
              dispatch({ type: 'SET_ORGANIZATION', payload: organization });
              dispatch({ type: 'SET_USER_ROLE', payload: profileWithOrg.roles ?? null });
              dispatch({ type: 'SET_ORGANIZATION_ERROR', payload: null });
              dispatch({ type: 'SET_COLLABORATOR_STATUS', payload: { isCollaborator: false, projects: [] } });

              lastOrgIdForLazyRef.current = organization.id ?? null;

              dispatch({ type: 'SET_DATA', payload: {
                projects: finalProjects || [],
                activeView: currentActiveViewRef.current || state.activeView,
              }});

              runBackgroundBoot({
                supabaseClient,
                dispatch,
                user: state.user,
                organization,
                finalProjects: finalProjects || [],
                finalProfile,
                profileWithOrg,
                currentActiveView: currentActiveViewRef.current || state.activeView,
              });

              return;
            }
          }

          if (state.user?.id) {
            try {
              const { resolveUserAvatarUrl } = await import('@siteweave/core-logic');
              const avatarUrl = await resolveUserAvatarUrl(supabaseClient, state.user.id);
              dispatch({ type: 'SET_PROFILE_AVATAR_URL', payload: avatarUrl });
            } catch (avatarErr) {
              console.warn('Could not load profile avatar:', avatarErr);
            }
          }

          try {
            const workspaceClient = await import('../utils/workspaceClient');
            const pendingIntent = sessionStorage.getItem('pendingAccountIntent');
            if (pendingIntent) {
              sessionStorage.removeItem('pendingAccountIntent');
              await supabaseClient.from('profiles').upsert({
                id: state.user.id,
                account_intent: pendingIntent,
                role: 'Team',
              }, { onConflict: 'id' });
            }
            await workspaceClient.runInviteBootstrap(supabaseClient);
          } catch (bootstrapErr) {
            console.warn('Account bootstrap (invites/provision):', bootstrapErr);
          }

          try {
            const meta = state.user?.user_metadata || {};
            if (meta.pending_organization_id) {
              const { data: pendingResult, error: pendingErr } = await supabaseClient.functions.invoke(
                'update-profile-organization',
                {
                  body: {
                    userId: state.user.id,
                    organizationId: meta.pending_organization_id,
                    roleId: meta.pending_role_id ?? null,
                    contactId: meta.pending_contact_id ?? null,
                  },
                },
              );
              if (!pendingErr && pendingResult?.success) {
                if (meta.pending_invitation_id) {
                  const { error: inviteAcceptError } = await supabaseClient
                    .from('invitations')
                    .update({
                      status: 'accepted',
                      accepted_at: new Date().toISOString(),
                    })
                    .eq('id', meta.pending_invitation_id);
                  if (inviteAcceptError) {
                    console.warn('Could not mark pending invitation accepted:', inviteAcceptError);
                  }
                }
                const nextMeta = { ...meta };
                delete nextMeta.pending_organization_id;
                delete nextMeta.pending_role_id;
                delete nextMeta.pending_contact_id;
                delete nextMeta.pending_invitation_id;
                await supabaseClient.auth.updateUser({ data: nextMeta });
              }
            }
          } catch (pendingOrgErr) {
            console.warn('Pending org invite completion:', pendingOrgErr);
          }
          
          // Load organization and user role
          const { data: profileWithOrg } = await supabaseClient
            .from('profiles')
            .select(`
              organization_id,
              role_id,
              account_intent,
              roles (
                id,
                name,
                permissions,
                is_system_role
              )
            `)
            .eq('id', state.user.id)
            .single();

          if (profileWithOrg?.account_intent) {
            dispatch({ type: 'SET_ACCOUNT_INTENT', payload: profileWithOrg.account_intent });
          }
          
          // Check must_change_password separately (column may not exist in older schemas)
          let mustChangePassword = false;
          try {
            const { data: profileCheck } = await supabaseClient
              .from('profiles')
              .select('must_change_password')
              .eq('id', state.user.id)
              .single();
            mustChangePassword = profileCheck?.must_change_password || false;
          } catch (error) {
            // Column doesn't exist yet, default to false
            console.warn('must_change_password column not found, defaulting to false:', error);
            mustChangePassword = false;
          }

          let organization = null;
          if (profileWithOrg?.organization_id) {
            const { data: orgData } = await supabaseClient
              .from('organizations')
              .select('*')
              .eq('id', profileWithOrg.organization_id)
              .single();
            organization = orgData;
            dispatch({ type: 'SET_ORGANIZATION', payload: orgData });
            dispatch({ type: 'SET_USER_ROLE', payload: profileWithOrg.roles });
            // Clear any organization errors if org is found
            dispatch({ type: 'SET_ORGANIZATION_ERROR', payload: null });
            dispatch({ type: 'SET_COLLABORATOR_STATUS', payload: { isCollaborator: false, projects: [] } });
          } else {
            // No organization found - check for project collaborations
            dispatch({ type: 'SET_ORGANIZATION_LOADING', payload: true });
            try {
              const { getUserCollaborationProjects } = await import('../utils/projectCollaborationService');
              const collaborations = await getUserCollaborationProjects(supabaseClient, state.user.id);
              
              if (collaborations && collaborations.length > 0) {
                // User is a collaborator - allow access
                const collaborationProjects = collaborations.map(c => c.projects).filter(Boolean);
                dispatch({ 
                  type: 'SET_COLLABORATOR_STATUS', 
                  payload: { 
                    isCollaborator: true, 
                    projects: collaborationProjects 
                  } 
                });
                dispatch({ type: 'SET_ORGANIZATION_ERROR', payload: null });
                console.log('User is a project collaborator with', collaborations.length, 'project(s)');
              } else {
                const intent = profileWithOrg?.account_intent || 'workspace_owner';
                dispatch({ type: 'SET_ACCOUNT_INTENT', payload: intent });
                if (intent === 'workspace_owner') {
                  try {
                    const { provisionPersonalWorkspace } = await import('../utils/workspaceClient');
                    const prov = await provisionPersonalWorkspace(supabaseClient);
                    if (prov?.success && prov.organization) {
                      const { data: adminRole } = await supabaseClient
                        .from('roles')
                        .select('*')
                        .eq('organization_id', prov.organization.id)
                        .eq('name', 'Org Admin')
                        .maybeSingle();
                      dispatch({ type: 'SET_ORGANIZATION', payload: prov.organization });
                      dispatch({ type: 'SET_USER_ROLE', payload: adminRole });
                      dispatch({ type: 'SET_ORGANIZATION_ERROR', payload: null });
                      organization = prov.organization;
                    } else {
                      dispatch({ type: 'SET_ORGANIZATION_ERROR', payload: 'guest_waiting' });
                    }
                  } catch (provErr) {
                    console.error('provision personal workspace:', provErr);
                    dispatch({ type: 'SET_ORGANIZATION_ERROR', payload: 'guest_waiting' });
                  }
                } else {
                  dispatch({ type: 'SET_ORGANIZATION_ERROR', payload: 'guest_waiting' });
                }
                dispatch({ type: 'SET_COLLABORATOR_STATUS', payload: { isCollaborator: false, projects: [] } });
              }
            } catch (error) {
              console.error('Error checking for project collaborations:', error);
              // On error, still set organization error
              dispatch({ type: 'SET_ORGANIZATION_ERROR', payload: 'No organization found. Please contact your administrator.' });
              dispatch({ type: 'SET_COLLABORATOR_STATUS', payload: { isCollaborator: false, projects: [] } });
            } finally {
              dispatch({ type: 'SET_ORGANIZATION_LOADING', payload: false });
            }
          }
          
          // Check if user must change password
          if (mustChangePassword) {
            dispatch({ type: 'SET_MUST_CHANGE_PASSWORD', payload: true });
          }

          // Legacy accounts: align profiles.organization_id with RLS before any writes
          if (state.user?.id && (profileWithOrg?.account_intent || 'workspace_owner') === 'workspace_owner') {
            try {
              const { ensureOrganizationForWrites } = await import('../utils/organizationContext');
              const repaired = await ensureOrganizationForWrites(supabaseClient, {
                userId: state.user.id,
                accountIntent: profileWithOrg?.account_intent || state.accountIntent,
                currentOrganization: organization,
                dispatch,
              });
              if (repaired.ok && repaired.organization) {
                organization = repaired.organization;
              }
            } catch (repairErr) {
              console.warn('ensureOrganizationForWrites on boot:', repairErr);
            }
          }

          const orgIdForLazy = organization?.id ?? null;
          const prevOrgId = lastOrgIdForLazyRef.current;
          if (prevOrgId !== undefined && prevOrgId !== orgIdForLazy) {
            dispatch({ type: 'RESET_LAZY_DATA' });
          }

          // === PHASE 1: Critical Data (Projects) - unblock UI as soon as list is ready ===
          let finalProjects = await projectsFetchPromise;
          dispatch({ type: 'SET_DATA', payload: {
            projects: finalProjects,
            activeView: currentActiveViewRef.current || state.activeView,
          }});
          
          // === PHASE 2: Essential Secondary Data (NOT tasks/files/events - loaded on demand) ===
          const fetchActivityLog = async () => {
            let q = supabaseClient
              .from('activity_log')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(50);
            if (organization?.id) {
              q = q.eq('organization_id', organization.id);
            }
            const { data, error: alErr } = await q;
            if (alErr) console.warn('activity_log fetch:', alErr.message);
            return data || [];
          };

          const userPreferences = await loadWithFallback(
            async () => {
              const { data, error } = await supabaseClient
                .from('user_preferences')
                .select('*')
                .eq('user_id', state.user.id)
                .maybeSingle();
              if (error) throw error;
              return data;
            },
            null,
            { label: 'user_preferences' },
          );

          const activityLog = await loadWithFallback(fetchActivityLog, [], { label: 'activity_log' });
          
          // Tasks, Files, and Calendar Events will be loaded on-demand when user navigates to those views
          
          // Contacts directory loads after shell paint (do not block on getVirtualContacts).
          const { scheduleDeferredContactsLoad } = await import('../utils/bootBackground');
          const userProjectIds = finalProjects.map(p => p.id);
          const organizationId = organization?.id || null;
          
          dispatch({ type: 'SET_DATA', payload: { 
            projects: finalProjects, 
            activityLog: activityLog || [],
            activeView: currentActiveViewRef.current || state.activeView
          } });

          scheduleDeferredContactsLoad({
            supabaseClient,
            dispatch,
            userId: state.user.id,
            organizationId,
            projectIds: userProjectIds,
          });

          lastOrgIdForLazyRef.current = orgIdForLazy;
          
          dispatch({ type: 'SET_USER_PREFERENCES', payload: userPreferences });
        } catch (error) {
          console.error('Error fetching initial data:', error);
        } finally {
          // Never leave the app on an infinite "Loading workspace..." spinner if boot partially fails.
          dispatch({ type: 'SET_DATA', payload: {} });
        }
      }
    fetchInitialData();
    }
  }, [state.authLoading, state.user?.id]);

  useEffect(() => {
    if (state.authLoading || !state.user) return undefined;

    let cancelled = false;
    let channel = null;

    const timer = setTimeout(() => {
      if (cancelled) return;

      // Single multiplexed channel — avoids opening many parallel websocket subscriptions on boot.
      channel = supabaseClient
        .channel('app-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            dispatch({ type: 'ADD_PROJECT', payload: payload.new });
          } else if (payload.eventType === 'UPDATE') {
            dispatch({ type: 'UPDATE_PROJECT', payload: payload.new });
          } else if (payload.eventType === 'DELETE') {
            dispatch({ type: 'DELETE_PROJECT', payload: payload.old.id });
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'files' }, (payload) => {
          dispatch({ type: 'ADD_FILE', payload: payload.new });
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calendar_events' }, (payload) => {
          dispatch({ type: 'ADD_EVENT', payload: payload.new });
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calendar_events' }, (payload) => {
          dispatch({ type: 'UPDATE_EVENT', payload: payload.new });
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'calendar_events' }, (payload) => {
          dispatch({ type: 'DELETE_EVENT', payload: payload.old.id });
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, async (payload) => {
          try {
            const { data: fullContact } = await supabaseClient
              .from('contacts')
              .select('*, project_contacts!fk_project_contacts_contact_id(project_id)')
              .eq('id', payload.new.id)
              .single();
            dispatch({ type: 'ADD_CONTACT', payload: fullContact || payload.new });
          } catch (error) {
            console.error('Error processing contact INSERT in subscription:', error);
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts' }, async (payload) => {
          try {
            const { data: fullContact } = await supabaseClient
              .from('contacts')
              .select('*, project_contacts!fk_project_contacts_contact_id(project_id)')
              .eq('id', payload.new.id)
              .single();
            dispatch({ type: 'UPDATE_CONTACT', payload: fullContact || payload.new });
          } catch (error) {
            console.error('Error processing contact UPDATE in subscription:', error);
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contacts' }, (payload) => {
          dispatch({ type: 'DELETE_CONTACT', payload: payload.old.id });
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_contacts' }, async (payload) => {
          try {
            dispatch({ type: 'ADD_PROJECT_CONTACT', payload: payload.new });

            const contactId = payload.new?.contact_id;
            if (!contactId) return;

            const liveState = appStateRefForLazy.current;
            const contactExists = liveState?.contacts?.some((c) => c.id === contactId);
            if (contactExists) return;

            const { data: fullContact } = await supabaseClient
              .from('contacts')
              .select('id, name, email, role, phone, avatar_url, status, type, organization_id, company, trade')
              .eq('id', contactId)
              .single();

            if (fullContact) {
              dispatch({
                type: 'ADD_CONTACT',
                payload: {
                  ...fullContact,
                  project_contacts: [{
                    project_id: payload.new.project_id,
                    role: payload.new.role,
                  }],
                },
              });
            }
          } catch (error) {
            console.error('Error processing project_contacts INSERT in subscription:', error);
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'project_contacts' }, (payload) => {
          dispatch({ type: 'REMOVE_PROJECT_CONTACT', payload: payload.old });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, async (payload) => {
          try {
            if (payload.eventType === 'INSERT') {
              const { data: updatedTask } = await supabaseClient
                .from('tasks')
                .select('*, contacts(name, avatar_url, email, phone)')
                .eq('id', payload.new.id)
                .single();
              if (updatedTask) dispatch({ type: 'ADD_TASK', payload: updatedTask });
            } else if (payload.eventType === 'UPDATE') {
              const { data: updatedTask } = await supabaseClient
                .from('tasks')
                .select('*, contacts(name, avatar_url, email, phone)')
                .eq('id', payload.new.id)
                .single();
              if (updatedTask) dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
            } else if (payload.eventType === 'DELETE') {
              dispatch({ type: 'DELETE_TASK', payload: payload.old.id });
            }
          } catch (error) {
            console.error('Error processing task change in subscription:', error);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_preferences' }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            dispatch({ type: 'SET_USER_PREFERENCES', payload: payload.new });
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
          dispatch({ type: 'ADD_ACTIVITY', payload: payload.new });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async (payload) => {
          try {
            const profileOrgId = payload.new?.organization_id || payload.old?.organization_id;
            const organizationId = currentOrganizationIdRef.current;
            if (!profileOrgId || profileOrgId !== organizationId) return;

            const liveState = appStateRefForLazy.current;
            const { getVirtualContacts } = await import('../utils/virtualContactsService');
            const projects = liveState?.projects || [];
            const userProjectIds = projects.map((p) => p.id);

            const updatedContacts = await getVirtualContacts(
              supabaseClient,
              liveState?.user?.id,
              organizationId,
              userProjectIds,
            );

            dispatch({
              type: 'SET_DATA',
              payload: {
                contacts: updatedContacts,
                activeView: liveState?.activeView,
              },
            });
          } catch (error) {
            console.error('Error processing profiles subscription:', error);
          }
        })
        .subscribe();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) {
        supabaseClient.removeChannel(channel);
      }
    };
  }, [state.authLoading, state.user?.id, state.currentOrganization?.id]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);

// Custom hook for lazy loading data
export const useLazyDataLoader = () => {
  const { state, dispatch } = useAppContext();
  const getState = useCallback(() => appStateRefForLazy.current, []);

  const loadTasksIfNeeded = useCallback(async () => {
    const { loadTasksIfNeeded: loadTasks } = await import('../utils/lazyDataLoader');
    await loadTasks(supabaseClient, dispatch, getState);
  }, [dispatch, getState]);

  const loadFilesIfNeeded = useCallback(async () => {
    if (getState()?.filesLoaded) return;
    const { loadFilesIfNeeded: loadFiles } = await import('../utils/lazyDataLoader');
    await loadFiles(supabaseClient, dispatch, getState);
  }, [dispatch, getState]);

  const loadCalendarEventsIfNeeded = useCallback(async (referenceDate = new Date()) => {
    const { loadCalendarEventsIfNeeded: loadEvents } = await import('../utils/lazyDataLoader');
    await loadEvents(supabaseClient, dispatch, getState, referenceDate);
  }, [dispatch, getState]);

  const loadProjectTasks = useCallback(
    async (projectId) => {
      const { loadProjectTasks: loadTasks } = await import('../utils/lazyDataLoader');
      return await loadTasks(supabaseClient, dispatch, projectId, getState);
    },
    [dispatch, getState],
  );

  const loadMyDayTasksIfNeeded = useCallback(async () => {
    const { loadMyDayTasksIfNeeded: loadMyDay } = await import('../utils/lazyDataLoader');
    await loadMyDay(supabaseClient, dispatch, getState);
  }, [dispatch, getState]);

  return {
    loadTasksIfNeeded,
    loadFilesIfNeeded,
    loadCalendarEventsIfNeeded,
    loadProjectTasks,
    loadMyDayTasksIfNeeded,
    tasksLoaded: state.tasksLoaded,
    filesLoaded: state.filesLoaded,
    calendarEventsLoaded: state.calendarEventsLoaded,
    myDayTasksLoaded: state.myDayTasksLoaded,
  };
};

