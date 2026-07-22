import { View, Text, StyleSheet, ScrollView, SectionList, Alert } from 'react-native';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import {
  fetchProject,
  fetchTasksByProject,
  completeTask,
  updateTask,
  createTask,
  computeProjectProgressPercent,
  buildPhasesWithDerivedProgress,
  calculatePhaseProgressFromTasks,
  groupTasksByPhaseId,
  canManageTaskPhotos,
  maybeCreateEarlyCompletionAdjustment,
  suggestWorkdaysGained,
  getTaskEndDate,
  CACHE_TTL,
} from '@siteweave/core-logic';
import TaskCard from '../../../components/TaskCard';
import TaskDetailSheet from '../../../components/TaskDetailSheet';
import PanelEmptyState from '../../../components/PanelEmptyState';
import EditProjectSheet from '../../../components/EditProjectSheet';
import ProgressReportsPanel from '../../../components/ProgressReportsPanel';
import FieldIssueSheet from '../../../components/FieldIssueSheet';
import PhaseAccordion from '../../../components/PhaseAccordion';
import { useMobileExperience } from '../../../context/MobileExperienceContext';
import ProgressBottomSheet from '../../../components/ProgressBottomSheet';
import PhotoAttachSheet from '../../../components/PhotoAttachSheet';
import { pickAndUploadTaskPhoto, resolveTaskOrganizationId } from '../../../utils/pickAndUploadTaskPhoto';
import { colors, spacing, touch } from '../../../theme';
import { scrollBottomPadding, contentTopInset } from '../../../utils/layoutInsets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBranding } from '../../../context/BrandingContext';
import ProjectTeamModal from '../../../components/ProjectTeamModal';
import PressableWithFade from '../../../components/PressableWithFade';
import { enqueueOfflineAction, processOfflineQueue, getOfflineQueueSize } from '../../../utils/offlineQueue';
import { buildOfflineHandlers } from '../../../utils/offlineHandlers';
import ProjectStreamPanel from '../../../components/ProjectStreamPanel';
import FieldIssuesPanel from '../../../components/FieldIssuesPanel';
import { useWorkspaceTier } from '../../../hooks/useWorkspaceTier';
import ProjectSearchSheet from '../../../components/ProjectSearchSheet';
import { markGettingStartedProjectOpened, markGettingStartedTaskCreated, markGettingStartedTaskUpdated } from '../../../utils/onboarding';
import { signalReviewPromptOpportunity } from '../../../utils/reviewPromptEvents';
import { SkeletonCard, SkeletonList } from '../../../components/ui/Skeleton';
import { useSyncStatus } from '../../../context/SyncStatusContext';
import { getCached, setCached } from '../../../utils/persistentCache';

function resolveScopeOrganizationId({ activeOrganization, project, collaborationProjects, projectId }) {
  if (project?.organization_id) return project.organization_id;
  if (activeOrganization?.id) return activeOrganization.id;
  const collab = collaborationProjects?.find((p) => p.id === projectId);
  return collab?.organization_id ?? null;
}

