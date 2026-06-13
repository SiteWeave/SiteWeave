import { View, Text, StyleSheet, ScrollView, SectionList, FlatList, Alert } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import {
  fetchProject,
  fetchTasksByProject,
  completeTask,
  updateTask,
  computeWeightedProjectProgressPercent,
  canManageTaskPhotos,
} from '@siteweave/core-logic';
import TaskCard from '../../../components/TaskCard';
import TaskDetailModal from '../../../components/TaskDetailModal';
import ProgressBottomSheet from '../../../components/ProgressBottomSheet';
import PhotoAttachSheet from '../../../components/PhotoAttachSheet';
import { pickAndUploadTaskPhoto, resolveTaskOrganizationId } from '../../../utils/pickAndUploadTaskPhoto';
import { colors, spacing, touch } from '../../../theme';
import { TAB_BAR_CLEARANCE } from '../../../components/ui/FloatingTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ProjectTeamModal from '../../../components/ProjectTeamModal';
import PressableWithFade from '../../../components/PressableWithFade';
import { enqueueOfflineAction, processOfflineQueue, getOfflineQueueSize } from '../../../utils/offlineQueue';
import ProjectCollaborationPanel from '../../../components/ProjectCollaborationPanel';
import { SkeletonCard, SkeletonList } from '../../../components/ui/Skeleton';

function resolveScopeOrganizationId({ activeOrganization, project, collaborationProjects, projectId }) {
  if (project?.organization_id) return project.organization_id;
  if (activeOrganization?.id) return activeOrganization.id;
  const collab = collaborationProjects?.find((p) => p.id === projectId);
  return collab?.organization_id ?? null;
}

