import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import ProjectSidebar from '../components/ProjectSidebar';
import ProjectModal from '../components/ProjectModal';
import ShareModal from '../components/ShareModal';
import SaveAsTemplateModal from '../components/SaveAsTemplateModal';
import ConfirmDialog from '../components/ConfirmDialog';
import TaskBulkActions from '../components/TaskBulkActions';
import ProjectCollaborationView from '../components/collaboration/ProjectCollaborationView';
import Avatar from '../components/Avatar';
import PermissionGuard from '../components/PermissionGuard';
import ActivityHistoryPanel from '../components/ActivityHistoryPanel';
import WeatherImpactModal from '../components/WeatherImpactModal';
import WeatherDelayMarker from '../components/WeatherDelayMarker';
import { mergeWeatherIntoPhaseTasks } from '../utils/weatherTaskTimeline';
import { useTaskShortcuts } from '../hooks/useKeyboardShortcuts';
import { handleApiError } from '../utils/errorHandling';
import { parseRecurrence } from '../utils/recurrenceService';
import {
    logTaskCreated,
    logTaskCompleted,
    logTaskUncompleted,
    logTaskUpdated,
    logTaskDeleted,
    logTaskAssigneeEmailSent,
} from '../utils/activityLogger';
import { sendTaskAssignmentEmail } from '../utils/emailNotifications';
import { getCriticalPathTaskIds } from '../utils/criticalPath';
import { orderTasksForGantt } from '../utils/ganttOrdering';
import { buildTaskPhotoDraft, canManageTaskPhotos, revokeTaskPhotoDraftUrls, sortTaskPhotos } from '../utils/taskPhotoUtils';
import GanttChart from '../components/GanttChart';
import ProgressReportModal from '../components/ProgressReportModal';
import MsProjectImportModal from '../components/MsProjectImportModal';
import { useStreamUnread } from '../hooks/useStreamUnread';
import { useIssuesUnread } from '../hooks/useIssuesUnread';