export default function ProjectDetailScreen() {
  const { t } = useTranslation();
  const { id: idParam, openInvite: openInviteParam } = useLocalSearchParams();
  const projectId = Array.isArray(idParam) ? idParam[0] : idParam;
  const openInviteValue = Array.isArray(openInviteParam) ? openInviteParam[0] : openInviteParam;
  const openInvite = openInviteValue === '1' || openInviteValue === 'true';
  const router = useRouter();
  const {
    supabase,
    user,
    userRole,
    activeOrganization,
    isProjectCollaborator,
    collaborationProjects,
    syncPulse,
    canEditProjects,
    canCreateTasks,
    canAssignTasks,
    canManageProgressReports,
  } = useAuth();
  const { isManagerView } = useMobileExperience();
  const { isOnline } = useSyncStatus();
  const { canExport } = useWorkspaceTier();
  const { primaryColor } = useBranding();
  const insets = useSafeAreaInsets();
  const tabScrollBottom = scrollBottomPadding(insets, spacing.lg);
  const [scopeOrganizationId, setScopeOrganizationId] = useState(null);
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [phases, setPhases] = useState([]);
  const [activeTab, setActiveTab] = useState('tasks');
  const [loading, setLoading] = useState(true);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showProjectSearch, setShowProjectSearch] = useState(false);
  const [openTeamInvite, setOpenTeamInvite] = useState(false);
  const [photoUploadTaskId, setPhotoUploadTaskId] = useState(null);
  const [userContactId, setUserContactId] = useState(null);
  const subscriptionRef = useRef(null);
  const [progressTask, setProgressTask] = useState(null);
  const [showProgressSheet, setShowProgressSheet] = useState(false);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [photoTask, setPhotoTask] = useState(null);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [showEditProject, setShowEditProject] = useState(false);
  const [showFieldIssue, setShowFieldIssue] = useState(false);
  const [editingFieldIssue, setEditingFieldIssue] = useState(null);
  const [expandedPhases, setExpandedPhases] = useState({});
  const [pendingCompletionPhoto, setPendingCompletionPhoto] = useState(false);
  const [taskPhotoRefreshKey, setTaskPhotoRefreshKey] = useState(0);

  const refreshOfflineQueueCount = async () => {
    const size = await getOfflineQueueSize();
    setOfflineQueueCount(size);
  };

  useEffect(() => {
    if (projectId && project) {
      markGettingStartedProjectOpened(user?.id).catch(() => {});
    }
  }, [projectId, project?.id, user?.id]);

  useEffect(() => {
    if (projectId && project && openInvite && isManagerView && canEditProjects) {
      setShowTeamModal(true);
      setOpenTeamInvite(true);
    }
  }, [projectId, project?.id, openInvite, isManagerView, canEditProjects]);

  useEffect(() => {
    if (isManagerView) return;
    if (activeTab === 'stream' || activeTab === 'reports') {
      setActiveTab('tasks');
    }
  }, [isManagerView, activeTab]);

  useEffect(() => {
    if (activeTab === 'photos') {
      setActiveTab('tasks');
    }
  }, [activeTab]);

  useEffect(() => {
    loadProjectData();
    flushOfflineProjectActions();
    refreshOfflineQueueCount();
  }, [projectId]);

  useEffect(() => {
    if (isOnline && projectId) {
      loadProjectData();
    }
  }, [isOnline, projectId]);

  useEffect(() => {
    flushOfflineProjectActions();
  }, [syncPulse]);

  useEffect(() => {
    if (!projectId || !supabase) return;
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }

    const channel = supabase
      .channel(`project_live_${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, () => {
        loadProjectData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_phases', filter: `project_id=eq.${projectId}` }, () => {
        loadProjectData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_issues', filter: `project_id=eq.${projectId}` }, () => {
        if (activeTab === 'stream' || activeTab === 'fieldIssues') loadProjectData();
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'project_lifecycle_events' },
        (payload) => {
          const event = payload.new;
          const affectedProjectId = event.project_id || event.metadata?.project_id;
          if (
            String(affectedProjectId) === String(projectId)
            && (event.action === 'trashed' || event.action === 'purged')
          ) {
            Alert.alert(
              t('projectTrash.project_unavailable_title'),
              t('projectTrash.project_unavailable_message'),
              [{ text: t('common.ok'), onPress: () => router.replace('/(tabs)/projects') }],
              { cancelable: false },
            );
          }
        },
      )
      .subscribe();

    subscriptionRef.current = channel;
    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [projectId, supabase, activeTab, router, t]);

  const flushOfflineProjectActions = async () => {
    if (!supabase) return;
    await processOfflineQueue(buildOfflineHandlers(supabase), {
      onComplete: async () => {
        await loadProjectData();
        await refreshOfflineQueueCount();
      },
    });
  };

  useEffect(() => {
    if (!user?.id || !supabase) {
      setUserContactId(null);
      return;
    }
    supabase
      .from('profiles')
      .select('contact_id')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setUserContactId(data?.contact_id ?? null))
      .catch(() => setUserContactId(null));
  }, [user?.id, supabase]);

  const loadProjectData = async () => {
    if (!projectId || !supabase) {
      setLoading(false);
      return;
    }
    if (!activeOrganization && !isProjectCollaborator) {
      setLoading(false);
      return;
    }

    const detailCacheKey = user?.id ? `projectDetail:${projectId}` : null;
    const projectsListCacheKey = user?.id
      ? `projects:${activeOrganization?.id || 'guest'}`
      : null;

    try {
      setLoading(true);

      // Offline / soft-fail: hydrate from last successful detail snapshot or projects list.
      if (!isOnline && user?.id) {
        const cachedDetail = detailCacheKey ? await getCached(user.id, detailCacheKey) : null;
        if (cachedDetail?.project) {
          setProject(cachedDetail.project);
          setTasks(cachedDetail.tasks || []);
          setPhases(cachedDetail.phases || []);
          setScopeOrganizationId(
            cachedDetail.scopeOrganizationId ||
              resolveScopeOrganizationId({
                activeOrganization,
                project: cachedDetail.project,
                collaborationProjects,
                projectId,
              }),
          );
          setLoading(false);
          return;
        }
        const list = projectsListCacheKey ? await getCached(user.id, projectsListCacheKey) : null;
        const listProject = Array.isArray(list)
          ? list.find((p) => p?.id === projectId)
          : null;
        const collabProject = (collaborationProjects || []).find((p) => p?.id === projectId);
        const fallbackProject = listProject || collabProject || null;
        if (fallbackProject) {
          setProject(fallbackProject);
          setTasks([]);
          setPhases([]);
          setScopeOrganizationId(
            resolveScopeOrganizationId({
              activeOrganization,
              project: fallbackProject,
              collaborationProjects,
              projectId,
            }),
          );
          setLoading(false);
          return;
        }
      }

      const projectData = await fetchProject(supabase, projectId).catch((err) => {
        console.error('Error fetching project:', err);
        return null;
      });

      const orgId = resolveScopeOrganizationId({
        activeOrganization,
        project: projectData,
        collaborationProjects,
        projectId,
      });

      if (!projectData || !orgId) {
        // Last chance: cached snapshot even if we thought we were online.
        if (user?.id && detailCacheKey) {
          const cachedDetail = await getCached(user.id, detailCacheKey);
          if (cachedDetail?.project) {
            setProject(cachedDetail.project);
            setTasks(cachedDetail.tasks || []);
            setPhases(cachedDetail.phases || []);
            setScopeOrganizationId(cachedDetail.scopeOrganizationId || orgId);
            setLoading(false);
            return;
          }
        }
        if (user?.id && projectsListCacheKey) {
          const list = await getCached(user.id, projectsListCacheKey);
          const listProject = Array.isArray(list)
            ? list.find((p) => p?.id === projectId)
            : null;
          const collabProject = (collaborationProjects || []).find((p) => p?.id === projectId);
          const fallbackProject = listProject || collabProject || null;
          if (fallbackProject) {
            setProject(fallbackProject);
            setTasks([]);
            setPhases([]);
            setScopeOrganizationId(
              resolveScopeOrganizationId({
                activeOrganization,
                project: fallbackProject,
                collaborationProjects,
                projectId,
              }),
            );
            setLoading(false);
            return;
          }
        }
        setProject(null);
        setScopeOrganizationId(null);
        setLoading(false);
        if (isOnline && !projectData) {
          Alert.alert(
            t('projectTrash.project_unavailable_title'),
            t('projectTrash.project_unavailable_message'),
            [{ text: t('common.ok'), onPress: () => router.replace('/(tabs)/projects') }],
            { cancelable: false },
          );
        }
        return;
      }

      setScopeOrganizationId(orgId);

      const [tasksData, phasesResult] = await Promise.all([
        fetchTasksByProject(supabase, projectId).catch(err => {
          console.error('Error fetching tasks:', err);
          return [];
        }),
        supabase
          .from('project_phases')
          .select('*')
          .eq('project_id', projectId)
          .order('order', { ascending: true })
          .then(({ data, error }) => {
            if (error) {
              console.error('Error fetching phases:', error);
              return { data: [], error };
            }
            return { data: data || [], error: null };
          }
        ).catch(err => {
          console.error('Error fetching phases:', err);
          return { data: [], error: err };
        }),
      ]);

      setProject(projectData);
      setTasks(tasksData || []);
      setPhases(phasesResult.data || []);

      if (user?.id && detailCacheKey) {
        await setCached(
          user.id,
          detailCacheKey,
          {
            project: projectData,
            tasks: tasksData || [],
            phases: phasesResult.data || [],
            scopeOrganizationId: orgId,
          },
          CACHE_TTL.list,
        );
      }
    } catch (error) {
      console.error('Error loading project data:', error);
      if (user?.id) {
        const cachedDetail = detailCacheKey ? await getCached(user.id, detailCacheKey) : null;
        if (cachedDetail?.project) {
          setProject(cachedDetail.project);
          setTasks(cachedDetail.tasks || []);
          setPhases(cachedDetail.phases || []);
          setScopeOrganizationId(cachedDetail.scopeOrganizationId || null);
          return;
        }
        const list = projectsListCacheKey ? await getCached(user.id, projectsListCacheKey) : null;
        const listProject = Array.isArray(list)
          ? list.find((p) => p?.id === projectId)
          : null;
        const collabProject = (collaborationProjects || []).find((p) => p?.id === projectId);
        const fallbackProject = listProject || collabProject || null;
        if (fallbackProject) {
          setProject(fallbackProject);
          setTasks([]);
          setPhases([]);
          setScopeOrganizationId(
            resolveScopeOrganizationId({
              activeOrganization,
              project: fallbackProject,
              collaborationProjects,
              projectId,
            }),
          );
          return;
        }
      }
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskId) => {
    const prevTasks = tasks;
    const sourceTask = tasks.find((t) => t.id === taskId);
    const completedAt = new Date().toISOString();
    setTasks((list) =>
      list.map((t) =>
        t.id === taskId
          ? { ...t, completed: true, percent_complete: 100, completed_at: completedAt }
          : t,
      ),
    );
    try {
      await completeTask(supabase, taskId);
      signalReviewPromptOpportunity();
      if (sourceTask && project?.organization_id) {
        const completedTask = {
          ...sourceTask,
          completed: true,
          percent_complete: 100,
          completed_at: completedAt,
        };
        const days = suggestWorkdaysGained(completedTask);
        if (days >= 2) {
          try {
            await maybeCreateEarlyCompletionAdjustment(supabase, {
              organizationId: project.organization_id,
              projectId: project.id,
              task: completedTask,
              plannedFinish: getTaskEndDate(completedTask),
              userId: user?.id || null,
              workdaysGained: days,
              actualFinish: completedAt.slice(0, 10),
            });
          } catch (suggestError) {
            console.error('Schedule gain suggestion failed:', suggestError);
          }
        }
      }
      loadProjectData();
    } catch (error) {
      console.error('Error completing task:', error);
      setTasks(prevTasks);
      await enqueueOfflineAction({ type: 'complete_task', payload: { taskId } });
      setTasks((list) =>
        list.map((t) => (t.id === taskId ? { ...t, completed: true, percent_complete: 100 } : t)),
      );
      await refreshOfflineQueueCount();
      alert('Task completion queued for sync.');
    }
  };

  const runTaskPhotoUpload = async (mode) => {
    const task = photoTask;
    if (!task) return;

    const orgId = resolveTaskOrganizationId(
      task,
      activeOrganization,
      project ? [project] : collaborationProjects,
    );
    if (!orgId) {
      Alert.alert(t('common.error'), t('mobile.task_photo_missing_org', { defaultValue: 'Could not resolve organization for this task.' }));
      return;
    }

    try {
      setPhotoUploadTaskId(task.id);
      const uploaded = await pickAndUploadTaskPhoto({
        supabase,
        task,
        organizationId: orgId,
        userId: user?.id,
        mode,
        isCompletionPhoto: pendingCompletionPhoto,
      });
      if (uploaded) {
        Alert.alert(t('common.success'), t('mobile.task_photo_attached', { defaultValue: 'Photo attached to task.' }));
        setTaskPhotoRefreshKey((key) => key + 1);
        await loadProjectData();
      }
    } catch (error) {
      console.error('Error uploading task photo:', error);
      Alert.alert(t('common.error'), error.message || t('mobile.task_photo_upload_failed', { defaultValue: 'Could not upload photo.' }));
    } finally {
      setPhotoUploadTaskId(null);
      setPendingCompletionPhoto(false);
      setShowPhotoSheet(false);
      setPhotoTask(null);
    }
  };

  const canUploadPhotosForTask = (task) =>
    canManageTaskPhotos({
      project,
      userId: user?.id,
      userContactId,
      task,
    });

  const groupTasksByStatus = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const late = tasks.filter(task => 
      !task.completed && 
      task.due_date && 
      task.due_date < todayStr
    );
    
    const todayTasks = tasks.filter(task => 
      !task.completed && 
      task.due_date === todayStr
    );
    
    const upcoming = tasks.filter(task => 
      !task.completed && 
      (!task.due_date || task.due_date > todayStr)
    );

    const completed = tasks.filter(task => task.completed);

    const sections = [];
    if (late.length > 0) {
      sections.push({ title: t('mobile.tasks_late'), data: late });
    }
    if (todayTasks.length > 0) {
      sections.push({ title: t('common.today'), data: todayTasks });
    }
    if (upcoming.length > 0) {
      sections.push({ title: t('mobile.tasks_upcoming'), data: upcoming });
    }
    if (completed.length > 0) {
      sections.push({ title: t('mobile.tasks_completed'), data: completed });
    }

    return sections;
  };

  const phasesWithProgress = useMemo(
    () => buildPhasesWithDerivedProgress(phases, tasks),
    [phases, tasks],
  );

  const { unassignedTasks } = useMemo(
    () => groupTasksByPhaseId(phases, tasks),
    [phases, tasks],
  );

  const derivedProjectProgress = useMemo(
    () =>
      computeProjectProgressPercent({
        tasks,
        phases: phasesWithProgress,
        projectDueDate: project?.due_date,
      }),
    [phasesWithProgress, project?.due_date, tasks],
  );

  useEffect(() => {
    setExpandedPhases((prev) => {
      const phaseIds = new Set(phases.map((phase) => phase.id));
      const next = {};
      for (const phase of phases) {
        next[phase.id] = prev[phase.id] ?? true;
      }
      if (phaseIds.size > 0 || unassignedTasks.length > 0) {
        next.unassigned = prev.unassigned ?? true;
      }
      return next;
    });
  }, [phases, unassignedTasks.length]);

  const togglePhaseExpanded = (phaseKey) => {
    setExpandedPhases((prev) => ({
      ...prev,
      [phaseKey]: !prev[phaseKey],
    }));
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return '#EF4444';
      case 'medium':
        return '#F59E0B';
      case 'low':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  const handleIssueStatusChange = async (issue, nextStatus) => {
    if (!issue?.id || !scopeOrganizationId) return;
    try {
      const { error } = await supabase
        .from('project_issues')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', issue.id)
        .eq('organization_id', scopeOrganizationId);
      if (error) throw error;
      await loadProjectData();
    } catch (error) {
      console.error('Error updating issue status:', error);
      await enqueueOfflineAction({
        type: 'update_issue_status',
        payload: {
          issueId: issue.id,
          nextStatus,
          organizationId: scopeOrganizationId,
        },
      });
      alert('Issue status change queued for sync.');
    }
  };

  const handleProgressSave = async (updates) => {
    if (!progressTask?.id) return;
    const reachedComplete = updates.percent_complete >= 100;
    try {
      setIsSavingProgress(true);
      await updateTask(supabase, progressTask.id, updates);
      await markGettingStartedTaskUpdated(user?.id);
      if (reachedComplete) {
        signalReviewPromptOpportunity();
      }
      if (reachedComplete && project?.organization_id) {
        const completedAt = new Date().toISOString();
        const completedTask = {
          ...progressTask,
          ...updates,
          completed: true,
          percent_complete: 100,
          completed_at: completedAt,
        };
        const days = suggestWorkdaysGained(completedTask);
        if (days >= 2) {
          try {
            await maybeCreateEarlyCompletionAdjustment(supabase, {
              organizationId: project.organization_id,
              projectId: project.id,
              task: completedTask,
              plannedFinish: getTaskEndDate(completedTask),
              userId: user?.id || null,
              workdaysGained: days,
              actualFinish: completedAt.slice(0, 10),
            });
          } catch (suggestError) {
            console.error('Schedule gain suggestion failed:', suggestError);
          }
        }
      }
      setShowProgressSheet(false);
      const savedTask = progressTask;
      setProgressTask(null);
      await loadProjectData();
      if (reachedComplete && canUploadPhotosForTask(savedTask)) {
        Alert.alert(
          t('mobile.completion_photo_title'),
          t('mobile.completion_photo_message'),
          [
            { text: t('mobile.completion_photo_skip'), style: 'cancel' },
            {
              text: t('mobile.completion_photo_add'),
              onPress: () => {
                setPhotoTask(savedTask);
                setPendingCompletionPhoto(true);
                setShowPhotoSheet(true);
              },
            },
          ],
        );
      }
    } catch (error) {
      console.error('Error updating progress:', error);
      await enqueueOfflineAction({
        type: 'update_task',
        payload: { taskId: progressTask.id, updates },
      });
      alert('Progress update queued for sync.');
    } finally {
      setIsSavingProgress(false);
    }
  };

  const openPhotoSheet = (task) => {
    if (!canUploadPhotosForTask(task)) {
      Alert.alert(
        t('common.error'),
        t('mobile.task_photo_permission_denied', { defaultValue: 'You do not have permission to attach photos to this task.' }),
      );
      return;
    }
    setPhotoTask(task);
    setShowPhotoSheet(true);
  };

  const openTaskDetail = (task) => {
    setDetailTask(task);
    setShowTaskDetail(true);
  };

  const handleTaskDetailSave = async (updates) => {
    if (!detailTask?.id) return;
    try {
      setIsSavingTask(true);
      await updateTask(supabase, detailTask.id, updates);
      setShowTaskDetail(false);
      setDetailTask(null);
      await loadProjectData();
    } catch (error) {
      console.error('Error updating task:', error);
      await enqueueOfflineAction({
        type: 'update_task',
        payload: { taskId: detailTask.id, updates },
      });
      alert('Task update queued for sync.');
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleTaskCreate = async (updates) => {
    if (!project?.id || !user?.id) return;
    try {
      setIsCreatingTask(true);
      await createTask(supabase, {
        ...updates,
        project_id: project.id,
        organization_id: project.organization_id || scopeOrganizationId,
      });
      await markGettingStartedTaskCreated(user?.id);
      setShowCreateTask(false);
      await loadProjectData();
    } catch (error) {
      console.error('Error creating task:', error);
      await enqueueOfflineAction({
        type: 'create_task',
        payload: {
          ...updates,
          project_id: project.id,
          organization_id: project.organization_id || scopeOrganizationId,
        },
      });
      alert('Task creation queued for sync.');
      setShowCreateTask(false);
    } finally {
      setIsCreatingTask(false);
    }
  };

  const openCreateTaskSheet = () => setShowCreateTask(true);

  const hasAnyTasks = tasks.length > 0;

  const renderTaskCard = (task, { variant = 'default', isLast = false } = {}) => (
    <TaskCard
      key={task.id}
      task={task}
      variant={variant}
      isLast={isLast}
      onPress={openTaskDetail}
      onProgressPress={(selectedTask) => {
        setProgressTask(selectedTask);
        setShowProgressSheet(true);
      }}
      onPhotoPress={openPhotoSheet}
      canManagePhotos={canUploadPhotosForTask(task)}
      photoUploading={photoUploadTaskId === task.id}
      testID={`task-card-${task.id}`}
    />
  );

  const renderTaskItem = ({ item }) => renderTaskCard(item);


  const getIssuePriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return '#DC2626';
      case 'high':
        return '#EF4444';
      case 'medium':
        return '#F59E0B';
      case 'low':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  const formatIssueDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderIssueItem = ({ item }) => (
    <View style={styles.issueItem}>
      <View style={styles.issueContent}>
        <View style={styles.issueLeft}>
          <View style={[styles.issuePriorityIndicator, { backgroundColor: getIssuePriorityColor(item.priority) }]} />
          <View style={styles.issueText}>
            <Text style={styles.issueTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {item.description && (
              <Text style={styles.issueDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <View style={styles.issueMeta}>
              {item.created_at && (
                <Text style={styles.issueDate}>
                  {formatIssueDate(item.created_at)}
                </Text>
              )}
              {item.priority && (
                <View style={[styles.issuePriorityBadge, { backgroundColor: getIssuePriorityColor(item.priority) + '20' }]}>
                  <Text style={[styles.issuePriorityText, { color: getIssuePriorityColor(item.priority) }]}>
                    {item.priority}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.issueActions}>
              <PressableWithFade
                style={[styles.issueActionButton, item.status === 'open' && styles.issueActionButtonActive]}
                onPress={() => handleIssueStatusChange(item, 'open')}
              >
                <Text style={[styles.issueActionText, item.status === 'open' && styles.issueActionTextActive]}>Open</Text>
              </PressableWithFade>
              <PressableWithFade
                style={[styles.issueActionButton, item.status === 'in_progress' && styles.issueActionButtonActive]}
                onPress={() => handleIssueStatusChange(item, 'in_progress')}
              >
                <Text style={[styles.issueActionText, item.status === 'in_progress' && styles.issueActionTextActive]}>In progress</Text>
              </PressableWithFade>
              <PressableWithFade
                style={[styles.issueActionButton, item.status === 'resolved' && styles.issueActionButtonActive]}
                onPress={() => handleIssueStatusChange(item, 'resolved')}
              >
                <Text style={[styles.issueActionText, item.status === 'resolved' && styles.issueActionTextActive]}>Resolved</Text>
              </PressableWithFade>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.safeArea, { paddingTop: contentTopInset(insets) }]}>
        <View style={styles.loadingContainer}>
          <SkeletonCard height={48} style={{ marginBottom: spacing.lg, width: '70%' }} />
          <SkeletonCard height={24} style={{ marginBottom: spacing.md, width: '100%' }} />
          <SkeletonList count={6} rowHeight={72} />
        </View>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.safeArea, { paddingTop: contentTopInset(insets) }]}>
        <View style={styles.header}>
          <PressableWithFade
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </PressableWithFade>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>Project not found</Text>
        </View>
      </View>
    );
  }

  const taskSections = phases.length > 0 ? [] : groupTasksByStatus();

  const projectTabs = [
    { id: 'tasks', label: t('mobile.project_tasks_tab'), testID: 'project-tab-tasks' },
    isManagerView
      ? { id: 'stream', label: t('mobile.project_stream_tab'), testID: 'project-tab-stream' }
      : null,
    {
      id: 'fieldIssues',
      label: t('mobile.project_issues_punch_tab'),
      accessibilityLabel: t('mobile.project_issues_punch_tab_full'),
      testID: 'project-tab-field-issues',
    },
    isManagerView && canManageProgressReports
      ? {
          id: 'reports',
          label: t('mobile.project_reports_tab'),
          accessibilityLabel: t('mobile.project_reports_tab_full'),
          testID: 'project-tab-reports',
        }
      : null,
  ].filter(Boolean);

  return (
    <View style={[styles.safeArea, { paddingTop: contentTopInset(insets) }]}>
      <View style={styles.header}>
          <PressableWithFade
            style={styles.backButton}
            onPress={() => router.back()}
          >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </PressableWithFade>
        <View style={styles.headerRight}>
          {offlineQueueCount > 0 ? (
            <View style={styles.syncBadge}>
              <Text style={styles.syncBadgeText}>{offlineQueueCount}</Text>
            </View>
          ) : null}
          <PressableWithFade
            style={styles.headerActionBtn}
            onPress={() => setShowProjectSearch(true)}
            testID="project-search-button"
            accessibilityLabel={t('mobile.project_search_placeholder')}
          >
            <Ionicons name="search-outline" size={24} color={primaryColor} />
          </PressableWithFade>
          {isManagerView ? (
            <>
              {canEditProjects ? (
                <PressableWithFade
                  style={styles.headerActionBtn}
                  onPress={() => setShowEditProject(true)}
                  testID="project-edit-button"
                  accessibilityLabel={t('mobile.manage_edit_project')}
                >
                  <Ionicons name="create-outline" size={24} color={primaryColor} />
                </PressableWithFade>
              ) : null}
              <PressableWithFade
                style={styles.headerActionBtn}
                onPress={() => setShowTeamModal(true)}
                testID="project-team-button"
                accessibilityLabel={t('mobile.manage_team')}
              >
                <Ionicons name="people-outline" size={24} color={primaryColor} />
              </PressableWithFade>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.projectHeader}>
        <Text style={styles.projectTitle}>{project.name}</Text>
        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>{t('mobile.progress_label')}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${derivedProjectProgress}%`, backgroundColor: primaryColor }]} />
          </View>
          <Text style={styles.progressText}>{derivedProjectProgress}%</Text>
        </View>
      </View>

      <View style={styles.tabsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContent}
        >
          {projectTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <PressableWithFade
                key={tab.id}
                style={styles.tab}
                onPress={() => setActiveTab(tab.id)}
                testID={tab.testID}
                accessibilityLabel={tab.accessibilityLabel || tab.label}
              >
                <Text
                  style={[
                    styles.tabText,
                    isActive && [styles.tabTextActive, { color: primaryColor }],
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                {isActive ? (
                  <View style={[styles.tabIndicator, { backgroundColor: primaryColor }]} />
                ) : null}
              </PressableWithFade>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.tabBody}>
        {activeTab === 'tasks' ? (
          <ScrollView
            style={styles.tabScroll}
            contentContainerStyle={[styles.tabContent, { paddingBottom: tabScrollBottom }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
              {canCreateTasks && hasAnyTasks ? (
                <View style={styles.tasksHeaderRow}>
                  <Text style={styles.tasksHeaderLabel}>{t('mobile.project_tasks_tab')}</Text>
                  <PressableWithFade
                    style={styles.taskAddCompact}
                    onPress={openCreateTaskSheet}
                    testID="task-new-compact"
                    accessibilityLabel={t('mobile.tasks_create_first')}
                  >
                    <Ionicons name="add-circle-outline" size={26} color={primaryColor} />
                  </PressableWithFade>
                </View>
              ) : null}
              {phases.length > 0 ? (
                <View style={styles.phasesSection}>
                  {phasesWithProgress.map((phase) => (
                    <PhaseAccordion
                      key={phase.id}
                      title={phase.name}
                      progressPercent={phase.progress}
                      taskCount={phase.tasks.length}
                      expanded={expandedPhases[phase.id] !== false}
                      onToggle={() => togglePhaseExpanded(phase.id)}
                      testID={`phase-accordion-${phase.id}`}
                    >
                      {phase.tasks.length > 0
                        ? phase.tasks.map((task, taskIndex) =>
                            renderTaskCard(task, {
                              variant: 'flat',
                              isLast: taskIndex === phase.tasks.length - 1,
                            }),
                          )
                        : null}
                    </PhaseAccordion>
                  ))}
                  {unassignedTasks.length > 0 ? (
                    <PhaseAccordion
                      title={t('mobile.tasks_unassigned_phase')}
                      progressPercent={calculatePhaseProgressFromTasks(unassignedTasks)}
                      taskCount={unassignedTasks.length}
                      expanded={expandedPhases.unassigned !== false}
                      onToggle={() => togglePhaseExpanded('unassigned')}
                      testID="phase-accordion-unassigned"
                    >
                      {unassignedTasks.map((task, taskIndex) =>
                        renderTaskCard(task, {
                          variant: 'flat',
                          isLast: taskIndex === unassignedTasks.length - 1,
                        }),
                      )}
                    </PhaseAccordion>
                  ) : null}
                  {phasesWithProgress.every((phase) => phase.tasks.length === 0) && unassignedTasks.length === 0 ? (
                    canCreateTasks ? (
                      <PanelEmptyState
                        icon="checkbox-outline"
                        title={t('mobile.tasks_empty_title')}
                        hint={t('mobile.tasks_empty_hint')}
                        ctaLabel={t('mobile.tasks_create_first')}
                        onCta={openCreateTaskSheet}
                        testID="tasks-empty-cta"
                      />
                    ) : (
                      <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>{t('mobile.no_tasks')}</Text>
                      </View>
                    )
                  ) : null}
                </View>
              ) : taskSections.length > 0 ? (
                <SectionList
                  sections={taskSections}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTaskItem}
                  renderSectionHeader={({ section: { title } }) => (
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionHeaderText}>{title}</Text>
                    </View>
                  )}
                  scrollEnabled={false}
                />
              ) : (
                canCreateTasks ? (
                  <PanelEmptyState
                    icon="checkbox-outline"
                    title={t('mobile.tasks_empty_title')}
                    hint={t('mobile.tasks_empty_hint')}
                    ctaLabel={t('mobile.tasks_create_first')}
                    onCta={openCreateTaskSheet}
                    testID="tasks-empty-cta"
                  />
                ) : (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>{t('mobile.no_tasks')}</Text>
                  </View>
                )
              )}
          </ScrollView>
        ) : null}

        {isManagerView && activeTab === 'stream' && project ? (
          <ProjectStreamPanel
            project={project}
            supabase={supabase}
            currentUserId={user?.id}
            contentPaddingBottom={tabScrollBottom}
            canPost={userRole?.permissions?.can_send_messages !== false}
          />
        ) : null}

        {activeTab === 'fieldIssues' && project ? (
          <FieldIssuesPanel
            project={project}
            supabase={supabase}
            currentUserId={user?.id}
            projectTasks={tasks}
            canExport={canExport}
            contentPaddingBottom={tabScrollBottom}
            onReportIssue={() => {
              setEditingFieldIssue(null);
              setShowFieldIssue(true);
            }}
            onEditIssue={(issue) => {
              setEditingFieldIssue(issue);
              setShowFieldIssue(true);
            }}
          />
        ) : null}

        {isManagerView && canManageProgressReports && activeTab === 'reports' && project ? (
          <ProgressReportsPanel
            embedded
            active
            supabase={supabase}
            organizationId={scopeOrganizationId}
            projectId={projectId}
            projectName={project?.name}
            userId={user?.id}
            contentPaddingBottom={tabScrollBottom}
          />
        ) : null}
      </View>

      <ProjectTeamModal
        visible={showTeamModal}
        projectId={projectId}
        project={project}
        canInvite={isManagerView && canEditProjects}
        openInviteOnMount={openTeamInvite}
        onClose={() => {
          setShowTeamModal(false);
          setOpenTeamInvite(false);
        }}
      />
      <TaskDetailSheet
        visible={showCreateTask}
        mode="create"
        project={project}
        phases={phases}
        supabase={supabase}
        currentUserId={user?.id}
        onClose={() => setShowCreateTask(false)}
        onCreate={handleTaskCreate}
        loading={isCreatingTask}
      />
      <TaskDetailSheet
        visible={showTaskDetail}
        task={detailTask}
        project={project}
        phases={phases}
        supabase={supabase}
        currentUserId={user?.id}
        currentUser={user}
        organizationName={activeOrganization?.name}
        compact={!isManagerView}
        canAssignTasks={isManagerView && canAssignTasks}
        photoRefreshKey={taskPhotoRefreshKey}
        onClose={() => {
          setShowTaskDetail(false);
          setDetailTask(null);
        }}
        onSave={handleTaskDetailSave}
        onTaskUpdated={(updated) => {
          setDetailTask(updated);
          setTasks((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
        }}
        loading={isSavingTask}
      />
      <EditProjectSheet
        visible={showEditProject}
        project={project}
        supabase={supabase}
        userId={user?.id}
        onClose={() => setShowEditProject(false)}
        onSaved={(updated) => {
          setProject(updated);
          setShowEditProject(false);
        }}
      />
      <ProjectSearchSheet
        visible={showProjectSearch}
        onClose={() => setShowProjectSearch(false)}
        projectName={project?.name}
        tasks={tasks}
        onSelectTask={openTaskDetail}
      />
      <FieldIssueSheet
        visible={showFieldIssue}
        onClose={() => {
          setShowFieldIssue(false);
          setEditingFieldIssue(null);
        }}
        supabase={supabase}
        projectId={projectId}
        organizationId={scopeOrganizationId}
        userId={user?.id}
        onCreated={loadProjectData}
        issueToEdit={editingFieldIssue}
      />
      <ProgressBottomSheet
        visible={showProgressSheet}
        task={progressTask}
        onClose={() => {
          setShowProgressSheet(false);
          setProgressTask(null);
        }}
        onSave={handleProgressSave}
        saving={isSavingProgress}
      />
      <PhotoAttachSheet
        visible={showPhotoSheet}
        onClose={() => {
          setShowPhotoSheet(false);
          setPhotoTask(null);
        }}
        uploading={!!photoUploadTaskId}
        onCamera={() => runTaskPhotoUpload('camera')}
        onLibrary={() => runTaskPhotoUpload('library')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minHeight: 44,
  },
  backButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  syncBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  headerActionBtn: {
    padding: spacing.sm,
    minWidth: touch.minSize,
    minHeight: touch.minSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectHeader: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  projectTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    minWidth: 50,
  },
  reportIssueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: touch.minSize,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportIssueText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  phasesSection: {
    marginBottom: spacing.md,
  },
  tabsBar: {
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: touch.minRowHeight,
  },
  tabsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: touch.minRowHeight,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    position: 'relative',
    paddingHorizontal: spacing.md,
    height: touch.minRowHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIndicator: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    includeFontPadding: false,
  },
  tabTextActive: {
    fontWeight: '700',
  },
  tabBody: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
  },
  tabScroll: {
    flex: 1,
  },
  tabContent: {
    padding: spacing.lg,
  },
  tasksHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  tasksHeaderLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  taskAddCompact: {
    minWidth: touch.minSize,
    minHeight: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    textTransform: 'uppercase',
  },
  taskItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: 44,
  },
  taskContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
  },
  photoButtonDisabled: {
    opacity: 0.5,
  },
  photoButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  taskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  taskText: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    color: '#4B5563',
  },
  taskDueDate: {
    fontSize: 14,
    color: '#4B5563',
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  issueItem: {
    backgroundColor: '#fff',
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  issueContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  issueLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  issuePriorityIndicator: {
    width: 4,
    borderRadius: 2,
  },
  issueText: {
    flex: 1,
  },
  issueTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  issueDescription: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 8,
    lineHeight: 20,
  },
  issueMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  issueActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  issueActionButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  issueActionButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  issueActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  issueActionTextActive: {
    color: '#1D4ED8',
  },
  issueDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  issuePriorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  issuePriorityText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#4B5563',
  },
});

