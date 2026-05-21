import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import {
    attachTaskPhotoUrls,
    deleteTaskPhoto,
    fetchTaskPhotos,
    listWeatherImpactsForProject,
    reorderTaskPhotos,
    updateTaskPhoto,
    uploadTaskPhotoSet,
    normalizeAssigneePhone,
} from '@siteweave/core-logic';
import TaskItem from '../components/TaskItem';
import TaskModal from '../components/TaskModal';
import TaskPhotosModal from '../components/TaskPhotosModal';
import TaskDiscussionModal from '../components/TaskDiscussionModal';
import PhaseTaskSection from '../components/PhaseTaskSection';
import BuildPath from '../components/BuildPath';
import ProjectSidebar from '../components/ProjectSidebar';
import ProjectModal from '../components/ProjectModal';
import ShareModal from '../components/ShareModal';
import SaveAsTemplateModal from '../components/SaveAsTemplateModal';
import MsProjectImportModal from '../components/MsProjectImportModal';
import ProgressReportModal from '../components/ProgressReportModal';
import WeatherImpactModal from '../components/WeatherImpactModal';
import WeatherDelayMarker from '../components/WeatherDelayMarker';
import PermissionGuard from '../components/PermissionGuard';
import ConfirmDialog from '../components/ConfirmDialog';
import TaskBulkActions from '../components/TaskBulkActions';
import ProjectCollaborationView from '../components/collaboration/ProjectCollaborationView';
import Avatar from '../components/Avatar';
import { useTaskShortcuts } from '../hooks/useKeyboardShortcuts';
import { handleApiError } from '../utils/errorHandling';
import { parseRecurrence } from '../utils/recurrenceService';
import { buildTaskPhotoDraft, buildTaskCompletionPhotoDetails, revokeTaskPhotoDraftUrls, sortTaskPhotos, canManageTaskPhotos } from '../utils/taskPhotoUtils';
import {
    logTaskCreated,
    logTaskCompleted,
    logTaskUncompleted,
    logTaskUpdated,
    logTaskDeleted,
    logTaskAssigneeEmailSent,
} from '../utils/activityLogger';
import { sendTaskAssignmentEmail, sendTaskPingEmail } from '../utils/emailNotifications';
import { getCriticalPathTaskIds } from '../utils/criticalPath';
import { orderTasksForGantt } from '../utils/ganttOrdering';
import {
    calculateAutoShiftUpdates,
    getDependencyWarnings,
    getEarliestAllowedStartDate,
    wouldCreateDependencyCycle,
} from '../utils/taskDependencyService';
import { mergeWeatherIntoPhaseTasks } from '../utils/weatherTaskTimeline';
import GanttChart from '../components/GanttChart';
import { useStreamUnread } from '../hooks/useStreamUnread';
import { useIssuesUnread } from '../hooks/useIssuesUnread';
import ActivityHistoryPanel from '../components/ActivityHistoryPanel';
import Icon from '../components/Icon';