function ProjectDetailsView({ routeTab = 'tasks', onTabChange = null }) {
    const { state, dispatch } = useAppContext();
    const { addToast } = useToast();
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [isCreatingTask, setIsCreatingTask] = useState(false);
    const [pingingTaskId, setPingingTaskId] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [taskToDelete, setTaskToDelete] = useState(null);
    const [selectedTasks, setSelectedTasks] = useState([]);
    const [taskFilter, setTaskFilter] = useState('all'); // all, completed, pending
    const [taskSort, setTaskSort] = useState('due_date'); // due_date, priority
    const [activeTab, setActiveTab] = useState('tasks'); // tasks, gantt, updates, activity
    const [showShare, setShowShare] = useState(false);
    const [showProgressReportModal, setShowProgressReportModal] = useState(false);
    const [showMsProjectImportModal, setShowMsProjectImportModal] = useState(false);
    const [showWeatherImpactModal, setShowWeatherImpactModal] = useState(false);
    const [selectedWeatherImpact, setSelectedWeatherImpact] = useState(null);
    const [projectRefreshNonce, setProjectRefreshNonce] = useState(0);
    const [weatherImpacts, setWeatherImpacts] = useState([]);
    const [taskDependencies, setTaskDependencies] = useState([]);
    const [projectDependencyMode, setProjectDependencyMode] = useState('auto');
    const [showSaveAsTemplateModal, setShowSaveAsTemplateModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [isSavingProject, setIsSavingProject] = useState(false);
    const [projectPhases, setProjectPhases] = useState([]);
    const [fieldIssuesCount, setFieldIssuesCount] = useState(0);
    const [photoModalTaskId, setPhotoModalTaskId] = useState(null);
    const [discussionModalTaskId, setDiscussionModalTaskId] = useState(null);
    const [photoActionTaskIds, setPhotoActionTaskIds] = useState({});
    const [taskPhotoUploadProgress, setTaskPhotoUploadProgress] = useState(null);
    const [ganttTasks, setGanttTasks] = useState([]);
    const [ganttDependencies, setGanttDependencies] = useState([]);
    const [ganttCriticalCount, setGanttCriticalCount] = useState(0);
    const [ganttCriticalIds, setGanttCriticalIds] = useState([]);
    const [showCriticalPath, setShowCriticalPath] = useState(true);
    const [projectTasksList, setProjectTasksList] = useState([]);

    const project = state.projects.find((p) => p.id === state.selectedProjectId);
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
    const allTasksFromState = (state.tasks || []).filter((t) => t.project_id === state.selectedProjectId);
    const allTasks = projectTasksList.length > 0 ? projectTasksList : allTasksFromState;
    const allTaskIdsKey = useMemo(
        () => allTasks.map((task) => task.id).sort().join('|'),
        [allTasks]
    );

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

    const routeToTabMap = {
        tasks: 'tasks',
        gantt: 'gantt',
        updates: 'updates',
        'field-issues': 'updates',
        fieldIssues: 'updates',
        stream: 'updates',
        activity: 'activity',
    };
    const tabToRouteMap = {
        tasks: 'tasks',
        gantt: 'gantt',
        updates: 'updates',
        activity: 'activity',
    };
    const collaborationPanel =
        routeTab === 'field-issues' || routeTab === 'fieldIssues' ? 'issues' : 'stream';
    const setTabAndRoute = (nextTab) => {
        setActiveTab(nextTab);
        if (onTabChange) {
            const nextRouteTab = tabToRouteMap[nextTab] || 'tasks';
            onTabChange(nextRouteTab);
        }
    };

    useEffect(() => {
        const mapped = routeToTabMap[routeTab] || 'tasks';
        setActiveTab(mapped);
    }, [routeTab]);

    useEffect(() => {
        setProjectDependencyMode(project?.dependency_scheduling_mode || 'auto');
    }, [project?.dependency_scheduling_mode]);

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

    const canViewActivityHistory = state.userRole?.permissions?.can_view_activity_history === true;
    useEffect(() => {
        if (!canViewActivityHistory && activeTab === 'activity') {
            setTabAndRoute('tasks');
        }
    }, [canViewActivityHistory, activeTab]);

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

    // Fetch project tasks and field issues count in parallel (avoids waterfall)
    useEffect(() => {
        if (!state.selectedProjectId) {
            setProjectTasksList([]);
            setFieldIssuesCount(0);
            return;
        }
        setProjectTasksList([]);
        const ac = new AbortController();
        (async () => {
            try {
                const [tasksResult, fieldIssuesResult] = await Promise.all([
                    supabaseClient
                        .from('tasks')
                        .select('*, contacts!fk_tasks_assignee_id(name, avatar_url, email, phone), task_photos(*)')
                        .eq('project_id', state.selectedProjectId)
                        .order('due_date', { ascending: true, nullsFirst: false })
                        .order('id', { ascending: true }),
                    supabaseClient
                        .from('project_issues')
                        .select('id', { count: 'exact', head: true })
                        .eq('project_id', state.selectedProjectId)
                ]);
                if (ac.signal.aborted) return;
                const { data: tasks, error } = tasksResult;
                if (error) {
                    console.error('Error loading project tasks:', error);
                    return;
                }
                const list = tasks || [];
                const phones = new Set();
                for (const t of list) {
                    const n = normalizeAssigneePhone(String(t.contacts?.phone || '').trim(), {
                        defaultRegion: 'US',
                    });
                    if (n.isValid && n.e164) phones.add(n.e164);
                }
                let enriched = list;
                if (phones.size > 0) {
                    const { data: consentRows } = await supabaseClient
                        .from('sms_phone_consent')
                        .select('phone_e164,status')
                        .in('phone_e164', [...phones]);
                    const cmap = new Map((consentRows || []).map((r) => [r.phone_e164, r.status]));
                    enriched = list.map((t) => {
                        const n = normalizeAssigneePhone(String(t.contacts?.phone || '').trim(), {
                            defaultRegion: 'US',
                        });
                        const assignee_sms_consent =
                            n.isValid && n.e164 ? cmap.get(n.e164) || 'none' : null;
                        return { ...t, assignee_sms_consent };
                    });
                } else {
                    enriched = list.map((t) => ({ ...t, assignee_sms_consent: null }));
                }
                if (!ac.signal.aborted) {
                    setProjectTasksList(enriched);
                    setFieldIssuesCount(fieldIssuesResult.count ?? 0);
                }
                const otherTasks = (state.tasks || []).filter(
                  (t) => String(t.project_id) !== String(state.selectedProjectId),
                );
                dispatch({ type: 'SET_TASKS', payload: [...otherTasks, ...enriched] });
            } catch (e) {
                if (!ac.signal.aborted) console.error('Error loading project tasks:', e);
            }
        })();
        return () => ac.abort();
    }, [state.selectedProjectId, projectRefreshNonce]);

    // Gantt tab: fetch tasks and dependencies in parallel (no waterfall)
    useEffect(() => {
        if (activeTab !== 'gantt' || !state.selectedProjectId) return;
        const ac = new AbortController();
        (async () => {
            try {
                const projectId = state.selectedProjectId;
                const [tasksResult, depsResult] = await Promise.all([
                    supabaseClient
                        .from('tasks')
                        .select('id, text, start_date, due_date, duration_days, is_milestone, project_id, completed, parent_task_id, assignee_id, contacts!fk_tasks_assignee_id(name, email, phone)')
                        .eq('project_id', projectId)
                        .order('start_date', { ascending: true, nullsFirst: true }),
                    supabaseClient
                        .from('task_dependencies_by_project')
                        .select('id, task_id, successor_task_id, dependency_type, lag_days')
                        .eq('project_id', projectId)
                ]);
                if (ac.signal.aborted) return;
                const { data: taskRows, error: taskErr } = tasksResult;
                const { data: depRows, error: depErr } = depsResult;
                if (taskErr) {
                    console.error('Gantt: tasks fetch error', taskErr);
                    setGanttTasks([]);
                    setGanttDependencies([]);
                    setGanttCriticalCount(0);
                    setGanttCriticalIds([]);
                    return;
                }
                if (depErr) {
                    console.error('Gantt: task_dependencies fetch error', depErr);
                    setGanttDependencies([]);
                }
                const tasks = taskRows || [];
                const deps = depRows || [];
                if (!ac.signal.aborted) {
                    const ordered = orderTasksForGantt(tasks);
                    setGanttTasks(ordered);
                    setGanttDependencies(deps);
                    const criticalIds = getCriticalPathTaskIds(tasks, deps);
                    setGanttCriticalCount(criticalIds.length);
                    setGanttCriticalIds(criticalIds);
                }
            } catch (e) {
                if (!ac.signal.aborted) console.error('Gantt fetch error', e);
            }
        })();
        return () => ac.abort();
    }, [activeTab, state.selectedProjectId, projectRefreshNonce]);

    useEffect(() => {
        if (!state.selectedProjectId) {
            setTaskDependencies([]);
            return;
        }
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
            setTaskDependencies(filtered);
        })();
        return () => ac.abort();
    }, [state.selectedProjectId, allTaskIdsKey]);
    
    // Get all project crew members (any contact linked to this project)
    const projectCrewMembers = state.contacts.filter(contact => 
        contact.project_contacts && contact.project_contacts.some(pc => pc.project_id === project?.id)
    );
    
    // Ensure owner is always included in crew members
    const ownerContactId = project?.created_by_user_id
        ? (state.profiles?.find(p => p.id === project.created_by_user_id)?.contact_id || null)
        : null;
    
    const ownerContact = ownerContactId
        ? state.contacts.find(c => c.id === ownerContactId)
        : null;
    
    // Combine project crew with owner (if owner not already included)
    const crewMembers = ownerContact && !projectCrewMembers.some(c => c.id === ownerContact.id)
        ? [ownerContact, ...projectCrewMembers]
        : projectCrewMembers;
    
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
                case 'priority':
                    const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
                    return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
                case 'due_date':
                default:
                    if (!a.due_date && !b.due_date) return 0;
                    if (!a.due_date) return 1;
                    if (!b.due_date) return -1;
                    return new Date(a.due_date) - new Date(b.due_date);
            }
        });
    }, [filteredTasks, taskSort]);
    const taskPhaseGroups = {
        unassigned: tasks.filter((task) => !task.project_phase_id),
    };

    const progressPercentForTasks = (taskList) => {
        if (!taskList.length) return 0;
        const done = taskList.filter((task) => task.completed).length;
        return Math.round((100 * done) / taskList.length);
    };

    const projectActivity = (state.activityLog || []).filter((activity) => {
        const sameProject = activity.project_id && String(activity.project_id) === String(project?.id);
        const metadataProject = activity.metadata?.project_id && String(activity.metadata.project_id) === String(project?.id);
        return sameProject || metadataProject;
    }).slice(0, 30);
    
    if (!project) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">No Project Selected</h2>
                    <p className="text-gray-500 mb-4">Please select a project from the dashboard to view its details.</p>
                    <button 
                        onClick={() => dispatch({ type: 'SET_VIEW', payload: 'Dashboard' })}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const handleSaveProject = async (projectData) => {
        if (!project) return;
        setIsSavingProject(true);
        try {
            const {
                selectedContacts = [],
                emailAddresses = [],
                ...projectFields
            } = projectData || {};

            const { data: updatedProject, error: projectError } = await supabaseClient
                .from('projects')
                .update(projectFields)
                .eq('id', project.id)
                .select()
                .single();

            if (projectError) throw projectError;

            const orgId = project.organization_id || state.currentOrganization?.id;

            if (orgId && Array.isArray(selectedContacts) && selectedContacts.length > 0) {
                const projectContactsRows = selectedContacts.map((contactId) => ({
                    project_id: project.id,
                    contact_id: contactId,
                    organization_id: orgId,
                }));
                const { error: contactsError } = await supabaseClient
                    .from('project_contacts')
                    .upsert(projectContactsRows, {
                        onConflict: 'project_id,contact_id',
                        ignoreDuplicates: true,
                    });
                if (contactsError && contactsError.code !== '23505') {
                    addToast('Project updated, but some team links failed to save.', 'warning');
                }
            }

            if (orgId && Array.isArray(emailAddresses) && emailAddresses.length > 0) {
                for (const rawEmail of emailAddresses) {
                    const email = String(rawEmail || '').trim().toLowerCase();
                    if (!email) continue;

                    const { data: existingContact } = await supabaseClient
                        .from('contacts')
                        .select('id')
                        .eq('organization_id', orgId)
                        .eq('email', email)
                        .maybeSingle();

                    let contactId = existingContact?.id || null;
                    if (!contactId) {
                        const { data: newContact, error: contactInsertError } = await supabaseClient
                            .from('contacts')
                            .insert({
                                organization_id: orgId,
                                name: email.split('@')[0],
                                email,
                                type: 'Team',
                                role: 'Team Member',
                                status: 'Available',
                            })
                            .select()
                            .single();
                        if (contactInsertError) {
                            addToast(`Could not create contact ${email}.`, 'warning');
                            continue;
                        }
                        contactId = newContact.id;
                        dispatch({ type: 'ADD_CONTACT', payload: newContact });
                    }

                    const { error: linkError } = await supabaseClient
                        .from('project_contacts')
                        .upsert({
                            project_id: project.id,
                            contact_id: contactId,
                            organization_id: orgId,
                        }, { onConflict: 'project_id,contact_id', ignoreDuplicates: true });
                    if (linkError && linkError.code !== '23505') {
                        addToast(`Could not add ${email} to project crew.`, 'warning');
                    }
                }
            }

            dispatch({ type: 'UPDATE_PROJECT', payload: updatedProject });
            addToast('Project updated successfully!', 'success');
            setShowProjectModal(false);
        } catch (error) {
            addToast('Error updating project: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            setIsSavingProject(false);
        }
    };

    const handleRequestAssigneeSmsConsent = async (task, { forceResend = false } = {}) => {
        const rawPhone = String(task.contacts?.phone || '').trim();
        const phoneNorm = normalizeAssigneePhone(rawPhone, { defaultRegion: 'US' });
        if (!phoneNorm.isValid) {
            addToast('No valid phone on file for this assignee.', 'warning');
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
                    recipientPhone: phoneNorm.e164,
                    organizationId: project.organization_id,
                    organizationName: organizationDisplayName,
                    forceResend: Boolean(forceResend),
                },
            });
            const sent = !error && data?.sent;
            if (sent) {
                addToast('Consent SMS sent. Assignee must reply YES before task SMS goes out.', 'success');
                setProjectTasksList((prev) =>
                    prev.map((t) =>
                        t.id === task.id ? { ...t, assignee_sms_consent: 'pending' } : t,
                    ),
                );
                const otherTasks = (state.tasks || []).filter(
                    (x) => String(x.project_id) !== String(state.selectedProjectId),
                );
                const merged = (state.tasks || [])
                    .filter((x) => String(x.project_id) === String(state.selectedProjectId))
                    .map((t) => (t.id === task.id ? { ...t, assignee_sms_consent: 'pending' } : t));
                dispatch({ type: 'SET_TASKS', payload: [...otherTasks, ...merged] });
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

    const handlePingAssignee = async (task, channel) => {
        const email = String(task.contacts?.email || '').trim().toLowerCase();
        const emailOk = email && email.includes('@');
        const rawPhone = String(task.contacts?.phone || '').trim();
        const phoneNorm = normalizeAssigneePhone(rawPhone, { defaultRegion: 'US' });
        const phoneOk = phoneNorm.isValid;

        if (channel === 'email' && !emailOk) {
            addToast('No email on file for this assignee.', 'warning');
            return;
        }
        if (channel === 'sms' && !phoneOk) {
            addToast('No valid phone on file for this assignee.', 'warning');
            return;
        }
        if (channel === 'sms' && task.assignee_sms_consent !== 'confirmed') {
            addToast('SMS ping requires consent — use “SMS consent” first.', 'warning');
            return;
        }

        const pingAction = channel === 'email' ? 'assignee_ping_email' : 'assignee_ping_sms';
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
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

        setPingingTaskId(task.id);
        try {
            const senderName =
                state.user?.user_metadata?.full_name || state.user?.email || 'SiteWeave user';

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
                        recipientEmail: emailOk ? email : null,
                        recipientPhone: phoneOk ? phoneNorm.e164 : null,
                        deliveryChannels: [channel],
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

            const res = {
                success: !manualReminderError && Boolean(manualReminderResult?.success),
                error: manualReminderError?.message || manualReminderResult?.error || null,
                channels: manualReminderResult?.channels || {},
            };
            const ch = res.channels || {};
            const pingDelivered =
                channel === 'email' ? Boolean(ch.email) : channel === 'sms' ? Boolean(ch.sms) : false;

            await logTaskAssigneeEmailSent({
                task,
                user: state.user,
                projectId: project.id,
                kind: 'ping',
                recipientEmail: channel === 'email' ? email : phoneNorm.e164,
                success: pingDelivered,
                errorMessage: pingDelivered ? null : res.error,
                channel,
            });
            if (res.success && pingDelivered) {
                if (channel === 'email') {
                    addToast('Reminder sent by email.', 'success');
                } else {
                    const sid = manualReminderResult?.sms?.sid;
                    addToast(sid ? `Reminder sent by SMS (SID: ${sid}).` : 'Reminder sent by SMS.', 'success');
                }
            } else if (res.success && !pingDelivered) {
                addToast(
                    channel === 'sms'
                        ? res.error || 'SMS was not sent.'
                        : res.error || 'Email was not sent.',
                    'warning',
                );
            } else {
                addToast(res.error || 'Could not send reminder.', 'error');
            }
        } catch (e) {
            addToast(handleApiError(e, 'Could not send ping'), 'error');
        } finally {
            setPingingTaskId(null);
        }
    };

    const handleAddTask = async (taskData) => {
        setIsCreatingTask(true);
        
        try {
            const predecessorTaskIds = Array.isArray(taskData.predecessor_task_ids)
                ? [...new Set(taskData.predecessor_task_ids.filter(Boolean))]
                : [];
            const sendAssignmentRequested = taskData.send_assignment_email === true;
            const payload = { ...taskData };
            delete payload.predecessor_task_ids;
            delete payload.send_assignment_email;
            const normalizedPercent = Math.max(
                0,
                Math.min(100, Number(payload.percent_complete ?? (payload.completed ? 100 : 0)) || 0),
            );
            payload.percent_complete = normalizedPercent;
            payload.completed = normalizedPercent >= 100;
            const assigneeEmailInput = String(payload.assignee_email || '').trim().toLowerCase();
            delete payload.assignee_email;
            const assigneePhoneRaw = String(payload.assignee_phone || '').trim();
            delete payload.assignee_phone;
            payload.organization_id = payload.organization_id || project.organization_id;
            payload.notify_assignee_email = Boolean(sendAssignmentRequested);

            if (!payload.assignee_id && assigneeEmailInput) {
                let resolvedContactId = null;
                const { data: existingContact, error: existingContactError } = await supabaseClient
                    .from('contacts')
                    .select('id')
                    .eq('organization_id', project.organization_id)
                    .ilike('email', assigneeEmailInput)
                    .limit(1)
                    .maybeSingle();
                if (existingContactError) {
                    throw existingContactError;
                }

                if (existingContact?.id) {
                    resolvedContactId = existingContact.id;
                } else {
                    const { data: createdRows, error: createdContactError } = await supabaseClient
                        .from('contacts')
                        .insert({
                            organization_id: project.organization_id,
                            name: assigneeEmailInput.split('@')[0] || assigneeEmailInput,
                            email: assigneeEmailInput,
                            type: 'Team',
                            role: 'External Assignee',
                            status: 'Available',
                        })
                        .select('id')
                        .limit(1);
                    if (createdContactError) {
                        throw createdContactError;
                    }
                    resolvedContactId = createdRows?.[0]?.id ?? null;
                    if (!resolvedContactId) {
                        throw new Error(
                            'Contact was saved but could not be read back. Check permissions or try again.',
                        );
                    }
                }

                if (resolvedContactId) {
                    const { error: linkError } = await supabaseClient
                        .from('project_contacts')
                        .upsert({
                            project_id: project.id,
                            contact_id: resolvedContactId,
                            organization_id: project.organization_id,
                        }, {
                            onConflict: 'project_id,contact_id',
                            ignoreDuplicates: true,
                        });
                    if (linkError && linkError.code !== '23505') {
                        throw linkError;
                    }
                    payload.assignee_id = resolvedContactId;
                }
            }

            if (payload.assignee_id && assigneePhoneRaw) {
                const { e164, isValid } = normalizeAssigneePhone(assigneePhoneRaw, { defaultRegion: 'US' });
                if (isValid && e164) {
                    const { error: phonePatchError } = await supabaseClient
                        .from('contacts')
                        .update({ phone: e164 })
                        .eq('id', payload.assignee_id)
                        .eq('organization_id', project.organization_id);
                    if (phonePatchError) {
                        throw phonePatchError;
                    }
                } else {
                    addToast('That phone number is not valid. Task was created without that phone on the assignee.', 'warning');
                }
            }

            if (!payload.assignee_id && assigneePhoneRaw) {
                const { e164, isValid } = normalizeAssigneePhone(assigneePhoneRaw, { defaultRegion: 'US' });
                if (!isValid || !e164) {
                    addToast('That phone number is not valid. Task was created without that assignee.', 'warning');
                } else {
                    const last4 = e164.replace(/\D/g, '').slice(-4);
                    const { data: phoneRows, error: existingPhoneError } = await supabaseClient
                        .from('contacts')
                        .select('id')
                        .eq('organization_id', project.organization_id)
                        .eq('phone', e164)
                        .limit(1);
                    if (existingPhoneError) {
                        throw existingPhoneError;
                    }
                    let resolvedPhoneContactId = phoneRows?.[0]?.id ?? null;
                    if (!resolvedPhoneContactId) {
                        const { data: createdPhoneRows, error: createdPhoneContactError } = await supabaseClient
                            .from('contacts')
                            .insert({
                                organization_id: project.organization_id,
                                name: `Assignee (${last4})`,
                                phone: e164,
                                type: 'Team',
                                role: 'External Assignee',
                                status: 'Available',
                            })
                            .select('id')
                            .limit(1);
                        if (createdPhoneContactError) {
                            throw createdPhoneContactError;
                        }
                        resolvedPhoneContactId = createdPhoneRows?.[0]?.id ?? null;
                        if (!resolvedPhoneContactId) {
                            throw new Error(
                                'Contact was saved but could not be read back. Check permissions or try again.',
                            );
                        }
                    }
                    if (resolvedPhoneContactId) {
                        const { error: phoneLinkError } = await supabaseClient
                            .from('project_contacts')
                            .upsert({
                                project_id: project.id,
                                contact_id: resolvedPhoneContactId,
                                organization_id: project.organization_id,
                            }, {
                                onConflict: 'project_id,contact_id',
                                ignoreDuplicates: true,
                            });
                        if (phoneLinkError && phoneLinkError.code !== '23505') {
                            throw phoneLinkError;
                        }
                        payload.assignee_id = resolvedPhoneContactId;
                    }
                }
            }

            // Ensure assignee_id is valid before inserting
            if (payload.assignee_id) {
                // Verify the contact exists
                const { data: contact, error: contactError } = await supabaseClient
                    .from('contacts')
                    .select('id, email, name')
                    .eq('id', payload.assignee_id)
                    .single();
                
                if (contactError || !contact) {
                    console.warn('Assignee contact not found, setting to null');
                    payload.assignee_id = null;
                }
            }
            
            // Parse workflow_steps if it's a string (for JSONB storage)
            if (payload.workflow_steps && typeof payload.workflow_steps === 'string') {
                try {
                    payload.workflow_steps = JSON.parse(payload.workflow_steps);
                } catch (e) {
                    console.error('Error parsing workflow_steps:', e);
                    payload.workflow_steps = null;
                }
            }
            
            const { data, error } = await supabaseClient
                .from('tasks')
                .insert(payload)
                .select('*, contacts!fk_tasks_assignee_id(name, avatar_url, email, phone), task_photos(*)')
                .single();
            if (error) {
                // Provide more specific error message for foreign key violations
                if (error.message?.includes('foreign key constraint')) {
                    addToast('Cannot assign task: Selected assignee is not valid. Task created without assignee.', 'warning');
                    // Retry without assignee
                    const taskDataWithoutAssignee = { ...payload, assignee_id: null, notify_assignee_email: false };
                    const { data: retryData, error: retryError } = await supabaseClient
                        .from('tasks')
                        .insert(taskDataWithoutAssignee)
                        .select('*, contacts!fk_tasks_assignee_id(name, avatar_url, email, phone), task_photos(*)')
                        .single();
                    if (!retryError && retryData) {
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
                                setGanttDependencies((prev) => [...prev, ...insertedDeps]);
                            }
                        }
                        dispatch({ type: 'ADD_TASK', payload: retryData });
                        setProjectTasksList(prev => [...prev, retryData]);
                        addToast('Task added successfully (without assignee)', 'success');
                        setShowTaskModal(false);
                        logTaskCreated(retryData, state.user, project.id);
                        return;
                    }
                }
                throw error;
            }

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
                    setGanttDependencies((prev) => [...prev, ...insertedDeps]);
                }
            }
            
            dispatch({ type: 'ADD_TASK', payload: data });
            setProjectTasksList(prev => [...prev, data]);
            addToast('Task added successfully!', 'success');
            setShowTaskModal(false);
            
            // Log activity
            logTaskCreated(data, state.user, project.id);

            if (sendAssignmentRequested && data.assignee_id) {
                const assigneeEmail = data.contacts?.email?.trim();
                const assignerName =
                    state.user?.user_metadata?.full_name || state.user?.email || 'SiteWeave user';
                if (assigneeEmail && assigneeEmail.includes('@')) {
                    const taskDetails = {
                        title: data.text,
                        description: data.text,
                        dueDate: data.due_date,
                        priority: data.priority,
                    };
                    const projectDetails = { name: project.name, address: project.address };
                    const res = await sendTaskAssignmentEmail(
                        assigneeEmail,
                        taskDetails,
                        projectDetails,
                        assignerName,
                    );
                    await logTaskAssigneeEmailSent({
                        task: data,
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
                        addToast('Task saved, but assignment email failed: ' + (res.error || 'Unknown error'), 'warning');
                    }
                } else {
                    await logTaskAssigneeEmailSent({
                        task: data,
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
            addToast(handleApiError(error, 'Could not add task'), 'error');
        } finally {
            setIsCreatingTask(false);
        }
    };
    
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

        let resolvedContactId = null;

        if (assigneeEmailInput) {
            const { data: existingContact, error: existingContactError } = await supabaseClient
                .from('contacts')
                .select('id')
                .eq('organization_id', project.organization_id)
                .ilike('email', assigneeEmailInput)
                .limit(1)
                .maybeSingle();
            if (existingContactError) {
                addToast('Error updating task: ' + existingContactError.message, 'error');
                return;
            }

            if (existingContact?.id) {
                resolvedContactId = existingContact.id;
            } else {
                const { data: createdRows, error: createdContactError } = await supabaseClient
                    .from('contacts')
                    .insert({
                        organization_id: project.organization_id,
                        name: assigneeEmailInput.split('@')[0] || assigneeEmailInput,
                        email: assigneeEmailInput,
                        type: 'Team',
                        role: 'External Assignee',
                        status: 'Available',
                    })
                    .select('id')
                    .limit(1);
                if (createdContactError) {
                    addToast('Error updating task: ' + createdContactError.message, 'error');
                    return;
                }
                resolvedContactId = createdRows?.[0]?.id ?? null;
                if (!resolvedContactId) {
                    addToast(
                        'Error updating task: Contact was saved but could not be read back. Check permissions or try again.',
                        'error',
                    );
                    return;
                }
            }

            if (resolvedContactId) {
                const { error: linkError } = await supabaseClient
                    .from('project_contacts')
                    .upsert({
                        project_id: project.id,
                        contact_id: resolvedContactId,
                        organization_id: project.organization_id,
                    }, {
                        onConflict: 'project_id,contact_id',
                        ignoreDuplicates: true,
                    });
                if (linkError && linkError.code !== '23505') {
                    addToast('Error updating task: ' + linkError.message, 'error');
                    return;
                }
            }
        }

        if (resolvedContactId && assigneePhoneRaw) {
            const { e164, isValid } = normalizeAssigneePhone(assigneePhoneRaw, { defaultRegion: 'US' });
            if (isValid && e164) {
                const { error: phonePatchError } = await supabaseClient
                    .from('contacts')
                    .update({ phone: e164 })
                    .eq('id', resolvedContactId)
                    .eq('organization_id', project.organization_id);
                if (phonePatchError) {
                    addToast('Error updating task: ' + phonePatchError.message, 'error');
                    return;
                }
            } else {
                addToast('That phone number is not valid. Assignee phone was not updated.', 'warning');
            }
        }

        if (!resolvedContactId && assigneePhoneRaw) {
            const { e164, isValid } = normalizeAssigneePhone(assigneePhoneRaw, { defaultRegion: 'US' });
            if (!isValid || !e164) {
                addToast('That phone number is not valid. Assignee was not updated.', 'warning');
            } else {
                const last4 = e164.replace(/\D/g, '').slice(-4);
                const { data: phoneRows, error: existingPhoneError } = await supabaseClient
                    .from('contacts')
                    .select('id')
                    .eq('organization_id', project.organization_id)
                    .eq('phone', e164)
                    .limit(1);
                if (existingPhoneError) {
                    addToast('Error updating task: ' + existingPhoneError.message, 'error');
                    return;
                }

                let resolvedPhoneContactId = phoneRows?.[0]?.id ?? null;
                if (!resolvedPhoneContactId) {
                    const { data: createdPhoneRows, error: createdPhoneContactError } = await supabaseClient
                        .from('contacts')
                        .insert({
                            organization_id: project.organization_id,
                            name: `Assignee (${last4})`,
                            phone: e164,
                            type: 'Team',
                            role: 'External Assignee',
                            status: 'Available',
                        })
                        .select('id')
                        .limit(1);
                    if (createdPhoneContactError) {
                        addToast('Error updating task: ' + createdPhoneContactError.message, 'error');
                        return;
                    }
                    resolvedPhoneContactId = createdPhoneRows?.[0]?.id ?? null;
                    if (!resolvedPhoneContactId) {
                        addToast(
                            'Error updating task: Contact was saved but could not be read back. Check permissions or try again.',
                            'error',
                        );
                        return;
                    }
                }

                if (resolvedPhoneContactId) {
                    const { error: phoneLinkError } = await supabaseClient
                        .from('project_contacts')
                        .upsert({
                            project_id: project.id,
                            contact_id: resolvedPhoneContactId,
                            organization_id: project.organization_id,
                        }, {
                            onConflict: 'project_id,contact_id',
                            ignoreDuplicates: true,
                        });
                    if (phoneLinkError && phoneLinkError.code !== '23505') {
                        addToast('Error updating task: ' + phoneLinkError.message, 'error');
                        return;
                    }
                    resolvedContactId = resolvedPhoneContactId;
                }
            }
        }

        if (resolvedContactId) {
            payload.assignee_id = resolvedContactId;
        }

        if (Object.prototype.hasOwnProperty.call(payload, 'percent_complete')) {
            const normalizedPercent = Math.max(0, Math.min(100, Number(payload.percent_complete) || 0));
            payload.percent_complete = normalizedPercent;
            payload.completed = normalizedPercent >= 100;
        } else if (Object.prototype.hasOwnProperty.call(payload, 'completed')) {
            payload.percent_complete = payload.completed ? 100 : 0;
        }
        const { error } = await supabaseClient.from('tasks').update(payload).eq('id', taskId);
        if (error) {
            addToast('Error updating task: ' + error.message, 'error');
        } else {
            const baseTask = state.tasks.find((t) => t.id === taskId) || prev;
            const shouldRefetchTaskRow =
                Boolean(assigneeEmailInput || assigneePhoneRaw) ||
                (Object.prototype.hasOwnProperty.call(payload, 'assignee_id') &&
                    payload.assignee_id !== prev?.assignee_id);

            let updatedTask = { ...baseTask, ...payload };
            if (shouldRefetchTaskRow) {
                const { data: fresh, error: freshErr } = await supabaseClient
                    .from('tasks')
                    .select('*, contacts!fk_tasks_assignee_id(name, avatar_url, email, phone), task_photos(*)')
                    .eq('id', taskId)
                    .maybeSingle();
                if (!freshErr && fresh) {
                    updatedTask = { ...updatedTask, ...fresh };
                }
            }
            dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
            setProjectTasksList((p) => p.map((t) => (t.id === taskId ? { ...t, ...updatedTask } : t)));
            addToast('Task updated successfully!', 'success');
            const wasPrevComplete = prev
                ? Boolean(prev.completed) || (Number(prev.percent_complete ?? 0) || 0) >= 100
                : false;
            const nowComplete =
                Boolean(updatedTask.completed) || (Number(updatedTask.percent_complete ?? 0) || 0) >= 100;
            const transitionToComplete = Boolean(prev) && nowComplete && !wasPrevComplete;
            const transitionFromComplete = Boolean(prev) && !nowComplete && wasPrevComplete;

            if (prev && project && state.user) {
                const changes = {};
                Object.keys(payload).forEach((key) => {
                    if (prev[key] !== payload[key]) changes[key] = payload[key];
                });
                if (transitionToComplete || transitionFromComplete) {
                    delete changes.completed;
                    delete changes.percent_complete;
                }
                if (Object.keys(changes).length > 0) {
                    logTaskUpdated(
                        { ...prev, ...payload, organization_id: prev.organization_id ?? project.organization_id },
                        state.user,
                        project.id,
                        changes
                    );
                }
            }

            if (transitionToComplete && prev && project && state.user) {
                logTaskCompleted(
                    { ...prev, ...payload, completed: true, organization_id: prev.organization_id ?? project.organization_id },
                    state.user,
                    project.id
                );
            } else if (transitionFromComplete && prev && project && state.user) {
                logTaskUncompleted(prev, state.user, project.id);
            }

            // Recurring parent: when task becomes completed via percent (100%), create next instance (same as former checkbox path).
            if (prev) {
                if (nowComplete && !wasPrevComplete && prev.recurrence && !prev.is_recurring_instance) {
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
                                addToast('Next task instance created!', 'success');
                            }
                        }
                    } catch (recurError) {
                        console.error('Error generating next task instance:', recurError);
                    }
                }
            }
        }
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
            // First, find all child tasks (subtasks) that reference this task as parent
            const { data: childTasks, error: fetchError } = await supabaseClient
                .from('tasks')
                .select('id')
                .eq('parent_task_id', taskToDelete.id);

            if (fetchError) {
                addToast('Error checking for subtasks: ' + fetchError.message, 'error');
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
                    addToast('Error updating subtasks: ' + updateError.message, 'error');
                    setShowDeleteConfirm(false);
                    setTaskToDelete(null);
                    return;
                }

                // Update child tasks in state
                childTasks.forEach(childTask => {
                    const updatedTask = { ...state.tasks.find(t => t.id === childTask.id), parent_task_id: null };
                    dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
                });
            }

            // Now delete the parent task
            const { error } = await supabaseClient.from('tasks').delete().eq('id', taskToDelete.id);
            
            if (error) {
                addToast('Error deleting task: ' + error.message, 'error');
            } else {
                const deletedRow =
                    allTasks.find((x) => x.id === taskToDelete.id) ||
                    state.tasks.find((x) => x.id === taskToDelete.id);
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
                    addToast(`Task deleted successfully! ${childCount} subtask${childCount > 1 ? 's' : ''} converted to top-level tasks.`, 'success');
                } else {
                    addToast('Task deleted successfully!', 'success');
                }
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            addToast('Error deleting task: ' + error.message, 'error');
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

    const handleTaskDrop = async (taskId, phaseId) => {
        const existing = allTasks.find((task) => String(task.id) === String(taskId));
        if (!existing) return;
        if ((existing.project_phase_id || null) === (phaseId || null)) return;
        await handleEditTask(existing.id, { project_phase_id: phaseId || null });
    };

    const handleBulkComplete = async (taskIds) => {
        const { error } = await supabaseClient.from('tasks').update({ completed: true, percent_complete: 100 }).in('id', taskIds);
        if (error) {
            addToast('Error completing tasks: ' + error.message, 'error');
        } else {
            // Update each task in the state
            taskIds.forEach(taskId => {
                const updatedTask = { ...state.tasks.find(t => t.id === taskId), completed: true, percent_complete: 100 };
                dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
            });
            if (project && state.user) {
                taskIds.forEach((taskId) => {
                    const row = allTasks.find((x) => x.id === taskId) || state.tasks.find((x) => x.id === taskId);
                    if (row) {
                        logTaskCompleted(
                            { ...row, completed: true, organization_id: row.organization_id ?? project.organization_id },
                            state.user,
                            project.id
                        );
                    }
                });
            }
            addToast(`${taskIds.length} tasks completed successfully!`, 'success');
            setSelectedTasks([]);
        }
    };

    const handleBulkDelete = async (taskIds) => {
        try {
            // First, find all child tasks that reference any of these tasks as parent
            const { data: childTasks, error: fetchError } = await supabaseClient
                .from('tasks')
                .select('id, parent_task_id')
                .in('parent_task_id', taskIds);

            if (fetchError) {
                addToast('Error checking for subtasks: ' + fetchError.message, 'error');
                return;
            }

            // If there are child tasks, set their parent_task_id to null first
            if (childTasks && childTasks.length > 0) {
                const { error: updateError } = await supabaseClient
                    .from('tasks')
                    .update({ parent_task_id: null })
                    .in('parent_task_id', taskIds);

                if (updateError) {
                    addToast('Error updating subtasks: ' + updateError.message, 'error');
                    return;
                }

                // Update child tasks in state
                childTasks.forEach(childTask => {
                    const updatedTask = { ...state.tasks.find(t => t.id === childTask.id), parent_task_id: null };
                    dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
                });
            }

            // Now delete the selected tasks
            const { error } = await supabaseClient.from('tasks').delete().in('id', taskIds);
            
            if (error) {
                addToast('Error deleting tasks: ' + error.message, 'error');
            } else {
                if (project && state.user) {
                    taskIds.forEach((taskId) => {
                        const row = allTasks.find((x) => x.id === taskId) || state.tasks.find((x) => x.id === taskId);
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
                    addToast(`${taskIds.length} task${taskIds.length > 1 ? 's' : ''} deleted successfully! ${childCount} subtask${childCount > 1 ? 's' : ''} converted to top-level tasks.`, 'success');
                } else {
                    addToast(`${taskIds.length} task${taskIds.length > 1 ? 's' : ''} deleted successfully!`, 'success');
                }
                setSelectedTasks([]);
            }
        } catch (error) {
            console.error('Error in bulk delete:', error);
            addToast('Error deleting tasks: ' + error.message, 'error');
        }
    };

    const setTaskPhotoBusy = (taskId, busy) => {
        setPhotoActionTaskIds((prev) => {
            const next = { ...prev };
            if (busy) next[taskId] = true;
            else delete next[taskId];
            return next;
        });
    };

    const replaceTaskRow = (taskId, nextTask) => {
        dispatch({ type: 'UPDATE_TASK', payload: nextTask });
        setProjectTasksList((prev) => prev.map((task) => (task.id === taskId ? nextTask : task)));
    };

    const hydratePhotoRows = async (rows = []) => {
        if (!rows.length) return [];
        const hydrated = await attachTaskPhotoUrls(supabaseClient, sortTaskPhotos(rows));
        return sortTaskPhotos(hydrated);
    };

    const handleOpenTaskPhotos = async (taskId) => {
        const task = allTasks.find((row) => row.id === taskId) || state.tasks.find((row) => row.id === taskId);
        if (!task) return;
        setPhotoModalTaskId(taskId);
        try {
            const rows = await fetchTaskPhotos(supabaseClient, taskId);
            const hydrated = await hydratePhotoRows(rows || []);
            replaceTaskRow(taskId, { ...task, task_photos: hydrated });
        } catch (error) {
            addToast(error.message || 'Could not load task photos.', 'error');
        }
    };

    const handleAddTaskPhotos = async (taskId, files) => {
        const task = allTasks.find((row) => row.id === taskId) || state.tasks.find((row) => row.id === taskId);
        if (!task || !project) return;

        setTaskPhotoBusy(taskId, true);
        let preparedPhotos = [];
        try {
            preparedPhotos = await Promise.all(
                files.map((file, index) => buildTaskPhotoDraft(file, (task.task_photos?.length || 0) + index))
            );
            const uploadedPhotos = [];
            for (let index = 0; index < preparedPhotos.length; index++) {
                const photo = preparedPhotos[index];
                setTaskPhotoUploadProgress({ taskId, current: index + 1, total: preparedPhotos.length });
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
        const task = allTasks.find((row) => row.id === taskId) || state.tasks.find((row) => row.id === taskId);
        if (!task) return;
        const targetPhoto = (task.task_photos || []).find((photo) => photo.id === photoId || photo.local_id === photoId);
        if (!targetPhoto?.id) return;
        setTaskPhotoBusy(taskId, true);
        try {
            const updatedPhoto = await updateTaskPhoto(supabaseClient, targetPhoto.id, updates);
            const hydratedPhoto = (await hydratePhotoRows([updatedPhoto]))[0];
            replaceTaskRow(taskId, {
                ...task,
                task_photos: sortTaskPhotos((task.task_photos || []).map((photo) => photo.id === targetPhoto.id ? { ...photo, ...hydratedPhoto } : photo)),
            });
        } catch (error) {
            addToast(error.message || 'Could not update task photo.', 'error');
        } finally {
            setTaskPhotoBusy(taskId, false);
        }
    };

    const handleDeleteTaskPhoto = async (taskId, photoId) => {
        const task = allTasks.find((row) => row.id === taskId) || state.tasks.find((row) => row.id === taskId);
        if (!task) return;
        const targetPhoto = (task.task_photos || []).find((photo) => photo.id === photoId || photo.local_id === photoId);
        if (!targetPhoto?.id) return;
        setTaskPhotoBusy(taskId, true);
        try {
            await deleteTaskPhoto(supabaseClient, targetPhoto);
            const remainingPhotos = sortTaskPhotos((task.task_photos || []).filter((photo) => photo.id !== targetPhoto.id));
            if (remainingPhotos.length > 0) {
                await reorderTaskPhotos(supabaseClient, taskId, remainingPhotos.map((photo) => photo.id));
                remainingPhotos.forEach((photo, index) => { photo.sort_order = index; });
            }
            replaceTaskRow(taskId, { ...task, task_photos: remainingPhotos });
            addToast('Task photo removed.', 'success');
        } catch (error) {
            addToast(error.message || 'Could not delete task photo.', 'error');
        } finally {
            setTaskPhotoBusy(taskId, false);
        }
    };

    const handleMoveTaskPhoto = async (taskId, photoId, direction) => {
        const task = allTasks.find((row) => row.id === taskId) || state.tasks.find((row) => row.id === taskId);
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


    return (
        <div>
            <header className="flex items-center justify-between mb-6 app-card p-5" data-onboarding="project-header">
                <div>
                    <h1 className="app-section-title">{project.name}</h1>
                    <p className="app-section-subtitle">{project.address}</p>
                </div>
                <div className="flex items-center gap-4">
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
                                    addToast('Error updating project status: ' + error.message, 'error');
                                } else {
                                    dispatch({
                                        type: 'UPDATE_PROJECT',
                                        payload: { ...project, status: newStatus }
                                    });
                                    addToast('Project status updated successfully!', 'success');
                                }
                            } catch (error) {
                                addToast('Error updating project status: ' + error.message, 'error');
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
                            Edit project
                        </button>
                    </PermissionGuard>
                    <button 
                        onClick={() => setShowShare(true)}
                        className="px-4 py-2 text-sm font-semibold rounded-lg shadow-xs transition-colors app-action-primary"
                        title="Assign crew members from organization directory or invite guests"
                    >
                        + Manage Crew
                    </button>
                    <PermissionGuard permission="can_create_projects">
                        <button 
                            onClick={() => setShowSaveAsTemplateModal(true)}
                            className="px-4 py-2 text-sm font-semibold rounded-lg shadow-xs transition-colors app-action-secondary"
                            title="Save this project structure as a reusable template"
                        >
                            Save as template
                        </button>
                    </PermissionGuard>
                    <PermissionGuard permission="can_manage_progress_reports">
                        <button
                            type="button"
                            onClick={() => setShowProgressReportModal(true)}
                            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg shadow-xs hover:bg-emerald-700 transition-colors flex items-center gap-2"
                            title="Schedule and manage progress reports"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Progress reports
                        </button>
                    </PermissionGuard>
                    <PermissionGuard permission="can_create_projects">
                        <button
                            type="button"
                            onClick={() => setShowMsProjectImportModal(true)}
                            className="px-4 py-2 text-sm font-semibold rounded-lg shadow-xs transition-colors bg-slate-700 text-white hover:bg-slate-800"
                            title="Import tasks and schedule from Microsoft Project XML"
                        >
                            Import MS Project XML
                        </button>
                    </PermissionGuard>
                    <PermissionGuard permission="can_edit_tasks">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedWeatherImpact(null);
                                setShowWeatherImpactModal(true);
                            }}
                            className="px-4 py-2 text-sm font-semibold rounded-lg shadow-xs transition-colors bg-indigo-600 text-white hover:bg-indigo-700"
                            title="Log weather impacts and delays"
                        >
                            Weather impacts
                        </button>
                    </PermissionGuard>
                </div>
            </header>

            {showShare && (
                <ShareModal projectId={project.id} onClose={() => setShowShare(false)} />
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

            {showProgressReportModal && project && (
                <ProgressReportModal projectId={project.id} onClose={() => setShowProgressReportModal(false)} />
            )}

            {showMsProjectImportModal && project && (
                <MsProjectImportModal
                    context="existing"
                    projectId={project.id}
                    projectName={project.name}
                    onClose={() => setShowMsProjectImportModal(false)}
                    onSuccess={() => setShowMsProjectImportModal(false)}
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

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Main content — full width on Gantt and Tasks (desktop parity) */}
                <div className={activeTab === 'gantt' || activeTab === 'tasks' || activeTab === 'stream' ? 'lg:col-span-5' : 'lg:col-span-3'}>
                    {/* Tab Navigation */}
                    <div className="border-b border-slate-200 mb-6 app-card-soft px-4">
                        <nav className="-mb-px flex space-x-8">
                            <button
                                onClick={() => setTabAndRoute('tasks')}
                                className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'tasks'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                Tasks ({Math.max(allTasks.length, ganttTasks.length)})
                            </button>
                            <button
                                onClick={() => setTabAndRoute('gantt')}
                                className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === 'gantt'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                Gantt
                            </button>
                            <button
                                onClick={() => setTabAndRoute('updates')}
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
                                    <span className="text-[10px] font-normal text-slate-500">
                                        · {fieldIssuesCount} issue{fieldIssuesCount === 1 ? '' : 's'}
                                    </span>
                                ) : null}
                            </button>
                            {canViewActivityHistory && (
                                <button
                                    onClick={() => setTabAndRoute('activity')}
                                    className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                                        activeTab === 'activity'
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    Activity
                                </button>
                            )}
                        </nav>
                    </div>

                    {/* Tab Content */}
                    <div className="min-h-96">
                        {activeTab === 'gantt' && (
                            <div className="app-card flex flex-col" data-onboarding="gantt-section" style={{ height: 'max(72vh, 520px)', maxHeight: '90vh' }}>
                                <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5 pb-3 flex-shrink-0">
                                    <h2 className="text-xl font-bold">Gantt</h2>
                                    <div className="flex items-center gap-4">
                                        <span className="text-gray-500 text-xs">
                                            {ganttTasks.length} tasks &middot; {ganttDependencies.length} deps &middot; {ganttCriticalCount} critical
                                        </span>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={showCriticalPath}
                                                onChange={(e) => setShowCriticalPath(e.target.checked)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">Show critical path</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0 flex flex-col px-4 pb-4">
                                    <GanttChart
                                        tasks={ganttTasks}
                                        dependencies={ganttDependencies}
                                        criticalPathIds={ganttCriticalIds}
                                        showCriticalPath={showCriticalPath}
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'tasks' && (
                            <div className="p-6 app-card" data-onboarding="tasks-section">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h2 className="text-xl font-bold">Tasks ({Math.max(allTasks.length, ganttTasks.length)})</h2>
                                        <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-1">
                                            <button
                                                type="button"
                                                onClick={() => setTaskFilter('all')}
                                                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                                    taskFilter === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                All
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTaskFilter('pending')}
                                                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                                    taskFilter === 'pending' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                Open
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTaskFilter('completed')}
                                                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                                    taskFilter === 'completed' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                    <PermissionGuard permission="can_create_tasks">
                                        <button onClick={() => setShowTaskModal(true)} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-full shadow-xs hover:bg-blue-700">+ New Task</button>
                                    </PermissionGuard>
                                </div>
                                <TaskBulkActions
                                    selectedTasks={selectedTasks}
                                    onBulkComplete={handleBulkComplete}
                                    onBulkDelete={handleBulkDelete}
                                    onClearSelection={() => setSelectedTasks([])}
                                />
                                {tasks.length > 0 ? (
                                    <div className={`space-y-3 ${tasks.length > 7 ? 'max-h-[min(70vh,560px)] overflow-y-auto pr-1' : ''}`}>
                                        {(() => {
                                            return (
                                                <>
                                                    {projectPhases.map((phase) => {
                                                        const phaseTasks = tasks.filter((task) => task.project_phase_id === phase.id);
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
                                                                                    onOpenPhotos={handleOpenTaskPhotos}
                                                                                    onOpenDiscussion={setDiscussionModalTaskId}
                                                                                    onPingAssignee={handlePingAssignee}
                                                                                    onRequestAssigneeSmsConsent={handleRequestAssigneeSmsConsent}
                                                                                    pingingTaskId={pingingTaskId}
                                                                                    project={project}
                                                                                />
                                                                            )
                                                                        )}
                                                                    </ul>
                                                                ) : (
                                                                    <p className="text-sm text-gray-400 px-3 py-2 bg-white">No tasks in this phase.</p>
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
                                                                            onOpenPhotos={handleOpenTaskPhotos}
                                                                            onOpenDiscussion={setDiscussionModalTaskId}
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
                            <div className="p-4 lg:p-6 app-card min-h-[72vh]">
                                <ProjectCollaborationView
                                    project={project}
                                    supabaseClient={supabaseClient}
                                    currentUserId={state.user?.id}
                                    projectTasks={allTasks}
                                    initialPanel={collaborationPanel}
                                />
                            </div>
                        )}

                        {activeTab === 'activity' && canViewActivityHistory && (
                            <div className="p-6 app-card">
                                <ActivityHistoryPanel
                                    mode="project"
                                    organizationId={project.organization_id || state.currentOrganization?.id}
                                    projectId={project.id}
                                    title="Project activity"
                                />
                            </div>
                        )}

                        {/* Desktop parity: workflow block intentionally removed from tasks tab */}
                    </div>
                </div>

                {/* Sidebar hidden on Gantt and Tasks, like desktop layout */}
                <div className={activeTab === 'gantt' || activeTab === 'tasks' || activeTab === 'updates' ? 'hidden' : 'lg:col-span-2'}>
                    <ProjectSidebar project={project} showProjectPhases={activeTab !== 'gantt'} />
                </div>
            </div>
            {showTaskModal && (
                <TaskModal
                    project={project}
                    allTasks={allTasks}
                    onClose={() => setShowTaskModal(false)}
                    onSave={handleAddTask}
                    isLoading={isCreatingTask}
                />
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
            {discussionModalTaskId && project && (
                <TaskDiscussionModal
                    task={allTasks.find((task) => task.id === discussionModalTaskId)}
                    project={project}
                    onClose={() => setDiscussionModalTaskId(null)}
                />
            )}
            {photoModalTaskId && (
                <TaskPhotosModal
                    task={allTasks.find((task) => task.id === photoModalTaskId)}
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
                        task: allTasks.find((task) => task.id === photoModalTaskId),
                    })}
                    photoActionBusy={Boolean(photoActionTaskIds[photoModalTaskId])}
                    photoUploadProgress={taskPhotoUploadProgress?.taskId === photoModalTaskId ? taskPhotoUploadProgress : null}
                />
            )}
        </div>
    );
}
export default ProjectDetailsView;