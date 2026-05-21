import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import { fetchUserProjectsWithProgress } from '@siteweave/core-logic';
import { filterByOrganizationId } from '../../../utils/orgScope';
import ProjectCardCompact from '../../../components/ProjectCardCompact';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ProjectsScreen() {
  const { user, supabase, activeOrganization, isProjectCollaborator } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    if (!user || !supabase || (!activeOrganization && !isProjectCollaborator)) {
      setLoading(false);
      setProjects([]);
      return;
    }
    
    try {
      setLoading(true);
      const data = await fetchUserProjectsWithProgress(supabase, user.id);
      
      const orgProjects = activeOrganization
        ? filterByOrganizationId(data || [], activeOrganization.id)
        : (data || []);
      
      // Fetch incoming tasks with assignee info for each project
      const projectsWithTasks = await Promise.all(
        (orgProjects || []).map(async (project) => {
          try {
            // Fetch tasks with assignee contact info, filtered by organization
            const { data: tasks, error: tasksError } = await supabase
              .from('tasks')
              .select(`
                id,
                text,
                due_date,
                completed,
                assignee_id,
                contacts (
                  id,
                  name
                )
              `)
              .eq('project_id', project.id)
              .eq('organization_id', project.organization_id)
              .order('due_date', { ascending: true, nullsFirst: false });
            
            if (tasksError) throw tasksError;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString().split('T')[0];
            
            // Get incoming tasks (not completed, due today or in the future)
            const incomingTasks = (tasks || [])
              .filter(task => 
                !task.completed && 
                task.due_date && 
                task.due_date >= todayStr
              )
              .slice(0, 3) // Limit to 3 tasks for display
              .map(task => ({
                id: task.id,
                text: task.text,
                assigneeName: task.contacts?.name || 'Unassigned',
              }));
            
            return {
              ...project,
              incomingTasks: incomingTasks,
              incomingTasksCount: incomingTasks.length,
            };
          } catch (error) {
            console.error(`Error fetching tasks for project ${project.id}:`, error);
            return {
              ...project,
              incomingTasks: [],
              incomingTasksCount: 0,
            };
          }
        })
      );
      
      setProjects(projectsWithTasks);
    } catch (error) {
      console.error('Error loading projects:', error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user, supabase, activeOrganization, isProjectCollaborator]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Reload when tab is focused
  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects])
  );

  const renderProject = ({ item }) => (
    <ProjectCardCompact project={item} />
  );

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          {activeOrganization?.name ? (
            <Text style={styles.organizationName}>{activeOrganization.name}</Text>
          ) : isProjectCollaborator ? (
            <Text style={styles.organizationName}>Shared with you</Text>
          ) : null}
          <Text style={styles.title}>Projects</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text>Loading...</Text>
          </View>
        ) : projects.length > 0 ? (
          <FlatList
            data={projects}
            keyExtractor={(item) => item.id}
            renderItem={renderProject}
            contentContainerStyle={styles.listContent}
            refreshing={false}
            onRefresh={loadProjects}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>
              {isProjectCollaborator
                ? 'No projects yet. Open your invite link from your contractor.'
                : 'No projects assigned to you.'}
            </Text>
          </View>
        )}
      </View>
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
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minHeight: 44,
  },
  organizationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  listContent: {
    paddingVertical: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#4B5563',
    marginTop: 16,
  },
});