function ProjectDetailsView() {
    const { t } = useTranslation();
    const { state, dispatch } = useAppContext();
    const { addToast } = useToast();

    const projects = state.projects || [];
    const tasksState = state.tasks || [];
    const contacts = state.contacts || [];
    const project = projects.find(p => p.id === state.selectedProjectId);

    const organizationDisplayName = useMemo(() => {
        if (!project?.organization_id) return 'Your team';
        if (
            state.currentOrganization?.id === project.organization_id &&
            state.currentOrganization?.name
        ) {
            return state.currentOrganization.name;
        }
        return project.name || 'Your team';
    }, [
        project?.organization_id,
        project?.name,
        state.currentOrganization?.id,
        state.currentOrganization?.name,
    ]);

    const [showTaskModal, setShowTaskModal] = useState(false);
    const [isCreatingTask, setIsCreatingTask] = useState(false);
    const [pingingTaskId, setPingingTaskId] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [taskToDelete, setTaskToDelete] = useState(null);
    const [selectedTasks, setSelectedTasks] = useState([]);
    const [taskFilter, setTaskFilter] = useState('all'); // all, completed, pending
    const [taskSort, setTaskSort] = useState('due_date'); // due_date, priority
    const [activeTab, setActiveTab] = useState('tasks'); // tasks, gantt, updates, activity
    const [collabPanel, setCollabPanel] = useState('stream');
    const { unreadCount: streamUnreadCount } = useStreamUnread(
        supabaseClient,
        project?.id,
        activeTab,
    );
    const { unreadCount: issuesUnreadCount } = useIssuesUnread(
        supabaseClient,
        project?.id,
        activeTab,
    );
    const collaborationUnreadCount = streamUnreadCount + issuesUnreadCount;
    const [showShare, setShowShare] = useState(false);
    const [showProgressReportModal, setShowProgressReportModal] = useState(false);
    const [showWeatherImpactModal, setShowWeatherImpactModal] = useState(false);
    const [selectedWeatherImpact, setSelectedWeatherImpact] = useState(null);
    const [projectRefreshNonce, setProjectRefreshNonce] = useState(0);
    const [weatherImpacts, setWeatherImpacts] = useState([]);
    const [showSaveAsTemplateModal, setShowSaveAsTemplateModal] = useState(false);
    const [showMsProjectImportModal, setShowMsProjectImportModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [isSavingProject, setIsSavingProject] = useState(false);
    const [fieldIssuesCount, setFieldIssuesCount] = useState(0);
    const [photoActionTaskIds, setPhotoActionTaskIds] = useState({});
    /** Multi-file photo upload progress for task list (`taskId` + slice). */
    const [taskPhotoUploadProgress, setTaskPhotoUploadProgress] = useState(null);
    /** Photo upload progress while creating a task with pending photos (modal). */
    const [createTaskPhotoUploadProgress, setCreateTaskPhotoUploadProgress] = useState(null);
    const [taskDependencies, setTaskDependencies] = useState([]);
    const [projectDependencyMode, setProjectDependencyMode] = useState('auto');
    const [projectPhases, setProjectPhases] = useState([]);
    const [photoModalTaskId, setPhotoModalTaskId] = useState(null);
    const [discussionModalTaskId, setDiscussionModalTaskId] = useState(null);
    const [showPhasesModal, setShowPhasesModal] = useState(false);
    const [dependencyDrawerTaskId, setDependencyDrawerTaskId] = useState(null);
    const [drawerPredecessorQuery, setDrawerPredecessorQuery] = useState('');
    const [drawerSuccessorQuery, setDrawerSuccessorQuery] = useState('');
    const [activeDependencyPicker, setActiveDependencyPicker] = useState(null);
    const [toolbarMenu, setToolbarMenu] = useState(null);
    const toolbarMenuRef = useRef(null);
    const dependencyPickerRef = useRef(null);

    const canViewActivityHistory = state.userRole?.permissions?.can_view_activity_history === true;

    useEffect(() => {
        if (!state.selectedProjectId) {
            setProjectPhases([]);
            return;
        }
        const ac = new AbortController();
        (async () => {
            const { data, error } = await supabaseClient
                .from('project_phases')
                .select('*')
                .eq('project_id', state.selectedProjectId)
                .order('order', { ascending: true });
            if (ac.signal.aborted) return;
            if (error) {
                console.error('Error loading project phases:', error);
                setProjectPhases([]);
            } else {
                setProjectPhases(data || []);
            }
        })();
        return () => ac.abort();
    }, [state.selectedProjectId, projectRefreshNonce]);

    useEffect(() => {
        if (!state.selectedProjectId) {
            setWeatherImpacts([]);
            return;
        }
        const ac = new AbortController();
        (async () => {
            try {
                const rows = await listWeatherImpactsForProject(
                    supabaseClient,
                    state.selectedProjectId,
                    state.currentOrganization?.id || null,
                );
                if (!ac.signal.aborted) setWeatherImpacts(rows || []);
            } catch (e) {
                if (!ac.signal.aborted) {
                    console.error('Error loading weather impacts:', e);
                    setWeatherImpacts([]);
                }
            }
        })();
        return () => ac.abort();
    }, [state.selectedProjectId, state.currentOrganization?.id, projectRefreshNonce]);

    useEffect(() => {
        if (!canViewActivityHistory && activeTab === 'activity') {
            setActiveTab('tasks');
        }
    }, [canViewActivityHistory, activeTab]);

    useEffect(() => {
        setDrawerPredecessorQuery('');
        setDrawerSuccessorQuery('');
        setActiveDependencyPicker(null);
    }, [dependencyDrawerTaskId]);

    useEffect(() => {
        if (!activeDependencyPicker) return undefined;

        const handleClickOutside = (event) => {
            if (dependencyPickerRef.current && !dependencyPickerRef.current.contains(event.target)) {
                setActiveDependencyPicker(null);
            }
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setActiveDependencyPicker(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [activeDependencyPicker]);

    useEffect(() => {
        if (!toolbarMenu) return undefined;

        const handleClickOutside = (event) => {
            if (toolbarMenuRef.current && !toolbarMenuRef.current.contains(event.target)) {
                setToolbarMenu(null);
            }
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setToolbarMenu(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [toolbarMenu]);

    // Keyboard shortcuts
    useTaskShortcuts({
        createTask: () => setShowTaskModal(true),
        saveTask: () => {}, // Will be handled by individual task saves
        cancelEdit: () => setSelectedTasks([]),
        focusSearch: () => {
            const searchInput = document.querySelector('input[type="search"]');
            if (searchInput) searchInput.focus();
        },
        filterTasks: (filter) => setTaskFilter(filter)
    });

    // Fetch field issues count
    useEffect(() => {
        const ac = new AbortController();
        const fetchFieldIssuesCount = async () => {
            if (!state.selectedProjectId) {
                if (!ac.signal.aborted) setFieldIssuesCount(0);
                return;
            }
            try {
                const { count, error } = await supabaseClient
                    .from('project_issues')
                    .select('*', { count: 'exact', head: true })
                    .eq('project_id', state.selectedProjectId);

                if (ac.signal.aborted) return;
                if (error) {
                    console.error('Error fetching field issues count:', error);
                    setFieldIssuesCount(0);
                } else {
                    setFieldIssuesCount(count || 0);
                }
            } catch (error) {
                if (!ac.signal.aborted) {
                    console.error('Error fetching field issues count:', error);
                    setFieldIssuesCount(0);
                }
            }
        };
        fetchFieldIssuesCount();
        return () => ac.abort();
    }, [state.selectedProjectId, activeTab]);

    // Load tasks for this project; keep a local list so it cannot be overwritten by cache/auth
    const [projectTasksList, setProjectTasksList] = useState([]);
    const allTasksFromState = useMemo(
        () => (tasksState || []).filter((t) => t.project_id === state.selectedProjectId),
        [tasksState, state.selectedProjectId]
    );
    // Prefer global state so Supabase realtime (and other views) update the list without navigating away.
    // Local fetch still hydrates global state via MERGE_TASKS; empty project uses [] from either source.
    const allTasks = useMemo(
        () => (allTasksFromState.length > 0 ? allTasksFromState : projectTasksList),
        [allTasksFromState, projectTasksList]
    );
    const allTaskIdsKey = useMemo(
        () => allTasks.map((task) => task.id).sort().join('|'),
        [allTasks]
    );

    useEffect(() => {
        if (!state.selectedProjectId) {
            setProjectTasksList([]);
            setTaskDependencies([]);
            return;
        }
        setProjectTasksList([]);
        const ac = new AbortController();
        (async () => {
            try {
                const { data: tasks, error } = await supabaseClient
                    .from('tasks')
                    .select('*, contacts(name, avatar_url, email, phone), task_photos(*)')
                    .eq('project_id', state.selectedProjectId)
                    .order('due_date', { ascending: true, nullsFirst: false })
                    .order('id', { ascending: true });
                if (ac.signal.aborted) return;
                if (error) {
                    console.error('Error loading project tasks:', error);
                    return;
                }
                const list = await hydrateTaskRows(tasks || []);
                if (!ac.signal.aborted) setProjectTasksList(list);
                const otherTasks = (state.tasks || []).filter(
                  (t) => String(t.project_id) !== String(state.selectedProjectId),
                );
                dispatch({ type: 'MERGE_TASKS', payload: [...otherTasks, ...list] });
            } catch (e) {
                if (!ac.signal.aborted) console.error('Error loading project tasks:', e);
            }
        })();
        return () => ac.abort();
    }, [state.selectedProjectId, projectRefreshNonce]);

    useEffect(() => {
        setProjectDependencyMode(project?.dependency_scheduling_mode || 'auto');
    }, [project?.dependency_scheduling_mode]);

    useEffect(() => {
        if (!state.selectedProjectId) return;
        const ac = new AbortController();
        (async () => {
            const taskIds = allTasks.map((task) => task.id);
            if (taskIds.length === 0) {
                setTaskDependencies([]);
                return;
            }
            const { data, error } = await supabaseClient
                .from('task_dependencies')
                .select('id, task_id, successor_task_id, dependency_type, lag_days')
                .in('task_id', taskIds);
            if (ac.signal.aborted) return;
            if (error) {
                console.error('Error loading task dependencies:', error);
                setTaskDependencies([]);
                return;
            }
            const filtered = (data || []).filter((dep) => taskIds.includes(dep.successor_task_id));
            setTaskDependencies((prev) => {
                const prevKey = prev
                    .map((dep) => `${dep.id}:${dep.task_id}:${dep.successor_task_id}:${dep.dependency_type}:${dep.lag_days ?? 0}`)
                    .sort()
                    .join('|');
                const nextKey = filtered
                    .map((dep) => `${dep.id}:${dep.task_id}:${dep.successor_task_id}:${dep.dependency_type}:${dep.lag_days ?? 0}`)
                    .sort()
                    .join('|');
                return prevKey === nextKey ? prev : filtered;
            });
        })();
        return () => ac.abort();
    }, [state.selectedProjectId, allTaskIdsKey]);

    const dependencyWarnings = useMemo(
        () => getDependencyWarnings(allTasks, taskDependencies),
        [allTasks, taskDependencies]
    );

    const hydratePhotoRows = async (photos) => {
        if (!photos || photos.length === 0) return [];
        const hydrated = await attachTaskPhotoUrls(supabaseClient, sortTaskPhotos(photos));
        return sortTaskPhotos(hydrated);
    };

    const hydrateTaskRows = async (rows) => {
        const base = await Promise.all((rows || []).map(async (task) => ({
            ...task,
            task_photos: await hydratePhotoRows(task.task_photos || []),
        })));
        const phones = new Set();
        for (const t of base) {
            const n = normalizeAssigneePhone(String(t.contacts?.phone || '').trim(), { defaultRegion: 'US' });
            if (n.isValid && n.e164) phones.add(n.e164);
        }
        let cmap = new Map();
        if (phones.size > 0) {
            const { data: consentRows } = await supabaseClient
                .from('sms_phone_consent')
                .select('phone_e164,status')
                .in('phone_e164', [...phones]);
            cmap = new Map((consentRows || []).map((r) => [r.phone_e164, r.status]));
        }
        return base.map((t) => {
            const n = normalizeAssigneePhone(String(t.contacts?.phone || '').trim(), { defaultRegion: 'US' });
            const assignee_sms_consent = n.isValid && n.e164 ? cmap.get(n.e164) || 'none' : null;
            return { ...t, assignee_sms_consent };
        });
    };

    const replaceTaskRow = (taskId, nextTask) => {
        dispatch({ type: 'UPDATE_TASK', payload: nextTask });
        setProjectTasksList(prev => prev.map((task) => task.id === taskId ? nextTask : task));
    };

    const setTaskPhotoBusy = (taskId, isBusy) => {
        setPhotoActionTaskIds((prev) => {
            if (isBusy) {
                return { ...prev, [taskId]: true };
            }
            const next = { ...prev };
            delete next[taskId];
            return next;
        });
    };

    const projectTasksSlice = useMemo(
      () => (state.tasks || []).filter((t) => t.project_id === state.selectedProjectId),
      [state.tasks, state.selectedProjectId],
    );

    // Gantt tab: fetch tasks and dependencies from Supabase for current project
    const [ganttTasks, setGanttTasks] = useState([]);
    const [ganttDependencies, setGanttDependencies] = useState([]);
    const [ganttCriticalIds, setGanttCriticalIds] = useState([]);
    const [showCriticalPath, setShowCriticalPath] = useState(true);
    useEffect(() => {
        if (activeTab !== 'gantt' || !state.selectedProjectId) return;
        const ac = new AbortController();
        (async () => {
            try {
                const projectId = state.selectedProjectId;
                const { data: taskRows, error: taskErr } = await supabaseClient
                    .from('tasks')
                    .select('id, text, start_date, due_date, duration_days, is_milestone, project_id, completed, parent_task_id, assignee_id, contacts(name)')
                    .eq('project_id', projectId)
                    .order('start_date', { ascending: true, nullsFirst: true });
                if (ac.signal.aborted) return;
                if (taskErr) {
                    console.error('Gantt: tasks fetch error', taskErr);
                    setGanttTasks([]);
                    setGanttDependencies([]);
                    setGanttCriticalIds([]);
                    return;
                }
                const tasks = taskRows || [];
                let deps = [];
                if (tasks.length > 0) {
                    const taskIds = tasks.map((t) => t.id);
                    const { data: depRows, error: depErr } = await supabaseClient
                        .from('task_dependencies')
                        .select('id, task_id, successor_task_id, dependency_type, lag_days')
                        .in('task_id', taskIds);
                    if (!depErr) {
                        deps = (depRows || []).filter((d) => taskIds.includes(d.successor_task_id));
                    } else {
                        console.error('Gantt: task_dependencies fetch error', depErr);
                    }
                }
                if (!ac.signal.aborted) {
                    const ordered = orderTasksForGantt(tasks);
                    setGanttTasks(ordered);
                    setGanttDependencies(deps);
                    const criticalIds = getCriticalPathTaskIds(tasks, deps);
                    setGanttCriticalIds(criticalIds);
                }
            } catch (e) {
                if (!ac.signal.aborted) console.error('Gantt fetch error', e);
            }
        })();
        return () => ac.abort();
    }, [activeTab, state.selectedProjectId, projectTasksSlice, projectRefreshNonce]);
    
    // Get all project crew members (any contact linked to this project)
    const crewMembers = contacts.filter(contact => 
        contact.project_contacts && contact.project_contacts.some(pc => pc.project_id === project?.id)
    );

    const assignableContactsForTasks = useMemo(() => {
        if (!project?.id) return [];
        const projectContacts = contacts.filter(
            (c) => c.project_contacts && c.project_contacts.some((pc) => pc.project_id === project.id)
        );
        const orgAdmins = contacts.filter(
            (c) =>
                c.is_internal &&
                c.organization_id === project.organization_id &&
                c.role_name &&
                c.role_name.toLowerCase() === 'org admin'
        );
        return [
            ...projectContacts,
            ...orgAdmins.filter((admin) => !projectContacts.some((pc) => pc.id === admin.id)),
        ];
    }, [contacts, project?.id, project?.organization_id]);

    /** Keep completion and percent_complete synchronized while allowing 0-100 progress. */
    const normalizeTaskProgressUpdate = (baseTask, updates) => {
        const next = { ...updates };

        // When both percent and completed are sent (e.g. TaskItem), percent must win — otherwise
        // `completed: false` runs first and forces percent_complete to 0.
        if (
            next.percent_complete !== undefined &&
            next.percent_complete !== null &&
            next.percent_complete !== ''
        ) {
            const parsed = Number(next.percent_complete);
            const bounded = Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
            next.percent_complete = bounded;
            next.completed = bounded >= 100;
        } else if (next.completed !== undefined) {
            next.percent_complete = next.completed ? 100 : 0;
        }

        return next;
    };
    
    // Filter and sort tasks
    const filteredTasks = allTasks.filter(task => {
        if (taskFilter === 'completed') return task.completed;
        if (taskFilter === 'pending') return !task.completed;
        return true; // 'all'
    });
    
    // Sort tasks based on selected sort option
    const tasks = useMemo(() => {
        return [...filteredTasks].sort((a, b) => {
            switch (taskSort) {
                case 'name':
                    return (a.text || '').localeCompare(b.text || '', undefined, { sensitivity: 'base' });
                case 'priority': {
                    const priorityOrder = { High: 3, Medium: 2, Low: 1 };
                    return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
                }
                case 'due_date':
                default:
                    if (!a.due_date && !b.due_date) return 0;
                    if (!a.due_date) return 1;
                    if (!b.due_date) return -1;
                    return new Date(a.due_date) - new Date(b.due_date);
            }
        });
    }, [filteredTasks, taskSort]);

    const updateDependencyMode = async (nextMode) => {
        const { error } = await supabaseClient
            .from('projects')
            .update({ dependency_scheduling_mode: nextMode })
            .eq('id', project.id);

        if (error) {
            addToast(`Could not update dependency mode: ${error.message}`, 'error');
            return;
        }

        setProjectDependencyMode(nextMode);
        dispatch({
            type: 'UPDATE_PROJECT',
            payload: { ...project, dependency_scheduling_mode: nextMode },
        });
        setToolbarMenu(null);
    };

    const handleSaveProject = async (projectData) => {
        if (!project?.id) return;
        setIsSavingProject(true);
        try {
            const { selectedContacts, emailAddresses, ...projectFields } = projectData;
            const projectDataWithAudit = {
                ...projectFields,
                updated_by_user_id: state.user?.id,
                updated_at: new Date().toISOString(),
            };

            const { data: updatedProject, error } = await supabaseClient
                .from('projects')
                .update(projectDataWithAudit)
                .eq('id', project.id)
                .select()
                .single();

            if (error) {
                addToast(t('toast.error_updating_project', { message: error.message }), 'error');
                return;
            }

            if (selectedContacts !== undefined || emailAddresses) {
                const { error: deleteError } = await supabaseClient
                    .from('project_contacts')
                    .delete()
                    .eq('project_id', project.id);

                if (deleteError) {
                    console.error('Error removing existing contacts:', deleteError);
                    addToast(t('toast.project_updated_contacts_warning'), 'warning');
                } else {
                    const pendingEmails = emailAddresses || [];
                    const contactsToAdd = [...(selectedContacts || [])];

                    for (const email of pendingEmails) {
                        try {
                            const { data: existingContact } = await supabaseClient
                                .from('contacts')
                                .select('id')
                                .ilike('email', email)
                                .maybeSingle();

                            if (existingContact) {
                                contactsToAdd.push(existingContact.id);
                                continue;
                            }

                            const { data: newContact, error: contactError } = await supabaseClient
                                .from('contacts')
                                .insert({
                                    name: email.split('@')[0],
                                    email,
                                    type: 'Team',
                                    role: 'Team Member',
                                    status: 'Available',
                                })
                                .select()
                                .single();

                            if (contactError) {
                                console.error(`Error creating contact for ${email}:`, contactError);
                                addToast(t('toast.could_not_create_contact', { email }), 'warning');
                            } else {
                                contactsToAdd.push(newContact.id);
                                dispatch({ type: 'ADD_CONTACT', payload: newContact });
                            }
                        } catch (contactErr) {
                            console.error(`Error processing email ${email}:`, contactErr);
                            addToast(t('toast.error_processing_email', { email }), 'warning');
                        }
                    }

                    if (contactsToAdd.length > 0) {
                        const projectContactsData = contactsToAdd.map((contactId) => ({
                            project_id: project.id,
                            contact_id: contactId,
                            organization_id: project.organization_id || state.currentOrganization?.id,
                        }));
                        const { error: contactsError } = await supabaseClient
                            .from('project_contacts')
                            .upsert(projectContactsData, {
                                onConflict: 'project_id,contact_id',
                                ignoreDuplicates: true,
                            });
                        if (contactsError && contactsError.code !== '23505') {
                            console.error('Error adding contacts to project:', contactsError);
                            addToast(t('toast.project_updated_some_contacts_warning'), 'warning');
                        }
                    }
                }
            }

            dispatch({ type: 'UPDATE_PROJECT', payload: updatedProject });
            addToast(t('toast.project_updated_successfully'), 'success');
            setShowProjectModal(false);
        } catch (saveError) {
            addToast(t('toast.error_updating_project', { message: saveError.message }), 'error');
        } finally {
            setIsSavingProject(false);
        }
    };

    const taskPhaseGroups = useMemo(() => {
        const unassigned = tasks.filter((t) => !t.project_phase_id);
        return { unassigned };
    }, [tasks]);

    const progressPercentForTasks = (taskList) => {
        if (!taskList.length) return 0;
        const done = taskList.filter((t) => t.completed).length;
        return Math.round((100 * done) / taskList.length);
    };

    const photoModalTask = useMemo(
        () => (photoModalTaskId ? allTasks.find((t) => t.id === photoModalTaskId) : null),
        [photoModalTaskId, allTasks]
    );

    const refreshProjectPhases = useCallback(async () => {
        if (!project?.id) return;
        const { data, error } = await supabaseClient
            .from('project_phases')
            .select('*')
            .eq('project_id', project.id)
            .order('order', { ascending: true });
        if (!error) setProjectPhases(data || []);
    }, [project?.id]);
    
    if (!project) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('projects.no_project_selected')}</h2>
                    <p className="text-gray-500 mb-4">{t('projects.no_project_description')}</p>
                    <button 
                        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'Dashboard' })}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        {t('projects.go_to_dashboard')}
                    </button>
                </div>
            </div>
        );
    }

    const handleRequestAssigneeSmsConsent = async (task, { forceResend = false } = {}) => {
        const fallbackContact = task.assignee_id
            ? contacts.find((contact) => contact.id === task.assignee_id)
            : null;
        const rawPhone = String(task.contacts?.phone || fallbackContact?.phone || '').trim();
        const normalizedPhone = normalizeAssigneePhone(rawPhone, { defaultRegion: 'US' });
        if (!normalizedPhone.isValid) {
            addToast('No valid phone on file.', 'warning');
            return;
        }
        if (task.assignee_sms_consent === 'confirmed') {
            addToast('This number is already confirmed for SMS.', 'info');
            return;
        }
        if (task.assignee_sms_consent === 'opted_out') {
            addToast('This number opted out of SMS.', 'warning');
            return;
        }
        setPingingTaskId(task.id);
        try {
            const { data, error } = await supabaseClient.functions.invoke('dispatch-notification', {
                body: {
                    action: 'sms_opt_in_request',
                    recipientPhone: normalizedPhone.e164,
                    organizationId: project.organization_id,
                    organizationName: organizationDisplayName,
                    forceResend: Boolean(forceResend),
                },
            });
            const sent = !error && data?.sent;
            if (sent) {
                addToast('Consent SMS sent. Assignee must reply YES before task SMS goes out.', 'success');
                const patch = { ...task, assignee_sms_consent: 'pending' };
                replaceTaskRow(task.id, patch);
            } else {
                const reason = data?.reason || error?.message || 'unknown';
                addToast(
                    reason === 'rate_limited_7d'
                        ? 'Consent SMS was sent recently; try again in a few days or use Resend after 24h.'
                        : reason === 'rate_limited_resend_24h'
                          ? 'Resend is limited to once per 24 hours.'
                          : `Could not send consent SMS (${reason}).`,
                    'warning',
                );
            }
        } catch (e) {
            addToast(handleApiError(e, 'Could not send consent SMS'), 'error');
        } finally {
            setPingingTaskId(null);
        }
    };

    const handlePingAssignee = async (task) => {
        const fallbackContact = task.assignee_id
            ? contacts.find((contact) => contact.id === task.assignee_id)
            : null;
        const email = String(task.contacts?.email || fallbackContact?.email || '').trim();
        const rawPhone = String(task.contacts?.phone || fallbackContact?.phone || '').trim();
        const normalizedPhone = normalizeAssigneePhone(rawPhone, { defaultRegion: 'US' });
        const phone = normalizedPhone.isValid ? normalizedPhone.e164 : null;
        if ((!email || !email.includes('@')) && !phone) {
            addToast('No email or valid phone on file for this assignee.', 'warning');
            return;
        }

        const deliveryChannels = [];
        if (email && email.includes('@')) deliveryChannels.push('email');
        if (phone && task.assignee_sms_consent === 'confirmed') deliveryChannels.push('sms');
        if (deliveryChannels.length === 0) {
            if (phone && !(email && email.includes('@'))) {
                addToast('SMS ping requires consent — use “SMS OK?” first.', 'warning');
            } else {
                addToast('No email or valid phone on file for this assignee.', 'warning');
            }
            return;
        }

        const emailAsked = deliveryChannels.includes('email');
        const smsAsked = deliveryChannels.includes('sms');

        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        for (const ch of deliveryChannels) {
            const pingAction = ch === 'email' ? 'assignee_ping_email' : 'assignee_ping_sms';
            const { count, error: countErr } = await supabaseClient
                .from('activity_log')
                .select('*', { count: 'exact', head: true })
                .eq('entity_id', task.id)
                .eq('action', pingAction)
                .gte('created_at', tenMinAgo);
            if (countErr) console.warn('ping cooldown check:', countErr.message);
            if ((count ?? 0) >= 1) {
                addToast('Wait a few minutes before pinging again.', 'info');
                return;
            }
        }

        setPingingTaskId(task.id);
        try {
            const senderName = state.user?.user_metadata?.full_name || state.user?.email || 'SiteWeave user';
            const taskDueDateLabel = task.due_date
                ? new Date(task.due_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                  })
                : null;
            const { data: manualReminderResult, error: manualReminderError } = await supabaseClient.functions.invoke(
                'dispatch-notification',
                {
                    body: {
                        action: 'manual_task_reminder',
                        taskId: task.id,
                        taskText: task.text || 'Task',
                        recipientEmail: email || null,
                        recipientPhone: phone,
                        deliveryChannels,
                        recipientName: task.contacts?.name || 'there',
                        projectId: project.id,
                        projectName: project.name,
                        projectAddress: project.address || null,
                        organizationId: project.organization_id,
                        organizationName: organizationDisplayName,
                        senderName,
                        taskPriority: task.priority || null,
                        taskDueDateLabel,
                    },
                },
            );
            let res = {
                success: !manualReminderError && Boolean(manualReminderResult?.success),
                error: manualReminderError?.message || manualReminderResult?.error || null,
                channels: manualReminderResult?.channels || {},
            };
            if (!res.success && email && email.includes('@')) {
                const legacyPing = await sendTaskPingEmail(
                    email,
                    { title: task.text || 'Task' },
                    { name: project.name, address: project.address },
                    senderName,
                );
                if (legacyPing.success) {
                    res = { success: true, error: null, channels: { email: true, sms: false } };
                }
            }
            const channels = res.channels || {};
            if (res.success) {
                if (channels.email && email.includes('@')) {
                    await logTaskAssigneeEmailSent({
                        task,
                        user: state.user,
                        projectId: project.id,
                        kind: 'ping',
                        recipientEmail: email,
                        success: true,
                        errorMessage: null,
                        channel: 'email',
                    });
                }
                if (channels.sms && phone) {
                    await logTaskAssigneeEmailSent({
                        task,
                        user: state.user,
                        projectId: project.id,
                        kind: 'ping',
                        recipientEmail: phone,
                        success: true,
                        errorMessage: null,
                        channel: 'sms',
                    });
                }
            } else {
                await logTaskAssigneeEmailSent({
                    task,
                    user: state.user,
                    projectId: project.id,
                    kind: 'ping',
                    recipientEmail: email || phone,
                    success: false,
                    errorMessage: res.error,
                    channel: smsAsked && !emailAsked ? 'sms' : 'email',
                });
            }
            if (res.success) {
                const ch = channels;
                if (ch.email && ch.sms) {
                    const sid = manualReminderResult?.sms?.sid;
                    addToast(
                        sid ? `Reminder sent by email and SMS (SID: ${sid}).` : 'Reminder sent by email and SMS.',
                        'success',
                    );
                } else if (ch.sms && !ch.email) {
                    const sid = manualReminderResult?.sms?.sid;
                    addToast(sid ? `Reminder sent by SMS (SID: ${sid}).` : 'Reminder sent by SMS.', 'success');
                } else if (ch.email) {
                    addToast('Reminder sent by email.', 'success');
                } else {
                    addToast('Reminder could not be delivered on any channel.', 'warning');
                }
                if (smsAsked && phone && !ch.sms) {
                    addToast(
                        `SMS not sent: ${res.error || 'blocked, not configured, or Twilio error.'}`,
                        'warning',
                    );
                }
                if (!phone && rawPhone) {
                    addToast('SMS skipped: assignee phone is not a valid number format.', 'warning');
                } else if (!phone && !rawPhone && emailAsked && ch.email) {
                    addToast('SMS skipped: this assignee has no phone number on file.', 'info');
                }
            } else {
                addToast(res.error || 'Could not send reminder.', 'error');
            }
        } catch (e) {
            addToast(handleApiError(e, 'Could not send ping'), 'error');
        } finally {
            setPingingTaskId(null);
        }
    };

    const isProjectContactsRecursionError = (error) => {
        const message = String(error?.message || '').toLowerCase();
        return message.includes('infinite recursion detected in policy') && message.includes('project_contacts');
    };

    const formatAssigneePhoneDisplay = (phone) => {
        const digits = String(phone || '').replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) {
            return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
        }
        if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
        return String(phone || '').trim();
    };

    const resolveAssigneeContact = useCallback(async ({ assigneeId, assigneeEmailInput, assigneePhoneRaw }) => {
        const normalizedEmail = String(assigneeEmailInput || '').trim().toLowerCase();
        const normalizedPhoneResult = normalizeAssigneePhone(String(assigneePhoneRaw || '').trim(), { defaultRegion: 'US' });
        const normalizedPhone = normalizedPhoneResult.isValid ? normalizedPhoneResult.e164 : null;
        const phoneProvided = String(assigneePhoneRaw || '').trim().length > 0;

        if (phoneProvided && !normalizedPhone) {
            return { assigneeId: assigneeId || null, invalidPhone: true };
        }

        const hasEmail = normalizedEmail.includes('@');
        const hasPhone = Boolean(normalizedPhone);
        if (assigneeId || hasEmail || hasPhone) {
            let primaryContact = null;
            let secondaryContact = null;

            if (assigneeId) {
                const { data: existingAssignee, error: existingAssigneeError } = await supabaseClient
                    .from('contacts')
                    .select('id, name, email, phone')
                    .eq('id', assigneeId)
                    .eq('organization_id', project.organization_id)
                    .maybeSingle();
                if (existingAssigneeError) throw existingAssigneeError;
                primaryContact = existingAssignee || null;
            }

            if (!primaryContact && hasEmail) {
                const { data: emailContact, error: emailContactError } = await supabaseClient
                    .from('contacts')
                    .select('id, name, email, phone')
                    .eq('organization_id', project.organization_id)
                    .ilike('email', normalizedEmail)
                    .limit(1)
                    .maybeSingle();
                if (emailContactError) throw emailContactError;
                primaryContact = emailContact || null;
            }

            if (hasPhone) {
                const { data: phoneRows, error: phoneLookupError } = await supabaseClient
                    .from('contacts')
                    .select('id, name, email, phone')
                    .eq('organization_id', project.organization_id)
                    .eq('phone', normalizedPhone)
                    .limit(1);
                if (phoneLookupError) throw phoneLookupError;
                const phoneContact = phoneRows?.[0] || null;
                if (!primaryContact) {
                    primaryContact = phoneContact;
                } else if (phoneContact && phoneContact.id !== primaryContact.id) {
                    secondaryContact = phoneContact;
                }
            }

            if (!primaryContact) {
                const fallbackName = hasEmail
                    ? (normalizedEmail.split('@')[0] || normalizedEmail)
                    : formatAssigneePhoneDisplay(normalizedPhone);
                const { data: createdRows, error: createdContactError } = await supabaseClient
                    .from('contacts')
                    .insert({
                        organization_id: project.organization_id,
                        name: fallbackName,
                        email: hasEmail ? normalizedEmail : null,
                        phone: hasPhone ? normalizedPhone : null,
                        type: 'Team',
                        role: 'External Assignee',
                        status: 'Available',
                    })
                    .select('id, email, phone')
                    .limit(1);
                if (createdContactError) throw createdContactError;
                primaryContact = createdRows?.[0] || null;
                if (!primaryContact) {
                    throw new Error(
                        'Contact was saved but could not be read back. Check permissions or try again.',
                    );
                }
            }

            const patch = {};
            const existingEmail = String(primaryContact.email || '').trim().toLowerCase();
            const existingPhone = String(primaryContact.phone || '').trim();
            if (hasEmail && existingEmail !== normalizedEmail) patch.email = normalizedEmail;
            if (hasPhone && existingPhone !== normalizedPhone) patch.phone = normalizedPhone;
            const isPlaceholderName = /^(Assignee|Asignado)\s*\(/i.test(String(primaryContact.name || '').trim())
                || /^external assignee$/i.test(String(primaryContact.name || '').trim());
            if (isPlaceholderName) {
                if (!hasEmail && hasPhone) {
                    patch.name = formatAssigneePhoneDisplay(primaryContact.phone || normalizedPhone);
                } else if (hasEmail) {
                    patch.name = normalizedEmail.split('@')[0] || normalizedEmail;
                }
            }
            if (Object.keys(patch).length > 0) {
                const { error: updatePrimaryError } = await supabaseClient
                    .from('contacts')
                    .update(patch)
                    .eq('id', primaryContact.id);
                if (updatePrimaryError) throw updatePrimaryError;
            }

            if (secondaryContact) {
                const secondaryPatch = {};
                if (!secondaryContact.email && hasEmail) secondaryPatch.email = normalizedEmail;
                if (!secondaryContact.phone && hasPhone) secondaryPatch.phone = normalizedPhone;
                if (Object.keys(secondaryPatch).length > 0) {
                    const { error: updateSecondaryError } = await supabaseClient
                        .from('contacts')
                        .update(secondaryPatch)
                        .eq('id', secondaryContact.id);
                    if (updateSecondaryError) throw updateSecondaryError;
                }
            }

            const { error: linkError } = await supabaseClient
                .from('project_contacts')
                .upsert({
                    project_id: project.id,
                    contact_id: primaryContact.id,
                    organization_id: project.organization_id,
                }, {
                    onConflict: 'project_id,contact_id',
                    ignoreDuplicates: true,
                });
            if (linkError && linkError.code !== '23505') {
                if (isProjectContactsRecursionError(linkError)) {
                    console.warn('Skipping project_contacts link due to RLS recursion policy:', linkError.message);
                } else {
                    throw linkError;
                }
            }

            return { assigneeId: primaryContact.id, invalidPhone: false };
        }

        return { assigneeId: assigneeId || null, invalidPhone: false };
    }, [project.id, project.organization_id, t]);

    const handleAddTask = async (taskData) => {
        setIsCreatingTask(true);
        
        try {
            const {
                pending_photos: pendingPhotos = [],
                predecessor_task_ids: predecessorTaskIds = [],
                send_assignment_email: sendAssignmentRequested = false,
                ...taskPayload
            } = taskData;
            const assigneeEmailInput = String(taskPayload.assignee_email || '').trim().toLowerCase();
            delete taskPayload.assignee_email;
            const assigneePhoneRaw = String(taskPayload.assignee_phone || '').trim();
            delete taskPayload.assignee_phone;
            taskPayload.organization_id = project.organization_id;
            taskPayload.notify_assignee_email = Boolean(sendAssignmentRequested);
            Object.assign(taskPayload, normalizeTaskProgressUpdate(null, {
                percent_complete: taskPayload.percent_complete ?? 0,
                completed: taskPayload.completed ?? false,
            }));
            setCreateTaskPhotoUploadProgress(null);

            const resolvedAssignee = await resolveAssigneeContact({
                assigneeId: taskPayload.assignee_id,
                assigneeEmailInput,
                assigneePhoneRaw,
            });
            if (resolvedAssignee.invalidPhone) {
                addToast(t('toast.invalid_assignee_phone'), 'warning');
            }
            taskPayload.assignee_id = resolvedAssignee.assigneeId;

            // Ensure assignee_id is valid before inserting
            if (taskPayload.assignee_id) {
                // Verify the contact exists
                const { data: contact, error: contactError } = await supabaseClient
                    .from('contacts')
                    .select('id, email, name')
                    .eq('id', taskPayload.assignee_id)
                    .single();
                
                if (contactError || !contact) {
                    console.warn('Assignee contact not found, setting to null');
                    taskPayload.assignee_id = null;
                }
            }
            
            const { data, error } = await supabaseClient.from('tasks').insert(taskPayload).select('*, contacts(name, avatar_url, email, phone), task_photos(*)').single();
            if (error) {
                // Provide more specific error message for foreign key violations
                if (error.message?.includes('foreign key constraint')) {
                    addToast(t('toast.cannot_assign_task'), 'warning');
                    // Retry without assignee
                    const taskDataWithoutAssignee = { ...taskPayload, assignee_id: null, notify_assignee_email: false };
                    const { data: retryData, error: retryError } = await supabaseClient
                        .from('tasks')
                        .insert(taskDataWithoutAssignee)
                        .select('*, contacts(name, avatar_url, email, phone), task_photos(*)')
                        .single();
                    if (!retryError && retryData) {
                        let createdTask = { ...retryData, task_photos: [] };
                        if (predecessorTaskIds.length > 0) {
                            const depRows = predecessorTaskIds.map((predecessorId) => ({
                                task_id: predecessorId,
                                successor_task_id: retryData.id,
                                dependency_type: 'finish_to_start',
                                lag_days: 0,
                            }));
                            const { data: insertedDeps } = await supabaseClient
                                .from('task_dependencies')
                                .insert(depRows)
                                .select('id, task_id, successor_task_id, dependency_type, lag_days');
                            if (insertedDeps?.length) {
                                setTaskDependencies((prev) => [...prev, ...insertedDeps]);
                            }
                        }
                        if (pendingPhotos.length > 0) {
                            const uploadedPhotos = [];
                            for (let index = 0; index < pendingPhotos.length; index++) {
                                setCreateTaskPhotoUploadProgress({
                                    current: index + 1,
                                    total: pendingPhotos.length,
                                });
                                const photo = pendingPhotos[index];
                                const row = await uploadTaskPhotoSet(supabaseClient, {
                                    taskId: retryData.id,
                                    organizationId: project.organization_id,
                                    projectId: project.id,
                                    originalFile: photo.originalFile,
                                    thumbnailFile: photo.thumbnailFile,
                                    caption: photo.caption,
                                    isCompletionPhoto: photo.is_completion_photo,
                                    uploadedByUserId: state.user?.id,
                                    sortOrder: index,
                                    capturedAt: photo.captured_at || null,
                                });
                                uploadedPhotos.push(row);
                            }
                            setCreateTaskPhotoUploadProgress(null);
                            createdTask = {
                                ...retryData,
                                task_photos: await hydratePhotoRows(uploadedPhotos),
                            };
                            revokeTaskPhotoDraftUrls(pendingPhotos);
                        }
                        dispatch({ type: 'ADD_TASK', payload: createdTask });
                        setProjectTasksList(prev => [...prev, createdTask]);
                        addToast(t('toast.task_added_without_assignee'), 'success');
                        setShowTaskModal(false);
                        logTaskCreated(createdTask, state.user, project.id);
                        return;
                    }
                }
                throw error;
            }

            let createdTask = { ...data, task_photos: [] };
            if (predecessorTaskIds.length > 0) {
                const depRows = predecessorTaskIds.map((predecessorId) => ({
                    task_id: predecessorId,
                    successor_task_id: data.id,
                    dependency_type: 'finish_to_start',
                    lag_days: 0,
                }));
                const { data: insertedDeps } = await supabaseClient
                    .from('task_dependencies')
                    .insert(depRows)
                    .select('id, task_id, successor_task_id, dependency_type, lag_days');
                if (insertedDeps?.length) {
                    setTaskDependencies((prev) => [...prev, ...insertedDeps]);
                }
            }
            if (pendingPhotos.length > 0) {
                const uploadedPhotos = [];
                for (let index = 0; index < pendingPhotos.length; index++) {
                    setCreateTaskPhotoUploadProgress({
                        current: index + 1,
                        total: pendingPhotos.length,
                    });
                    const photo = pendingPhotos[index];
                    const row = await uploadTaskPhotoSet(supabaseClient, {
                        taskId: data.id,
                        organizationId: project.organization_id,
                        projectId: project.id,
                        originalFile: photo.originalFile,
                        thumbnailFile: photo.thumbnailFile,
                        caption: photo.caption,
                        isCompletionPhoto: photo.is_completion_photo,
                        uploadedByUserId: state.user?.id,
                        sortOrder: index,
                        capturedAt: photo.captured_at || null,
                    });
                    uploadedPhotos.push(row);
                }
                setCreateTaskPhotoUploadProgress(null);
                createdTask = {
                    ...data,
                    task_photos: await hydratePhotoRows(uploadedPhotos),
                };
                revokeTaskPhotoDraftUrls(pendingPhotos);
            }

            dispatch({ type: 'ADD_TASK', payload: createdTask });
            setProjectTasksList(prev => [...prev, createdTask]);
            addToast(t('toast.task_added_successfully'), 'success');
            setShowTaskModal(false);
            
            // Log activity
            logTaskCreated(createdTask, state.user, project.id);

            if (sendAssignmentRequested && createdTask.assignee_id) {
                const assigneeEmail = createdTask.contacts?.email?.trim();
                const assignerName =
                    state.user?.user_metadata?.full_name || state.user?.email || 'SiteWeave user';
                if (assigneeEmail && assigneeEmail.includes('@')) {
                    const taskDetails = {
                        title: createdTask.text,
                        description: createdTask.text,
                        dueDate: createdTask.due_date,
                        priority: createdTask.priority,
                    };
                    const projectDetails = { name: project.name, address: project.address };
                    const res = await sendTaskAssignmentEmail(
                        assigneeEmail,
                        taskDetails,
                        projectDetails,
                        assignerName,
                    );
                    await logTaskAssigneeEmailSent({
                        task: createdTask,
                        user: state.user,
                        projectId: project.id,
                        kind: 'assignment',
                        recipientEmail: assigneeEmail,
                        success: res.success,
                        errorMessage: res.error,
                    });
                    if (res.success) {
                        addToast('Assignment email sent to ' + assigneeEmail, 'success');
                    } else {
                        addToast(
                            'Task saved, but assignment email failed: ' + (res.error || 'Unknown error'),
                            'warning',
                        );
                    }
                } else {
                    await logTaskAssigneeEmailSent({
                        task: createdTask,
                        user: state.user,
                        projectId: project.id,
                        kind: 'assignment',
                        recipientEmail: assigneeEmail || '',
                        success: false,
                        errorMessage: 'No assignee email on file',
                    });
                    addToast('Task saved, but there is no email on file for this assignee.', 'warning');
                }
            }
        } catch (error) {
            addToast(handleApiError(error, t('errors.could_not_add_task')), 'error');
        } finally {
            setCreateTaskPhotoUploadProgress(null);
            setIsCreatingTask(false);
        }
    };

    const handleAddTaskPhotos = async (taskId, files) => {
        const task = allTasks.find((row) => row.id === taskId) || tasksState.find((row) => row.id === taskId);
        if (!task || !project) return;

        setTaskPhotoBusy(taskId, true);
        let preparedPhotos = [];

        try {
            preparedPhotos = await Promise.all(files.map((file, index) =>
                buildTaskPhotoDraft(file, (task.task_photos?.length || 0) + index)
            ));

            const uploadedPhotos = [];
            for (let index = 0; index < preparedPhotos.length; index++) {
                const photo = preparedPhotos[index];
                setTaskPhotoUploadProgress({
                    taskId,
                    current: index + 1,
                    total: preparedPhotos.length,
                });
                const row = await uploadTaskPhotoSet(supabaseClient, {
                    taskId,
                    organizationId: project.organization_id,
                    projectId: project.id,
                    originalFile: photo.originalFile,
                    thumbnailFile: photo.thumbnailFile,
                    caption: photo.caption,
                    isCompletionPhoto: photo.is_completion_photo,
                    uploadedByUserId: state.user?.id,
                    sortOrder: (task.task_photos?.length || 0) + index,
                    capturedAt: photo.captured_at || null,
                });
                uploadedPhotos.push(row);
            }

            const hydratedUploadedPhotos = await hydratePhotoRows(uploadedPhotos);
            replaceTaskRow(taskId, {
                ...task,
                task_photos: sortTaskPhotos([...(task.task_photos || []), ...hydratedUploadedPhotos]),
            });
            addToast('Task photos uploaded.', 'success');
        } catch (error) {
            addToast(error.message || 'Could not upload task photos.', 'error');
        } finally {
            revokeTaskPhotoDraftUrls(preparedPhotos);
            setTaskPhotoUploadProgress(null);
            setTaskPhotoBusy(taskId, false);
        }
    };

    const handleUpdateTaskPhoto = async (taskId, photoId, updates) => {
        const task = allTasks.find((row) => row.id === taskId) || tasksState.find((row) => row.id === taskId);
        if (!task) return;

        const targetPhoto = (task.task_photos || []).find((photo) => photo.id === photoId || photo.local_id === photoId);
        if (!targetPhoto?.id) return;

        setTaskPhotoBusy(taskId, true);
        try {
            const updatedPhoto = await updateTaskPhoto(supabaseClient, targetPhoto.id, updates);
            const hydratedPhoto = (await hydratePhotoRows([updatedPhoto]))[0];
            replaceTaskRow(taskId, {
                ...task,
                task_photos: sortTaskPhotos((task.task_photos || []).map((photo) =>
                    photo.id === targetPhoto.id ? { ...photo, ...hydratedPhoto } : photo
                )),
            });
        } catch (error) {
            addToast(error.message || 'Could not update task photo.', 'error');
        } finally {
            setTaskPhotoBusy(taskId, false);
        }
    };

    const handleDeleteTaskPhoto = async (taskId, photoId) => {
        const task = allTasks.find((row) => row.id === taskId) || tasksState.find((row) => row.id === taskId);
        if (!task) return;

        const targetPhoto = (task.task_photos || []).find((photo) => photo.id === photoId || photo.local_id === photoId);
        if (!targetPhoto?.id) return;

        setTaskPhotoBusy(taskId, true);
        try {
            await deleteTaskPhoto(supabaseClient, targetPhoto);
            const remainingPhotos = sortTaskPhotos((task.task_photos || []).filter((photo) => photo.id !== targetPhoto.id));
            if (remainingPhotos.length > 0) {
                await reorderTaskPhotos(supabaseClient, taskId, remainingPhotos.map((photo) => photo.id));
                remainingPhotos.forEach((photo, index) => {
                    photo.sort_order = index;
                });
            }
            replaceTaskRow(taskId, {
                ...task,
                task_photos: remainingPhotos,
            });
            addToast('Task photo removed.', 'success');
        } catch (error) {
            addToast(error.message || 'Could not delete task photo.', 'error');
        } finally {
            setTaskPhotoBusy(taskId, false);
        }
    };

    const handleMoveTaskPhoto = async (taskId, photoId, direction) => {
        const task = allTasks.find((row) => row.id === taskId) || tasksState.find((row) => row.id === taskId);
        if (!task) return;

        const currentPhotos = sortTaskPhotos(task.task_photos || []);
        const currentIndex = currentPhotos.findIndex((photo) => photo.id === photoId || photo.local_id === photoId);
        const nextIndex = currentIndex + direction;

        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentPhotos.length) return;

        const reorderedPhotos = [...currentPhotos];
        const [movedPhoto] = reorderedPhotos.splice(currentIndex, 1);
        reorderedPhotos.splice(nextIndex, 0, movedPhoto);

        setTaskPhotoBusy(taskId, true);
        try {
            await reorderTaskPhotos(supabaseClient, taskId, reorderedPhotos.map((photo) => photo.id));
            replaceTaskRow(taskId, {
                ...task,
                task_photos: reorderedPhotos.map((photo, index) => ({ ...photo, sort_order: index })),
            });
        } catch (error) {
            addToast(error.message || 'Could not reorder task photos.', 'error');
        } finally {
            setTaskPhotoBusy(taskId, false);
        }
    };

    const notifySuccessorAssignees = useCallback(async (completedTask) => {
        if (!completedTask?.id || !project) return;
        if (project.dependency_notifications_enabled === false) return;
        const successorLinks = taskDependencies.filter((dep) => dep.task_id === completedTask.id);
        if (successorLinks.length === 0) return;

        const successorTasks = successorLinks.map((dep) => allTasks.find((task) => task.id === dep.successor_task_id)).filter(Boolean);
        const pendingNotifications = successorTasks
            .filter((task) => task.assignee_id && task.contacts?.email && task.assignee_id !== completedTask.assignee_id)
            .map((task) => ({
                successorTaskId: task.id,
                assigneeName: task.contacts.name || 'there',
                email: task.contacts.email,
                unlockedTaskName: task.text || 'Task',
                successorPriority: task.priority || null,
                successorDueDate: task.due_date
                    ? new Date(task.due_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                      })
                    : null,
            }));
        if (pendingNotifications.length === 0) return;

        const { data: existingRows, error: existingError } = await supabaseClient
            .from('task_dependency_notification_history')
            .select('successor_task_id, recipient_email')
            .eq('trigger_task_id', completedTask.id);
        if (existingError) {
            console.error('Failed to read dependency notification history:', existingError);
        }
        const existingKeys = new Set(
            (existingRows || []).map((row) => `${row.successor_task_id}:${row.recipient_email}`)
        );

        const sendPromises = pendingNotifications.map(async (recipient) => {
            const notificationKey = `${recipient.successorTaskId}:${recipient.email}`;
            if (existingKeys.has(notificationKey)) return;
            const { error } = await supabaseClient.functions.invoke('dispatch-notification', {
                body: {
                    action: 'dependency_unlocked',
                    completedTaskId: completedTask.id,
                    completedTaskText: completedTask.text || 'Task',
                    successorTaskId: recipient.successorTaskId,
                    successorTaskText: recipient.unlockedTaskName,
                    recipientEmail: recipient.email,
                    recipientName: recipient.assigneeName,
                    projectId: project.id,
                    projectName: project.name,
                    projectAddress: project.address || null,
                    organizationId: project.organization_id,
                    actorName: state.user?.email || state.user?.id || 'A teammate',
                    successorPriority: recipient.successorPriority,
                    successorDueDate: recipient.successorDueDate,
                },
            });
            if (error) {
                console.error('Failed to send dependency unlock email:', error);
                addToast(`Could not notify ${recipient.assigneeName}.`, 'warning');
                return;
            }
        });
        await Promise.all(sendPromises);
    }, [addToast, allTasks, project, state.user, taskDependencies]);
    
    // Helper function to calculate next due date for recurring tasks
    const calculateNextTaskDueDate = (currentDate, recurrence) => {
        const nextDate = new Date(currentDate);
        const interval = recurrence.interval || 1;

        switch (recurrence.pattern) {
            case 'daily':
            case 'weekdays':
                nextDate.setDate(nextDate.getDate() + interval);
                break;
            case 'weekly':
                if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
                    // Find next matching weekday
                    let daysAdded = 1;
                    while (daysAdded < 14) {
                        if (recurrence.daysOfWeek.includes(nextDate.getDay())) {
                            break;
                        }
                        nextDate.setDate(nextDate.getDate() + 1);
                        daysAdded++;
                    }
                } else {
                    nextDate.setDate(nextDate.getDate() + (7 * interval));
                }
                break;
            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + interval);
                break;
            case 'yearly':
                nextDate.setFullYear(nextDate.getFullYear() + interval);
                break;
            default:
                nextDate.setDate(nextDate.getDate() + interval);
        }

        return nextDate;
    };

    const handleEditTask = async (taskId, updatedData) => {
        const prev = allTasks.find((x) => x.id === taskId);
        const payload = { ...updatedData };
        const assigneeEmailInput = String(payload.assignee_email || '').trim().toLowerCase();
        const assigneePhoneRaw = String(payload.assignee_phone || '').trim();
        delete payload.assignee_email;
        delete payload.assignee_phone;

        try {
            const resolvedAssignee = await resolveAssigneeContact({
                assigneeId: payload.assignee_id,
                assigneeEmailInput,
                assigneePhoneRaw,
            });
            if (resolvedAssignee.invalidPhone) {
                addToast(t('toast.invalid_assignee_phone'), 'warning');
            }
            payload.assignee_id = resolvedAssignee.assigneeId;
        } catch (resolveError) {
            addToast(t('toast.error_updating_task', { message: resolveError.message }), 'error');
            return;
        }

        const normalizedUpdates = normalizeTaskProgressUpdate(prev, payload);
        const { error } = await supabaseClient.from('tasks').update(normalizedUpdates).eq('id', taskId);
        if (error) {
            addToast(t('toast.error_updating_task', { message: error.message }), 'error');
        } else {
            const existingTask = allTasks.find((task) => task.id === taskId) || tasksState.find((task) => task.id === taskId);
            const baseTask = state.tasks.find((task) => task.id === taskId) || existingTask;
            const shouldRefetchTaskRow =
                Boolean(assigneeEmailInput || assigneePhoneRaw) ||
                (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'assignee_id') &&
                    normalizedUpdates.assignee_id !== prev?.assignee_id);

            let updatedTask = { ...baseTask, ...normalizedUpdates };
            if (shouldRefetchTaskRow) {
                const { data: fresh, error: freshErr } = await supabaseClient
                    .from('tasks')
                    .select('*, contacts(name, avatar_url, email, phone), task_photos(*)')
                    .eq('id', taskId)
                    .maybeSingle();
                if (!freshErr && fresh) {
                    updatedTask = { ...updatedTask, ...fresh };
                }
            }
            dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
            setProjectTasksList((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updatedTask } : t)));

            const dateFieldChanged = (
                Object.prototype.hasOwnProperty.call(normalizedUpdates, 'start_date') ||
                Object.prototype.hasOwnProperty.call(normalizedUpdates, 'due_date') ||
                Object.prototype.hasOwnProperty.call(normalizedUpdates, 'duration_days')
            );
            if (dateFieldChanged && projectDependencyMode === 'auto') {
                const taskGraph = allTasks.map((task) => (task.id === taskId ? updatedTask : task));
                const cascaded = calculateAutoShiftUpdates(taskGraph, taskDependencies, [taskId]);
                for (const shift of cascaded) {
                    const shiftPayload = {
                        start_date: shift.start_date || null,
                        due_date: shift.due_date || null,
                    };
                    const { error: shiftError } = await supabaseClient
                        .from('tasks')
                        .update(shiftPayload)
                        .eq('id', shift.taskId);
                    if (shiftError) {
                        console.error('Failed to apply auto-shift update:', shiftError);
                        continue;
                    }
                    const sourceTask = allTasks.find((task) => task.id === shift.taskId) || tasksState.find((task) => task.id === shift.taskId);
                    if (!sourceTask) continue;
                    const shiftedTask = { ...sourceTask, ...shiftPayload };
                    dispatch({ type: 'UPDATE_TASK', payload: shiftedTask });
                    setProjectTasksList(prevRows => prevRows.map((row) => row.id === shift.taskId ? shiftedTask : row));
                }
                if (cascaded.length > 0) {
                    addToast(`Updated ${cascaded.length} dependent task date${cascaded.length === 1 ? '' : 's'}.`, 'success');
                }
            } else if (dateFieldChanged && projectDependencyMode === 'manual') {
                const earliestAllowed = getEarliestAllowedStartDate(taskId, allTasks.map((task) => (
                    task.id === taskId ? updatedTask : task
                )), taskDependencies);
                if (
                    earliestAllowed &&
                    normalizedUpdates.start_date &&
                    new Date(`${normalizedUpdates.start_date}T00:00:00`) < new Date(`${earliestAllowed}T00:00:00`)
                ) {
                    addToast(`Dependency warning: this task should start on or after ${earliestAllowed}.`, 'warning');
                }
            }
            addToast(t('toast.task_updated_successfully'), 'success');

            const wasPrevComplete = prev
                ? Boolean(prev.completed) || (Number(prev.percent_complete ?? 0) || 0) >= 100
                : false;
            const nowComplete =
                Boolean(updatedTask.completed) || (Number(updatedTask.percent_complete ?? 0) || 0) >= 100;
            const transitionToComplete = Boolean(prev) && nowComplete && !wasPrevComplete;
            const transitionFromComplete = Boolean(prev) && !nowComplete && wasPrevComplete;

            if (transitionToComplete) {
                const taskWarning = dependencyWarnings[taskId];
                if (taskWarning?.unmetPredecessors?.length) {
                    addToast(`Dependency warning: waiting on ${taskWarning.unmetPredecessors.map((row) => row.text).join(', ')}.`, 'warning');
                }
            }

            if (prev && project && state.user) {
                const changes = {};
                Object.keys(normalizedUpdates).forEach((key) => {
                    if (prev[key] !== normalizedUpdates[key]) changes[key] = normalizedUpdates[key];
                });
                if (transitionToComplete || transitionFromComplete) {
                    delete changes.completed;
                    delete changes.percent_complete;
                }
                if (Object.keys(changes).length > 0) {
                    logTaskUpdated(
                        { ...prev, ...normalizedUpdates, organization_id: prev.organization_id ?? project.organization_id },
                        state.user,
                        project.id,
                        changes
                    );
                }
            }

            if (transitionToComplete && state.user && prev) {
                const completedTask = { ...prev, ...normalizedUpdates, completed: true, percent_complete: 100 };
                logTaskCompleted(
                    completedTask,
                    state.user,
                    project.id,
                    buildTaskCompletionPhotoDetails(completedTask)
                );
                await notifySuccessorAssignees(completedTask);
            } else if (transitionFromComplete && state.user && prev) {
                logTaskUncompleted(prev, state.user, prev.project_id);
                const { error: clearHistoryError } = await supabaseClient
                    .from('task_dependency_notification_history')
                    .delete()
                    .eq('trigger_task_id', prev.id);
                if (clearHistoryError) {
                    console.error('Failed to clear dependency notification history:', clearHistoryError);
                }
            }

            if (transitionToComplete && prev && prev.recurrence && !prev.is_recurring_instance) {
                try {
                    const recurrence = parseRecurrence(prev.recurrence);
                    if (recurrence) {
                        const currentDueDate = prev.due_date ? new Date(prev.due_date) : new Date();
                        const nextDueDate = calculateNextTaskDueDate(currentDueDate, recurrence);
                        const nextInstance = {
                            project_id: prev.project_id,
                            text: prev.text,
                            due_date: nextDueDate.toISOString().split('T')[0],
                            priority: prev.priority,
                            assignee_id: prev.assignee_id,
                            recurrence: prev.recurrence,
                            parent_task_id: prev.id,
                            is_recurring_instance: true,
                            completed: false,
                            percent_complete: 0,
                        };
                        const { data: newInstance, error: instanceError } = await supabaseClient
                            .from('tasks')
                            .insert(nextInstance)
                            .select()
                            .single();
                        if (!instanceError && newInstance) {
                            dispatch({ type: 'ADD_TASK', payload: newInstance });
                            addToast(t('toast.next_task_instance_created'), 'success');
                        }
                    }
                } catch (recurError) {
                    console.error('Error generating next task instance:', recurError);
                }
            }
        }
    };

    const handleTaskDrop = (taskId, targetPhaseId) => {
        // Avoid a no-op update if the task is already in that phase
        const task = allTasks.find((t) => t.id === taskId);
        const currentPhaseId = task?.project_phase_id || null;
        const nextPhaseId = targetPhaseId || null;
        if (currentPhaseId === nextPhaseId) return;
        handleEditTask(taskId, { project_phase_id: nextPhaseId });
    };

    const handleFixTaskDependencyDates = async (taskId) => {
        const task = allTasks.find((row) => row.id === taskId);
        if (!task) return;
        const earliestAllowed = getEarliestAllowedStartDate(taskId, allTasks, taskDependencies);
        if (!earliestAllowed) return;
        if (task.start_date && new Date(`${task.start_date}T00:00:00`) >= new Date(`${earliestAllowed}T00:00:00`)) {
            return;
        }
        const shiftByDays = task.start_date
            ? Math.round((new Date(`${earliestAllowed}T00:00:00`) - new Date(`${task.start_date}T00:00:00`)) / (24 * 60 * 60 * 1000))
            : 0;
        const dueDate = task.due_date
            ? (() => {
                const due = new Date(`${task.due_date}T00:00:00`);
                due.setDate(due.getDate() + shiftByDays);
                return due.toISOString().split('T')[0];
            })()
            : task.due_date;
        await handleEditTask(taskId, { start_date: earliestAllowed, due_date: dueDate });
    };

    const handleAddDependency = async (successorTaskId, predecessorTaskId) => {
        if (!successorTaskId || !predecessorTaskId) return;
        if (successorTaskId === predecessorTaskId) {
            addToast('A task cannot depend on itself.', 'warning');
            return;
        }
        if (taskDependencies.some((dep) => dep.task_id === predecessorTaskId && dep.successor_task_id === successorTaskId)) {
            addToast('This dependency already exists.', 'warning');
            return;
        }
        if (wouldCreateDependencyCycle(allTasks, taskDependencies, predecessorTaskId, successorTaskId)) {
            addToast('Cannot create dependency cycle.', 'warning');
            return;
        }
        const { data, error } = await supabaseClient
            .from('task_dependencies')
            .insert({
                task_id: predecessorTaskId,
                successor_task_id: successorTaskId,
                dependency_type: 'finish_to_start',
                lag_days: 0,
            })
            .select('id, task_id, successor_task_id, dependency_type, lag_days')
            .single();
        if (error) {
            addToast(`Could not add dependency: ${error.message}`, 'error');
            return;
        }
        setTaskDependencies((prev) => [...prev, data]);
        addToast('Dependency added.', 'success');
    };

    const handleRemoveDependency = async (dependencyId) => {
        if (!dependencyId) return;
        const { error } = await supabaseClient
            .from('task_dependencies')
            .delete()
            .eq('id', dependencyId);
        if (error) {
            addToast(`Could not remove dependency: ${error.message}`, 'error');
            return;
        }
        setTaskDependencies((prev) => prev.filter((dep) => dep.id !== dependencyId));
        addToast('Dependency removed.', 'success');
    };

    const handleDeleteTask = async (taskId) => {
        const task = tasks.find(t => t.id === taskId);
        setTaskToDelete({ id: taskId, text: task?.text || 'this task' });
        setShowDeleteConfirm(true);
    };

    const confirmDeleteTask = async () => {
        if (!taskToDelete) {
            setShowDeleteConfirm(false);
            setTaskToDelete(null);
            return;
        }

        try {
            const parentTask = allTasks.find((task) => task.id === taskToDelete.id) || tasksState.find((task) => task.id === taskToDelete.id);

            // First, find all child tasks (subtasks) that reference this task as parent
            const { data: childTasks, error: fetchError } = await supabaseClient
                .from('tasks')
                .select('id')
                .eq('parent_task_id', taskToDelete.id);

            if (fetchError) {
                addToast(t('toast.error_checking_subtasks', { message: fetchError.message }), 'error');
                setShowDeleteConfirm(false);
                setTaskToDelete(null);
                return;
            }

            // If there are child tasks, set their parent_task_id to null first
            if (childTasks && childTasks.length > 0) {
                const { error: updateError } = await supabaseClient
                    .from('tasks')
                    .update({ parent_task_id: null })
                    .eq('parent_task_id', taskToDelete.id);

                if (updateError) {
                    addToast(t('toast.error_updating_subtasks', { message: updateError.message }), 'error');
                    setShowDeleteConfirm(false);
                    setTaskToDelete(null);
                    return;
                }

                // Update child tasks in state
                childTasks.forEach(childTask => {
                    const updatedTask = { ...tasksState.find(t => t.id === childTask.id), parent_task_id: null };
                    dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
                });
            }

            if (parentTask?.task_photos?.length) {
                await Promise.all(parentTask.task_photos.map((photo) => deleteTaskPhoto(supabaseClient, photo)));
            }

            // Now delete the parent task
            const { error } = await supabaseClient.from('tasks').delete().eq('id', taskToDelete.id);
            
            if (error) {
                addToast(t('toast.error_deleting_task', { message: error.message }), 'error');
            } else {
                const deletedRow =
                    allTasks.find((x) => x.id === taskToDelete.id) ||
                    tasksState.find((x) => x.id === taskToDelete.id);
                if (deletedRow && project && state.user) {
                    logTaskDeleted(
                        { ...deletedRow, organization_id: deletedRow.organization_id ?? project.organization_id },
                        state.user,
                        project.id
                    );
                }
                dispatch({ type: 'DELETE_TASK', payload: taskToDelete.id });
                setProjectTasksList(prev => prev.filter(t => t.id !== taskToDelete.id));
                const childCount = childTasks?.length || 0;
                if (childCount > 0) {
                    addToast(t('toast.task_deleted_with_subtasks', { count: childCount }), 'success');
                } else {
                    addToast(t('toast.task_deleted_successfully'), 'success');
                }
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            addToast(t('toast.error_deleting_task', { message: error.message }), 'error');
        } finally {
            setShowDeleteConfirm(false);
            setTaskToDelete(null);
        }
    };

    const handleTaskSelect = (taskId) => {
        setSelectedTasks(prev => 
            prev.includes(taskId) 
                ? prev.filter(id => id !== taskId)
                : [...prev, taskId]
        );
    };

    const handleBulkComplete = async (taskIds) => {
        const { error } = await supabaseClient.from('tasks').update({ completed: true, percent_complete: 100 }).in('id', taskIds);
        if (error) {
            addToast(t('toast.error_completing_tasks', { message: error.message }), 'error');
        } else {
            // Update each task in the state
            taskIds.forEach(taskId => {
                const sourceTask = allTasks.find((task) => task.id === taskId) || tasksState.find((task) => task.id === taskId);
                const updatedTask = { ...sourceTask, completed: true, percent_complete: 100 };
                dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
                setProjectTasksList(prev => prev.map((task) => task.id === taskId ? updatedTask : task));
            });
            if (project && state.user) {
                taskIds.forEach((taskId) => {
                    const row = allTasks.find((x) => x.id === taskId) || tasksState.find((x) => x.id === taskId);
                    if (row) {
                        logTaskCompleted(
                            { ...row, completed: true, organization_id: row.organization_id ?? project.organization_id },
                            state.user,
                            project.id,
                            buildTaskCompletionPhotoDetails(row)
                        );
                    }
                });
            }
            addToast(t('toast.tasks_completed_successfully', { count: taskIds.length }), 'success');
            setSelectedTasks([]);
        }
    };

    const handleBulkDelete = async (taskIds) => {
        try {
            const targetTasks = taskIds
                .map((taskId) => allTasks.find((task) => task.id === taskId) || tasksState.find((task) => task.id === taskId))
                .filter(Boolean);

            // First, find all child tasks that reference any of these tasks as parent
            const { data: childTasks, error: fetchError } = await supabaseClient
                .from('tasks')
                .select('id, parent_task_id')
                .in('parent_task_id', taskIds);

            if (fetchError) {
                addToast(t('toast.error_checking_subtasks', { message: fetchError.message }), 'error');
                return;
            }

            // If there are child tasks, set their parent_task_id to null first
            if (childTasks && childTasks.length > 0) {
                const { error: updateError } = await supabaseClient
                    .from('tasks')
                    .update({ parent_task_id: null })
                    .in('parent_task_id', taskIds);

                if (updateError) {
                    addToast(t('toast.error_updating_subtasks', { message: updateError.message }), 'error');
                    return;
                }

                // Update child tasks in state
                childTasks.forEach(childTask => {
                    const updatedTask = { ...tasksState.find(t => t.id === childTask.id), parent_task_id: null };
                    dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
                });
            }

            const taskPhotos = targetTasks.flatMap((task) => task.task_photos || []);
            if (taskPhotos.length > 0) {
                await Promise.all(taskPhotos.map((photo) => deleteTaskPhoto(supabaseClient, photo)));
            }

            // Now delete the selected tasks
            const { error } = await supabaseClient.from('tasks').delete().in('id', taskIds);
            
            if (error) {
                addToast(t('toast.error_deleting_tasks', { message: error.message }), 'error');
            } else {
                if (project && state.user) {
                    taskIds.forEach((taskId) => {
                        const row = allTasks.find((x) => x.id === taskId) || tasksState.find((x) => x.id === taskId);
                        if (row) {
                            logTaskDeleted(
                                { ...row, organization_id: row.organization_id ?? project.organization_id },
                                state.user,
                                project.id
                            );
                        }
                    });
                }
                // Remove each task from the state
                taskIds.forEach(taskId => {
                    dispatch({ type: 'DELETE_TASK', payload: taskId });
                });
                const childCount = childTasks?.length || 0;
                if (childCount > 0) {
                    addToast(t('toast.tasks_deleted_with_subtasks', { count: taskIds.length, subtaskCount: childCount }), 'success');
                } else {
                    addToast(t('toast.tasks_deleted_successfully', { count: taskIds.length }), 'success');
                }
                setSelectedTasks([]);
            }
        } catch (error) {
            console.error('Error in bulk delete:', error);
            addToast(t('toast.error_deleting_tasks', { message: error.message }), 'error');
        }
    };

    const taskLookup = useMemo(
        () => new Map(allTasks.map((task) => [task.id, task])),
        [allTasks]
    );

    const dependencyMetaByTaskId = useMemo(() => {
        const meta = {};
        allTasks.forEach((task) => {
            const predecessors = taskDependencies
                .filter((dep) => dep.successor_task_id === task.id)
                .map((dep) => ({
                    ...dep,
                    predecessorTask: taskLookup.get(dep.task_id) || null,
                }));
            const successors = taskDependencies
                .filter((dep) => dep.task_id === task.id)
                .map((dep) => ({
                    ...dep,
                    successorTask: taskLookup.get(dep.successor_task_id) || null,
                }));
            meta[task.id] = {
                predecessors,
                successors,
                warning: dependencyWarnings[task.id] || null,
            };
        });
        return meta;
    }, [allTasks, taskDependencies, taskLookup, dependencyWarnings]);

    const dependencyDrawerTask = dependencyDrawerTaskId ? taskLookup.get(dependencyDrawerTaskId) || null : null;
    const dependencyDrawerMeta = dependencyDrawerTask ? dependencyMetaByTaskId[dependencyDrawerTask.id] || null : null;
    const linkedPredecessorIds = useMemo(
        () => new Set((dependencyDrawerMeta?.predecessors || []).map((dep) => dep.task_id)),
        [dependencyDrawerMeta]
    );
    const linkedSuccessorIds = useMemo(
        () => new Set((dependencyDrawerMeta?.successors || []).map((dep) => dep.successor_task_id)),
        [dependencyDrawerMeta]
    );
    const filterDrawerTasks = useCallback((query, idsToExclude) => {
        const normalizedQuery = query.trim().toLowerCase();
        return allTasks
            .filter((task) => task.id !== dependencyDrawerTaskId && !idsToExclude.has(task.id))
            .filter((task) => {
                if (!normalizedQuery) return true;
                const assigneeName = task.contacts?.name || '';
                return `${task.text} ${assigneeName}`.toLowerCase().includes(normalizedQuery);
            })
            .slice(0, 8);
    }, [allTasks, dependencyDrawerTaskId]);
    const predecessorCandidateTasks = useMemo(
        () => filterDrawerTasks(drawerPredecessorQuery, linkedPredecessorIds),
        [drawerPredecessorQuery, filterDrawerTasks, linkedPredecessorIds]
    );
    const successorCandidateTasks = useMemo(
        () => filterDrawerTasks(drawerSuccessorQuery, linkedSuccessorIds),
        [drawerSuccessorQuery, filterDrawerTasks, linkedSuccessorIds]
    );

    useEffect(() => {
        if (dependencyDrawerTaskId && !dependencyDrawerTask) {
            setDependencyDrawerTaskId(null);
        }
    }, [dependencyDrawerTask, dependencyDrawerTaskId]);


    return (
        <div>
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4" data-onboarding="project-header">
                <div className="min-w-0 flex-1">
                    <h1 className="text-3xl font-bold text-gray-900 ui-ellipsis-1" title={project.name}>{project.name}</h1>
                    <p className="text-gray-500 ui-ellipsis-1" title={project.address}>{project.address}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 lg:gap-3">
                    <PermissionGuard 
                        permission="can_edit_projects"
                        fallback={
                            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                                project.status?.toLowerCase() === 'planning' ? 'bg-blue-100 text-blue-800' :
                                project.status?.toLowerCase() === 'in progress' ? 'bg-green-100 text-green-800' :
                                project.status?.toLowerCase() === 'on hold' ? 'bg-yellow-100 text-yellow-900' :
                                project.status?.toLowerCase() === 'completed' ? 'bg-gray-100 text-gray-800' :
                                'bg-gray-100 text-gray-800'
                            }`}>
                                {project.status || 'Planning'}
                            </span>
                        }
                    >
                        <select
                            value={project.status || ''}
                            onChange={async (e) => {
                            const newStatus = e.target.value;
                            try {
                                const { error } = await supabaseClient
                                    .from('projects')
                                    .update({ 
                                        status: newStatus,
                                        updated_at: new Date().toISOString()
                                    })
                                    .eq('id', project.id);

                                if (error) {
                                    addToast(t('toast.error_updating_project_status', { message: error.message }), 'error');
                                } else {
                                    dispatch({
                                        type: 'UPDATE_PROJECT',
                                        payload: { ...project, status: newStatus }
                                    });
                                    addToast(t('toast.project_status_updated_successfully'), 'success');
                                }
                            } catch (error) {
                                addToast(t('toast.error_updating_project_status', { message: error.message }), 'error');
                            }
                        }}
                        className={`px-3 py-1 text-sm font-semibold rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-hidden appearance-none pr-8 ${
                            project.status?.toLowerCase() === 'planning' ? 'bg-blue-100 text-blue-800' :
                            project.status?.toLowerCase() === 'in progress' ? 'bg-green-100 text-green-800' :
                            project.status?.toLowerCase() === 'on hold' ? 'bg-yellow-100 text-yellow-900' :
                            project.status?.toLowerCase() === 'completed' ? 'bg-gray-100 text-gray-800' :
                            'bg-gray-100 text-gray-800'
                        }`}
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 0.5rem center',
                            backgroundSize: '1em 1em',
                            paddingRight: '2rem'
                        }}
                    >
                        <option value="Planning">Planning</option>
                        <option value="In Progress">In Progress</option>
                        <option value="On Hold">On Hold</option>
                        <option value="Completed">Completed</option>
                    </select>
                    </PermissionGuard>
                    {crewMembers.length > 0 && (
                        <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                                {crewMembers.slice(0, 5).map(member => (
                                    member.avatar_url ? (
                                        <img key={member.id} src={member.avatar_url} title={member.name} className="w-8 h-8 rounded-full" />
                                    ) : (
                                        <Avatar key={member.id} name={member.name} size="sm" />
                                    )
                                ))}
                            </div>
                            {crewMembers.length > 5 && (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 -ml-2">
                                    +{crewMembers.length - 5}
                                </div>
                            )}
                        </div>
                    )}
                    <PermissionGuard permission="can_edit_projects">
                        <button
                            onClick={() => setShowProjectModal(true)}
                            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg shadow-xs hover:bg-gray-200 transition-colors"
                            title="Edit project settings"
                        >
                            Edit Project
                        </button>
                    </PermissionGuard>
                    <button 
                        onClick={() => setShowShare(true)}
                        className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-xs hover:bg-blue-700 transition-colors"
                        title="Assign crew members from organization directory or invite guests"
                    >
                        + Manage Crew
                    </button>
                    <PermissionGuard permission="can_create_projects">
                        <button 
                            onClick={() => setShowSaveAsTemplateModal(true)}
                            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg shadow-xs hover:bg-gray-200 transition-colors"
                            title="Save this project structure as a reusable template"
                        >
                            Save as template
                        </button>
                    </PermissionGuard>
                    <PermissionGuard permission="can_manage_progress_reports">
                        <button 
                            onClick={() => setShowProgressReportModal(true)}
                            className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg shadow-xs hover:bg-green-700 transition-colors flex items-center gap-2"
                            title="Schedule and manage progress reports"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Progress Reports
                        </button>
                    </PermissionGuard>
                </div>
            </header>

            {showShare && (
                <ShareModal projectId={project.id} onClose={() => setShowShare(false)} />
            )}

            {showProgressReportModal && (
                <ProgressReportModal projectId={project.id} onClose={() => setShowProgressReportModal(false)} />
            )}

            {showSaveAsTemplateModal && (
                <SaveAsTemplateModal 
                    projectId={project.id} 
                    projectName={project.name} 
                    onClose={() => setShowSaveAsTemplateModal(false)} 
                />
            )}

            {showProjectModal && (
                <ProjectModal
                    onClose={() => setShowProjectModal(false)}
                    onSave={handleSaveProject}
                    isLoading={isSavingProject}
                    project={project}
                />
            )}

            {showMsProjectImportModal && project && (
                <MsProjectImportModal
                    context="existing"
                    projectId={project.id}
                    projectName={project.name}
                    onClose={() => setShowMsProjectImportModal(false)}
                    onSuccess={() => {
                        setShowMsProjectImportModal(false);
                    }}
                />
            )}

            {showWeatherImpactModal && project && (
                <WeatherImpactModal
                    project={project}
                    allTasks={allTasks}
                    projectPhases={projectPhases}
                    taskDependencies={taskDependencies}
                    projectDependencyMode={projectDependencyMode}
                    initialImpact={selectedWeatherImpact}
                    onClose={() => {
                        setShowWeatherImpactModal(false);
                        setSelectedWeatherImpact(null);
                    }}
                    onApplied={() => setProjectRefreshNonce((n) => n + 1)}
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Main content — full width on Gantt and Tasks (sidebar hidden) */}
                <div
                    className={
                        activeTab === 'gantt' || activeTab === 'tasks' || activeTab === 'updates' ? 'lg:col-span-5' : 'lg:col-span-3'
                    }
                >
                    {/* Tab Navigation */}
                    <div className="border-b border-gray-200 mb-6">
                        <nav className="-mb-px flex flex-wrap gap-x-5 gap-y-2">
                            <button
                                onClick={() => setActiveTab('tasks')}
                                className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'tasks'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                Tasks ({Math.max(allTasks.length, ganttTasks.length)})
                            </button>
                            <button
                                onClick={() => setActiveTab('gantt')}
                                className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'gantt'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                Gantt
                            </button>
                            <button
                                onClick={() => {
                                    setCollabPanel('stream');
                                    setActiveTab('updates');
                                }}
                                className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                                    activeTab === 'updates'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                Updates
                                {collaborationUnreadCount > 0 && activeTab !== 'updates' ? (
                                    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                        {collaborationUnreadCount > 99 ? '99+' : collaborationUnreadCount}
                                    </span>
                                ) : null}
                                {fieldIssuesCount > 0 ? (
                                    <span className="text-[10px] font-normal text-gray-500">
                                        · {fieldIssuesCount} issue{fieldIssuesCount === 1 ? '' : 's'}
                                    </span>
                                ) : null}
                            </button>
                            {canViewActivityHistory && (
                            <button
                                onClick={() => setActiveTab('activity')}
                                className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'activity'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                {t('activityHistory.tabLabel')}
                            </button>
                            )}
                        </nav>
                    </div>

                    {/* Tab Content */}
                    <div className="min-h-96">
                        {activeTab === 'gantt' && (
                            <div
                                className="bg-white rounded-xl shadow-xs border border-gray-200 flex flex-col"
                                data-onboarding="gantt-section"
                                style={{ height: 'calc(100vh - 190px)' }}
                            >
                                <div className="flex-1 min-h-0 flex flex-col p-4">
                                    <GanttChart
                                        tasks={ganttTasks}
                                        dependencies={ganttDependencies}
                                        criticalPathIds={ganttCriticalIds}
                                        showCriticalPath={showCriticalPath}
                                        onToggleCriticalPath={setShowCriticalPath}
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'tasks' && (
                            <div className="p-4 lg:p-6 bg-white rounded-xl shadow-xs border border-gray-200" data-onboarding="tasks-section">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3" ref={toolbarMenuRef}>
                                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                                        <h2 className="text-xl font-bold">Tasks ({Math.max(allTasks.length, ganttTasks.length)})</h2>
                                        <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
                                            {[
                                                { key: 'all', label: 'All' },
                                                { key: 'pending', label: 'Open' },
                                                { key: 'completed', label: 'Done' },
                                            ].map((option) => (
                                                <button
                                                    key={option.key}
                                                    type="button"
                                                    onClick={() => setTaskFilter(option.key)}
                                                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                                                        taskFilter === option.key
                                                            ? 'bg-white text-gray-900 shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-800'
                                                    }`}
                                                    aria-pressed={taskFilter === option.key}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setToolbarMenu((current) => current === 'sort' ? null : 'sort')}
                                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-xs hover:bg-gray-50 hover:text-gray-900"
                                                title="Sort tasks"
                                                aria-label="Sort tasks"
                                                aria-expanded={toolbarMenu === 'sort'}
                                            >
                                                <Icon path="M3 6h13.5M3 12h9m-9 6h6m9-10.5 3 3m0 0 3-3m-3 3V3m0 18-3-3m3 3 3-3" className="h-4 w-4" />
                                            </button>
                                            {toolbarMenu === 'sort' && (
                                                <div className="absolute left-0 top-12 z-20 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                                                    {[
                                                        { key: 'due_date', label: 'Due Date' },
                                                        { key: 'priority', label: 'Priority' },
                                                        { key: 'name', label: 'Task Name' },
                                                    ].map((option) => (
                                                        <button
                                                            key={option.key}
                                                            type="button"
                                                            onClick={() => {
                                                                setTaskSort(option.key);
                                                                setToolbarMenu(null);
                                                            }}
                                                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-left ${
                                                                taskSort === option.key
                                                                    ? 'bg-blue-50 text-blue-700'
                                                                    : 'text-gray-700 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <span>{option.label}</span>
                                                            {taskSort === option.key && <Icon path="M5 13l4 4L19 7" className="h-4 w-4" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <PermissionGuard permission="can_edit_projects">
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setToolbarMenu((current) => current === 'settings' ? null : 'settings')}
                                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-xs hover:bg-gray-50 hover:text-gray-900"
                                                    title="Task settings"
                                                    aria-label="Task settings"
                                                    aria-expanded={toolbarMenu === 'settings'}
                                                >
                                                    <Icon path="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z" className="h-4 w-4" />
                                                </button>
                                                {toolbarMenu === 'settings' && (
                                                    <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                                                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                            Dependency scheduling
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateDependencyMode('auto')}
                                                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-left ${
                                                                projectDependencyMode === 'auto'
                                                                    ? 'bg-blue-50 text-blue-700'
                                                                    : 'text-gray-700 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <span>Auto-shift dates</span>
                                                            {projectDependencyMode === 'auto' && <Icon path="M5 13l4 4L19 7" className="h-4 w-4" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateDependencyMode('manual')}
                                                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-left ${
                                                                projectDependencyMode === 'manual'
                                                                    ? 'bg-blue-50 text-blue-700'
                                                                    : 'text-gray-700 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <span>Manual with warnings</span>
                                                            {projectDependencyMode === 'manual' && <Icon path="M5 13l4 4L19 7" className="h-4 w-4" />}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </PermissionGuard>
                                        <PermissionGuard permission="can_edit_projects">
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setToolbarMenu((current) => current === 'actions' ? null : 'actions')}
                                                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
                                                    aria-expanded={toolbarMenu === 'actions'}
                                                >
                                                    <span>Actions</span>
                                                    <Icon path="M6 9l6 6 6-6" className="h-4 w-4" />
                                                </button>
                                                {toolbarMenu === 'actions' && (
                                                    <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowPhasesModal(true);
                                                                setToolbarMenu(null);
                                                            }}
                                                            className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                                        >
                                                            Manage phases
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowMsProjectImportModal(true);
                                                                setToolbarMenu(null);
                                                            }}
                                                            className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                                        >
                                                            Import MS Project XML
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedWeatherImpact(null);
                                                                setShowWeatherImpactModal(true);
                                                                setToolbarMenu(null);
                                                            }}
                                                            className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                                        >
                                                            Weather / schedule impact
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </PermissionGuard>
                                        <PermissionGuard permission="can_create_tasks">
                                            <button onClick={() => setShowTaskModal(true)} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-full shadow-xs hover:bg-blue-700">+ New Task</button>
                                        </PermissionGuard>
                                    </div>
                                </div>
                                <TaskBulkActions
                                    selectedTasks={selectedTasks}
                                    onBulkComplete={handleBulkComplete}
                                    onBulkDelete={handleBulkDelete}
                                    onClearSelection={() => setSelectedTasks([])}
                                />
                                {tasks.length > 0 ? (
                                    <div
                                        className={`space-y-3 ${tasks.length > 7 ? 'max-h-[min(70vh,560px)] overflow-y-auto pr-1' : ''}`}
                                    >
                                        {(() => {
                                            return (
                                                <>
                                                    {projectPhases.map((phase) => {
                                                        const phaseTasks = tasks.filter((t) => t.project_phase_id === phase.id);
                                                        const rows = mergeWeatherIntoPhaseTasks(phaseTasks, weatherImpacts);
                                                        return (
                                                            <PhaseTaskSection
                                                                key={phase.id}
                                                                projectId={project.id}
                                                                phaseKey={phase.id}
                                                                phaseId={phase.id}
                                                                title={phase.name}
                                                                progressPercent={progressPercentForTasks(phaseTasks)}
                                                                onTaskDrop={handleTaskDrop}
                                                            >
                                                                {phaseTasks.length > 0 || rows.some((r) => r.kind === 'weather') ? (
                                                                    <ul className="bg-white">
                                                                        {rows.map((row) =>
                                                                            row.kind === 'weather' ? (
                                                                                <WeatherDelayMarker
                                                                                    key={`weather-${row.impact.id}-${phase.id}`}
                                                                                    impact={row.impact}
                                                                                    onClick={() => {
                                                                                        const targetImpact =
                                                                                            row.impact?.is_grouped && Array.isArray(row.impact?.source_impacts)
                                                                                                ? row.impact.source_impacts[0]
                                                                                                : row.impact;
                                                                                        setSelectedWeatherImpact(targetImpact);
                                                                                        setShowWeatherImpactModal(true);
                                                                                    }}
                                                                                />
                                                                            ) : (
                                                                                <TaskItem
                                                                                    key={row.task.id}
                                                                                    task={row.task}
                                                                                    onEdit={handleEditTask}
                                                                                    onDelete={handleDeleteTask}
                                                                                    isSelected={selectedTasks.includes(row.task.id)}
                                                                                    onSelect={handleTaskSelect}
                                                                                    onOpenPhotos={setPhotoModalTaskId}
                                                                                    onOpenDiscussion={setDiscussionModalTaskId}
                                                                                    projectPhases={projectPhases}
                                                                                    assignableContacts={assignableContactsForTasks}
                                                                                    dependencyMeta={
                                                                                        dependencyMetaByTaskId[row.task.id] || null
                                                                                    }
                                                                                    allTasks={allTasks}
                                                                                    onOpenDependencyDrawer={setDependencyDrawerTaskId}
                                                                                    onPingAssignee={handlePingAssignee}
                                                                                    onRequestAssigneeSmsConsent={handleRequestAssigneeSmsConsent}
                                                                                    pingingTaskId={pingingTaskId}
                                                                                    project={project}
                                                                                />
                                                                            )
                                                                        )}
                                                                    </ul>
                                                                ) : (
                                                                    <p className="text-sm text-gray-400 px-3 py-2 bg-white">
                                                                        No tasks in this phase.
                                                                    </p>
                                                                )}
                                                            </PhaseTaskSection>
                                                        );
                                                    })}
                                                    {taskPhaseGroups.unassigned.length > 0 && (
                                                        <PhaseTaskSection
                                                            projectId={project.id}
                                                            phaseKey="unassigned"
                                                            phaseId={null}
                                                            title="Unassigned"
                                                            progressPercent={progressPercentForTasks(taskPhaseGroups.unassigned)}
                                                            onTaskDrop={handleTaskDrop}
                                                        >
                                                            <ul className="bg-white">
                                                                {mergeWeatherIntoPhaseTasks(
                                                                    taskPhaseGroups.unassigned,
                                                                    weatherImpacts
                                                                ).map((row) =>
                                                                    row.kind === 'weather' ? (
                                                                        <WeatherDelayMarker
                                                                            key={`weather-${row.impact.id}-unassigned`}
                                                                            impact={row.impact}
                                                                            onClick={() => {
                                                                                const targetImpact =
                                                                                    row.impact?.is_grouped && Array.isArray(row.impact?.source_impacts)
                                                                                        ? row.impact.source_impacts[0]
                                                                                        : row.impact;
                                                                                setSelectedWeatherImpact(targetImpact);
                                                                                setShowWeatherImpactModal(true);
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <TaskItem
                                                                            key={row.task.id}
                                                                            task={row.task}
                                                                            onEdit={handleEditTask}
                                                                            onDelete={handleDeleteTask}
                                                                            isSelected={selectedTasks.includes(row.task.id)}
                                                                            onSelect={handleTaskSelect}
                                                                            onOpenPhotos={setPhotoModalTaskId}
                                                                            onOpenDiscussion={setDiscussionModalTaskId}
                                                                            projectPhases={projectPhases}
                                                                            assignableContacts={assignableContactsForTasks}
                                                                            dependencyMeta={
                                                                                dependencyMetaByTaskId[row.task.id] || null
                                                                            }
                                                                            allTasks={allTasks}
                                                                            onOpenDependencyDrawer={setDependencyDrawerTaskId}
                                                                            onPingAssignee={handlePingAssignee}
                                                                            onRequestAssigneeSmsConsent={handleRequestAssigneeSmsConsent}
                                                                            pingingTaskId={pingingTaskId}
                                                                            project={project}
                                                                        />
                                                                    )
                                                                )}
                                                            </ul>
                                                        </PhaseTaskSection>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                            </svg>
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No tasks yet</h3>
                                        <p className="text-gray-500 mb-4">Break down your project into manageable tasks to track progress.</p>
                                        <button 
                                            onClick={() => setShowTaskModal(true)}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                        >
                                            Add Your First Task
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'updates' && project && (
                            <div className="p-4 lg:p-6 bg-white rounded-xl shadow-xs border border-gray-200 min-h-[72vh]">
                                <ProjectCollaborationView
                                    project={project}
                                    supabaseClient={supabaseClient}
                                    currentUserId={state.user?.id}
                                    projectTasks={allTasks}
                                    initialPanel={collabPanel}
                                />
                            </div>
                        )}

                        {canViewActivityHistory && activeTab === 'activity' && (
                            <ActivityHistoryPanel
                                mode="project"
                                organizationId={project.organization_id || state.currentOrganization?.id}
                                projectId={project.id}
                            />
                        )}

                    </div>
                </div>

                {/* Sidebar hidden on Gantt, Tasks, and Stream tabs */}
                <div
                    className={
                        activeTab === 'gantt' || activeTab === 'tasks' || activeTab === 'updates'
                            ? 'hidden'
                            : 'lg:col-span-2'
                    }
                >
                    <ProjectSidebar project={project} showProjectPhases={activeTab !== 'gantt'} />
                </div>
            </div>
            {dependencyDrawerTask && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDependencyDrawerTaskId(null)}>
                    <div
                        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-gray-200 px-5 py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-xl font-semibold text-gray-900">Dependencies</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        See what this task depends on and what depends on it.
                                    </p>
                                    <p className="mt-2 ui-ellipsis-1 text-sm font-medium text-gray-500" title={dependencyDrawerTask.text}>
                                        {dependencyDrawerTask.text}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                                    onClick={() => setDependencyDrawerTaskId(null)}
                                    aria-label="Close dependencies"
                                >
                                    <Icon path="M6 18L18 6M6 6l12 12" className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-5">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
                                    <Icon path="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0z" className="h-4 w-4" />
                                    <span>Waiting On</span>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                    <div className="relative" ref={activeDependencyPicker === 'predecessor' ? dependencyPickerRef : null}>
                                        <button
                                            type="button"
                                            onClick={() => setActiveDependencyPicker((current) => current === 'predecessor' ? null : 'predecessor')}
                                            className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700"
                                        >
                                            <span className="text-base leading-none">+</span>
                                            <span>Add waiting on task</span>
                                        </button>
                                        {activeDependencyPicker === 'predecessor' && (
                                            <div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                                                <div className="p-3">
                                                    <input
                                                        type="search"
                                                        value={drawerPredecessorQuery}
                                                        onChange={(event) => setDrawerPredecessorQuery(event.target.value)}
                                                        placeholder="Search..."
                                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="max-h-72 overflow-y-auto border-t border-gray-100 px-2 py-2">
                                                    {!drawerPredecessorQuery.trim() && (
                                                        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent Tasks</p>
                                                    )}
                                                    <div className="space-y-1">
                                                        {predecessorCandidateTasks.map((task) => (
                                                            <button
                                                                key={task.id}
                                                                type="button"
                                                                onClick={async () => {
                                                                    await handleAddDependency(dependencyDrawerTask.id, task.id);
                                                                    setDrawerPredecessorQuery('');
                                                                    setActiveDependencyPicker(null);
                                                                }}
                                                                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                                            >
                                                                <span className="ui-ellipsis-1">{task.text}</span>
                                                                <span className="shrink-0 text-xs font-medium text-amber-600">Add</span>
                                                            </button>
                                                        ))}
                                                        {predecessorCandidateTasks.length === 0 && (
                                                            <p className="px-2 py-2 text-sm text-gray-400">No matching tasks.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <ul className="space-y-1">
                                        {(dependencyDrawerMeta?.predecessors || []).map((dep) => (
                                            <li key={dep.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-2 py-2 text-sm text-gray-800">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
                                                    <span className="ui-ellipsis-1">{dep.predecessorTask?.text || 'Unknown task'}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveDependency(dep.id)}
                                                    className="shrink-0 text-xs font-medium text-gray-400 hover:text-red-500"
                                                >
                                                    Remove
                                                </button>
                                            </li>
                                        ))}
                                        {(dependencyDrawerMeta?.predecessors || []).length === 0 && (
                                            <li className="text-sm text-gray-500">No tasks are currently blocking this task.</li>
                                        )}
                                    </ul>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-semibold text-rose-500">
                                    <Icon path="M15 15l6-6m0 0l-6-6m6 6H3" className="h-4 w-4" />
                                    <span>Blocking</span>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                    <div className="relative" ref={activeDependencyPicker === 'successor' ? dependencyPickerRef : null}>
                                        <button
                                            type="button"
                                            onClick={() => setActiveDependencyPicker((current) => current === 'successor' ? null : 'successor')}
                                            className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700"
                                        >
                                            <span className="text-base leading-none">+</span>
                                            <span>Add task that is blocked</span>
                                        </button>
                                        {activeDependencyPicker === 'successor' && (
                                            <div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                                                <div className="p-3">
                                                    <input
                                                        type="search"
                                                        value={drawerSuccessorQuery}
                                                        onChange={(event) => setDrawerSuccessorQuery(event.target.value)}
                                                        placeholder="Search..."
                                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="max-h-72 overflow-y-auto border-t border-gray-100 px-2 py-2">
                                                    {!drawerSuccessorQuery.trim() && (
                                                        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent Tasks</p>
                                                    )}
                                                    <div className="space-y-1">
                                                        {successorCandidateTasks.map((task) => (
                                                            <button
                                                                key={task.id}
                                                                type="button"
                                                                onClick={async () => {
                                                                    await handleAddDependency(task.id, dependencyDrawerTask.id);
                                                                    setDrawerSuccessorQuery('');
                                                                    setActiveDependencyPicker(null);
                                                                }}
                                                                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                                            >
                                                                <span className="ui-ellipsis-1">{task.text}</span>
                                                                <span className="shrink-0 text-xs font-medium text-rose-500">Add</span>
                                                            </button>
                                                        ))}
                                                        {successorCandidateTasks.length === 0 && (
                                                            <p className="px-2 py-2 text-sm text-gray-400">No matching tasks.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <ul className="space-y-1">
                                        {(dependencyDrawerMeta?.successors || []).map((dep) => (
                                            <li key={dep.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-2 py-2 text-sm text-gray-800">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400" />
                                                    <span className="ui-ellipsis-1">{dep.successorTask?.text || 'Unknown task'}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveDependency(dep.id)}
                                                    className="shrink-0 text-xs font-medium text-gray-400 hover:text-red-500"
                                                >
                                                    Remove
                                                </button>
                                            </li>
                                        ))}
                                        {(dependencyDrawerMeta?.successors || []).length === 0 && (
                                            <li className="text-sm text-gray-500">No downstream tasks are linked yet.</li>
                                        )}
                                    </ul>
                                </div>
                            </div>

                            {dependencyDrawerMeta?.warning?.startDateConflict && (
                                <button
                                    type="button"
                                    className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100"
                                    onClick={() => handleFixTaskDependencyDates(dependencyDrawerTask.id)}
                                >
                                    Auto-fix dates to satisfy dependencies
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {showTaskModal && (
                <TaskModal
                    project={project}
                    projectPhases={projectPhases}
                    onClose={() => setShowTaskModal(false)}
                    onSave={handleAddTask}
                    isLoading={isCreatingTask}
                    photoUploadProgress={createTaskPhotoUploadProgress}
                    allTasks={allTasks}
                />
            )}

            {discussionModalTaskId && project && (
                <TaskDiscussionModal
                    task={allTasks.find((t) => t.id === discussionModalTaskId)}
                    project={project}
                    onClose={() => setDiscussionModalTaskId(null)}
                />
            )}

            {photoModalTask && (
                <TaskPhotosModal
                    task={photoModalTask}
                    onClose={() => setPhotoModalTaskId(null)}
                    onAddPhotos={handleAddTaskPhotos}
                    onUpdatePhoto={handleUpdateTaskPhoto}
                    onDeletePhoto={handleDeleteTaskPhoto}
                    onMovePhoto={handleMoveTaskPhoto}
                    canManagePhotos={canManageTaskPhotos({
                        project,
                        userId: state.user?.id,
                        userContactId: state.userContactId,
                        userRoleName: state.userRole?.name,
                        canEditTasks: state.userRole?.permissions?.can_edit_tasks === true,
                        task: photoModalTask,
                    })}
                    photoActionBusy={photoActionTaskIds[photoModalTask.id] === true}
                    photoUploadProgress={
                        taskPhotoUploadProgress?.taskId === photoModalTask.id
                            ? {
                                  current: taskPhotoUploadProgress.current,
                                  total: taskPhotoUploadProgress.total,
                              }
                            : null
                    }
                />
            )}

            {showPhasesModal && project && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="phases-modal-title"
                    onClick={() => {
                        setShowPhasesModal(false);
                        refreshProjectPhases();
                    }}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
                            <h2 id="phases-modal-title" className="text-lg font-bold text-gray-900">
                                Manage phases
                            </h2>
                            <button
                                type="button"
                                className="text-sm font-medium text-gray-600 hover:text-gray-900"
                                onClick={() => {
                                    setShowPhasesModal(false);
                                    refreshProjectPhases();
                                }}
                            >
                                Close
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 min-h-[min(480px,50vh)] max-h-[calc(90vh-5rem)]">
                            <BuildPath project={project} />
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDeleteTask}
                title="Delete Task"
                message={`Are you sure you want to delete "${taskToDelete?.text}"? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
            />
        </div>
    );
}
export default ProjectDetailsView;