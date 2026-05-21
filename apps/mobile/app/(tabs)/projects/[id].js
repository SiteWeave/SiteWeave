import { View, Text, StyleSheet, ScrollView, SectionList, FlatList } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import {
  fetchProject,
  fetchTasksByProject,
  fetchUserProjectsWithProgress,
  completeTask,
  updateTask,
  computeWeightedProjectProgressPercent,
  uploadTaskPhotoSet,
} from '@siteweave/core-logic';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PhaseAccordion from '../../../components/PhaseAccordion';
import ProjectTeamModal from '../../../components/ProjectTeamModal';
import PressableWithFade from '../../../components/PressableWithFade';
import { enqueueOfflineAction, processOfflineQueue } from '../../../utils/offlineQueue';
import TaskDetailModal from '../../../components/TaskDetailModal';
import ProjectCollaborationPanel from '../../../components/ProjectCollaborationPanel';

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { supabase, activeOrganization, syncPulse } = useAuth();
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [phases, setPhases] = useState([]);
  const [activeTab, setActiveTab] = useState('tasks');
  const [loading, setLoading] = useState(true);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isUpdatingPhase, setIsUpdatingPhase] = useState(false);
  const [photoUploadTaskId, setPhotoUploadTaskId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const subscriptionRef = useRef(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);

  useEffect(() => {
    loadProjectData();
    flushOfflineProjectActions();
  }, [id]);

  useEffect(() => {
    flushOfflineProjectActions();
  }, [syncPulse]);

  useEffect(() => {
    if (!id || !supabase) return;
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }

    const channel = supabase
      .channel(`project_live_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${id}` }, () => {
        loadProjectData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_phases', filter: `project_id=eq.${id}` }, () => {
        loadProjectData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_issues', filter: `project_id=eq.${id}` }, () => {
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
  }, [id, supabase, activeTab]);

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
    });
  };

  useEffect(() => {
    const resolveCurrentUser = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      setCurrentUserId(data?.user?.id || null);
    };
    resolveCurrentUser();
  }, [supabase]);

  const loadProjectData = async () => {
    if (!id || !supabase || !activeOrganization) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const [projectData, tasksData, phasesResult] = await Promise.all([
        fetchProject(supabase, id).catch(err => {
          console.error('Error fetching project:', err);
          return null;
        }),
        fetchTasksByProject(supabase, id).catch(err => {
          console.error('Error fetching tasks:', err);
          return [];
        }),
        supabase.from('project_phases').select('*').eq('project_id', id).eq('organization_id', activeOrganization.id).order('order', { ascending: true }).then(
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

      // Handle project data - if null, project doesn't exist or user doesn't have access
      if (!projectData) {
        setProject(null);
        setLoading(false);
        return;
      }

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
    try {
      await completeTask(supabase, taskId);
      loadProjectData(); // Reload tasks
    } catch (error) {
      console.error('Error completing task:', error);
      await enqueueOfflineAction({ type: 'complete_task', payload: { taskId } });
      alert('Task completion queued for sync.');
    }
  };

  const handleAdjustPhaseProgress = async (phase, delta) => {
    if (!supabase || !activeOrganization || !phase?.id) return;
    const currentValue = Number.isFinite(Number(phase.progress)) ? Number(phase.progress) : 0;
    const nextProgress = Math.max(0, Math.min(100, currentValue + delta));
    if (nextProgress === currentValue) return;

    try {
      setIsUpdatingPhase(true);
      const { error } = await supabase
        .from('project_phases')
        .update({ progress: nextProgress, updated_at: new Date().toISOString() })
        .eq('id', phase.id)
        .eq('organization_id', activeOrganization.id);
      if (error) throw error;
      await loadProjectData();
    } catch (error) {
      console.error('Error updating phase progress:', error);
      await enqueueOfflineAction({
        type: 'update_phase_progress',
        payload: {
          phaseId: phase.id,
          progress: nextProgress,
          organizationId: activeOrganization.id,
        },
      });
      alert('Progress update queued for sync.');
    } finally {
      setIsUpdatingPhase(false);
    }
  };

  const pickAndUploadTaskPhoto = async (task, mode) => {
    if (!task?.id || !task?.project_id || !activeOrganization?.id || !supabase) return;

    try {
      const permission =
        mode === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert('Photo permission is required to attach task photos.');
        return;
      }

      const result =
        mode === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              allowsEditing: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              allowsEditing: false,
            });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      blob.type = asset.mimeType || blob.type || 'image/jpeg';

      setPhotoUploadTaskId(task.id);
      await uploadTaskPhotoSet(supabase, {
        taskId: task.id,
        organizationId: activeOrganization.id,
        projectId: task.project_id,
        originalFile: blob,
        thumbnailFile: null,
        uploadedByUserId: currentUserId,
        capturedAt: new Date().toISOString(),
      });
      alert('Photo attached to task.');
    } catch (error) {
      console.error('Error uploading task photo:', error);
      alert('Could not upload photo. Please try again.');
    } finally {
      setPhotoUploadTaskId(null);
    }
  };

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
      sections.push({ title: 'Late', data: late });
    }
    if (todayTasks.length > 0) {
      sections.push({ title: 'Today', data: todayTasks });
    }
    if (upcoming.length > 0) {
      sections.push({ title: 'Upcoming', data: upcoming });
    }
    if (completed.length > 0) {
      sections.push({ title: 'Completed', data: completed });
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

  const openTaskDetails = (task) => {
    setSelectedTask(task);
    setShowTaskModal(true);
  };

  const handleSaveTaskDetails = async (updates) => {
    if (!selectedTask?.id) return;
    try {
      setIsSavingTask(true);
      await updateTask(supabase, selectedTask.id, updates);
      setShowTaskModal(false);
      setSelectedTask(null);
      await loadProjectData();
    } catch (error) {
      console.error('Error saving task details:', error);
      await enqueueOfflineAction({
        type: 'update_task',
        payload: { taskId: selectedTask.id, updates },
      });
      alert('Task update queued for sync.');
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleIssueStatusChange = async (issue, nextStatus) => {
    if (!issue?.id) return;
    try {
      const { error } = await supabase
        .from('project_issues')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', issue.id)
        .eq('organization_id', activeOrganization.id);
      if (error) throw error;
      await loadIssues();
    } catch (error) {
      console.error('Error updating issue status:', error);
      await enqueueOfflineAction({
        type: 'update_issue_status',
        payload: {
          issueId: issue.id,
          nextStatus,
          organizationId: activeOrganization.id,
        },
      });
      alert('Issue status change queued for sync.');
    }
  };

  const renderTaskItem = ({ item }) => (
    <PressableWithFade
      style={styles.taskItem}
      onPress={() => openTaskDetails(item)}
      activeOpacity={0.7}
    >
      <View style={styles.taskContent}>
        <View style={styles.taskLeft}>
          <Ionicons 
            name={item.completed ? "checkmark-circle" : "ellipse-outline"} 
            size={24} 
            color={item.completed ? "#10B981" : "#4B5563"} 
          />
          <View style={styles.taskText}>
            <Text style={[styles.taskTitle, item.completed && styles.taskCompleted]}>
              {item.text}
            </Text>
            {item.due_date && (
              <Text style={styles.taskDueDate}>
                Due: {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            )}
          </View>
        </View>
        {item.priority && (
          <View style={[styles.priorityPill, { backgroundColor: getPriorityColor(item.priority) + '20' }]}>
            <Text style={[styles.priorityText, { color: getPriorityColor(item.priority) }]}>
              {item.priority}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.taskActions}>
        <PressableWithFade
          style={[styles.photoButton, photoUploadTaskId === item.id && styles.photoButtonDisabled]}
          onPress={() => pickAndUploadTaskPhoto(item, 'camera')}
          disabled={photoUploadTaskId === item.id}
          activeOpacity={0.7}
        >
          <Ionicons name="camera-outline" size={16} color="#1E3A8A" />
          <Text style={styles.photoButtonText}>Camera</Text>
        </PressableWithFade>
        <PressableWithFade
          style={[styles.photoButton, photoUploadTaskId === item.id && styles.photoButtonDisabled]}
          onPress={() => pickAndUploadTaskPhoto(item, 'library')}
          disabled={photoUploadTaskId === item.id}
          activeOpacity={0.7}
        >
          <Ionicons name="images-outline" size={16} color="#1E3A8A" />
          <Text style={styles.photoButtonText}>Photos</Text>
        </PressableWithFade>
      </View>
    </PressableWithFade>
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
          <Text>Loading...</Text>
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
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
            <PressableWithFade
              style={styles.teamButton}
              onPress={() => setShowTeamModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={24} color="#3B82F6" />
            </PressableWithFade>
          </View>
        </View>

        {/* Project Title and Progress */}
        <View style={styles.projectHeader}>
          <Text style={styles.projectTitle}>{project.name}</Text>
          <View style={styles.progressContainer}>
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
              Tasks
            </Text>
          </PressableWithFade>
          <PressableWithFade
            style={[styles.tab, activeTab === 'updates' && styles.tabActive]}
            onPress={() => setActiveTab('updates')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'updates' && styles.tabTextActive]}>
              Updates
            </Text>
          </PressableWithFade>
          <PressableWithFade
            style={[styles.tab, activeTab === 'details' && styles.tabActive]}
            onPress={() => setActiveTab('details')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>
              Details
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
                  <Text style={styles.emptyText}>No tasks for this project.</Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'updates' && project && (
            <ProjectCollaborationPanel
              project={project}
              supabase={supabase}
              currentUserId={currentUserId}
            />
          )}

          {activeTab === 'details' && (
            <View>
              {phases.length > 0 ? (
                phases.map((phase) => (
                  <PhaseAccordion
                    key={phase.id}
                    phase={phase}
                    onAdjustProgress={handleAdjustPhaseProgress}
                    isUpdating={isUpdatingPhase}
                  />
                ))
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No phases defined for this project.</Text>
                </View>
              )}
            </View>
          )}

        </View>
      </ScrollView>

      <ProjectTeamModal
        visible={showTeamModal}
        projectId={id}
        onClose={() => setShowTeamModal(false)}
      />
      <TaskDetailModal
        visible={showTaskModal}
        task={selectedTask}
        project={project}
        supabase={supabase}
        currentUserId={currentUserId}
        viewerOrgId={activeOrganization?.id}
        onClose={() => {
          setShowTaskModal(false);
          setSelectedTask(null);
        }}
        onSave={handleSaveTaskDetails}
        loading={isSavingTask}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
    gap: 12,
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