export default function ProjectDetailScreen() {
  const { t } = useTranslation();
  const { id: idParam } = useLocalSearchParams();
  const projectId = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const {
    supabase,
    user,
    activeOrganization,
    isProjectCollaborator,
    collaborationProjects,
    syncPulse,
  } = useAuth();
  const [scopeOrganizationId, setScopeOrganizationId] = useState(null);
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [phases, setPhases] = useState([]);
  const [activeTab, setActiveTab] = useState('tasks');
  const [loading, setLoading] = useState(true);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [progress, setProgress] = useState(0);
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
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  const refreshOfflineQueueCount = async () => {
    const size = await getOfflineQueueSize();
    setOfflineQueueCount(size);
  };

  useEffect(() => {
    loadProjectData();
    flushOfflineProjectActions();
    refreshOfflineQueueCount();
  }, [projectId]);

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
        if (activeTab === 'updates') loadProjectData();
      })
      .subscribe();

    subscriptionRef.current = channel;
    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [projectId, supabase, activeTab]);

  const flushOfflineProjectActions = async () => {
    if (!supabase) return;
    await processOfflineQueue({
      complete_task: async (payload) => {
        await completeTask(supabase, payload.taskId);
      },
      update_phase_progress: async (payload) => {
        await supabase
          .from('project_phases')
          .update({ progress: payload.progress, updated_at: new Date().toISOString() })
          .eq('id', payload.phaseId)
          .eq('organization_id', payload.organizationId);
      },
      update_task: async (payload) => {
        await updateTask(supabase, payload.taskId, payload.updates);
      },
      update_issue_status: async (payload) => {
        await supabase
          .from('project_issues')
          .update({ status: payload.nextStatus, updated_at: new Date().toISOString() })
          .eq('id', payload.issueId)
          .eq('organization_id', payload.organizationId);
      },
    }, {
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

    try {
      setLoading(true);
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
        setProject(null);
        setScopeOrganizationId(null);
        setLoading(false);
        return;
      }

      setScopeOrganizationId(orgId);

      const [tasksData, phasesResult] = await Promise.all([
        fetchTasksByProject(supabase, projectId).catch(err => {
          console.error('Error fetching tasks:', err);
          return [];
        }),
        supabase.from('project_phases').select('*').eq('project_id', projectId).eq('organization_id', orgId).order('order', { ascending: true }).then(
          ({ data, error }) => {
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

      // Duration-weighted project % (same as web/desktop; prefers stored phase progress from DB)
      if (phasesResult.data && phasesResult.data.length > 0) {
        setProgress(computeWeightedProjectProgressPercent(phasesResult.data, projectData.due_date));
      } else {
        setProgress(0);
      }

    } catch (error) {
      console.error('Error loading project data:', error);
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskId) => {
    const prevTasks = tasks;
    setTasks((list) =>
      list.map((t) => (t.id === taskId ? { ...t, completed: true, percent_complete: 100 } : t)),
    );
    try {
      await completeTask(supabase, taskId);
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
      });
      if (uploaded) {
        Alert.alert(t('common.success'), t('mobile.task_photo_attached', { defaultValue: 'Photo attached to task.' }));
        await loadProjectData();
      }
    } catch (error) {
      console.error('Error uploading task photo:', error);
      Alert.alert(t('common.error'), error.message || t('mobile.task_photo_upload_failed', { defaultValue: 'Could not upload photo.' }));
    } finally {
      setPhotoUploadTaskId(null);
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
    try {
      setIsSavingProgress(true);
      await updateTask(supabase, progressTask.id, updates);
      setShowProgressSheet(false);
      setProgressTask(null);
      await loadProjectData();
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

  const renderTaskItem = ({ item }) => (
    <TaskCard
      task={item}
      onPress={openTaskDetail}
      onProgressPress={(task) => {
        setProgressTask(task);
        setShowProgressSheet(true);
      }}
      onPhotoPress={openPhotoSheet}
      canManagePhotos={canUploadPhotosForTask(item)}
      photoUploading={photoUploadTaskId === item.id}
      testID={`task-card-${item.id}`}
    />
  );


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
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
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
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <PressableWithFade 
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </PressableWithFade>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>Project not found</Text>
        </View>
      </View>
    );
  }

  const taskSections = groupTasksByStatus();

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <PressableWithFade 
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </PressableWithFade>
          <View style={styles.headerRight}>
            {offlineQueueCount > 0 ? (
              <View style={styles.syncBadge}>
                <Text style={styles.syncBadgeText}>{offlineQueueCount}</Text>
              </View>
            ) : null}
            <PressableWithFade
              style={styles.teamButton}
              onPress={() => setShowTeamModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={24} color="#3B82F6" />
            </PressableWithFade>
          </View>
        </View>

        <View style={styles.projectHeader}>
          <Text style={styles.projectTitle}>{project.name}</Text>
          <View style={styles.progressContainer}>
            <Text style={styles.progressLabel}>{t('mobile.progress_label')}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <PressableWithFade
            style={[styles.tab, activeTab === 'tasks' && styles.tabActive]}
            onPress={() => setActiveTab('tasks')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>
              {t('mobile.project_tasks_tab')}
            </Text>
          </PressableWithFade>
          <PressableWithFade
            style={[styles.tab, activeTab === 'updates' && styles.tabActive]}
            onPress={() => setActiveTab('updates')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'updates' && styles.tabTextActive]}>
              {t('mobile.project_updates_tab')}
            </Text>
          </PressableWithFade>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'tasks' && (
            <View>
              {taskSections.length > 0 ? (
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
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>{t('mobile.no_tasks')}</Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'updates' && project && (
            <ProjectCollaborationPanel
              project={project}
              supabase={supabase}
              currentUserId={user?.id}
            />
          )}

        </View>
      </ScrollView>

      <ProjectTeamModal
        visible={showTeamModal}
        projectId={projectId}
        onClose={() => setShowTeamModal(false)}
      />
      <TaskDetailModal
        visible={showTaskDetail}
        task={detailTask}
        project={project}
        supabase={supabase}
        currentUserId={user?.id}
        viewerOrgId={scopeOrganizationId}
        onClose={() => {
          setShowTaskDetail(false);
          setDetailTask(null);
        }}
        onSave={handleTaskDetailSave}
        loading={isSavingTask}
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
  teamButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    minHeight: 44,
  },
  tabActive: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#3B82F6',
  },
  tabContent: {
    padding: 16,
    backgroundColor: '#fff',
    marginTop: 8,
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

