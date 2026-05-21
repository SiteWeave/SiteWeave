import { View, Text, StyleSheet, ScrollView, RefreshControl, FlatList } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { filterByOrganizationId } from '../../utils/orgScope';
import { fetchUnreadNotificationCount } from '../../utils/notifications';
import { 
  fetchUserIncompleteTasks, 
  fetchTodayEvents, 
  fetchActiveProjectsCount,
  fetchCompletedTasksCount,
  fetchOverdueTasksCount,
  fetchUserProjectsWithProgress
} from '@siteweave/core-logic';
import QuickActionsModal from '../../components/QuickActionsModal';
import KPICarousel from '../../components/KPICarousel';
import MyDayItemModal from '../../components/MyDayItemModal';
import ProjectCardCompact from '../../components/ProjectCardCompact';
import ProfileDrawer from '../../components/ProfileDrawer';
import PressableWithFade from '../../components/PressableWithFade';
import WeatherWidget from '../../components/WeatherWidget';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../../hooks/useHaptics';

export default function HomeScreen() {
  const { user, supabase, activeOrganization, isProjectCollaborator } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [kpis, setKpis] = useState({ activeProjects: 0, completedTasks: 0, overdueTasks: 0 });
  const [myDayItems, setMyDayItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  useEffect(() => {
    if (!supabase || !user) return;
    const channel = supabase
      .channel('user_notifications_home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notifications' }, async () => {
        try {
          const unreadCount = await fetchUnreadNotificationCount(supabase, { userId: user.id, email: user.email || '' });
          setUnreadNotificationCount(unreadCount || 0);
        } catch (error) {
          console.error('Failed to refresh unread notification count:', error);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  const loadData = async () => {
    if (!user || !supabase || (!activeOrganization && !isProjectCollaborator)) {
      setTasks([]);
      setEvents([]);
      setProjects([]);
      setKpis({ activeProjects: 0, completedTasks: 0, overdueTasks: 0 });
      setMyDayItems([]);
      return;
    }
    
    try {
      const [tasksData, eventsData, projectsData, activeCount, completedCount, overdueCount, unreadCount] = await Promise.all([
        fetchUserIncompleteTasks(supabase, user.id),
        fetchTodayEvents(supabase),
        fetchUserProjectsWithProgress(supabase, user.id),
        fetchActiveProjectsCount(supabase, user.id),
        fetchCompletedTasksCount(supabase, user.id),
        fetchOverdueTasksCount(supabase, user.id),
        fetchUnreadNotificationCount(supabase, { userId: user.id, email: user.email || '' }),
      ]);
      
      const orgId = activeOrganization?.id;
      const orgTasks = orgId ? filterByOrganizationId(tasksData || [], orgId) : (tasksData || []);
      const orgEvents = orgId ? filterByOrganizationId(eventsData || [], orgId) : (eventsData || []);
      const orgProjects = orgId ? filterByOrganizationId(projectsData || [], orgId) : (projectsData || []);
      
      setTasks(orgTasks);
      setEvents(orgEvents);
      setProjects(orgProjects);
      setKpis({
        activeProjects: activeCount,
        completedTasks: completedCount,
        overdueTasks: overdueCount,
      });
      setUnreadNotificationCount(unreadCount || 0);

      // Combine and prioritize My Day items (top 3)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Prioritize tasks: due today first, then by priority
      const prioritizedTasks = orgTasks
        .map(task => ({
          ...task,
          type: 'task',
          priorityScore: getTaskPriorityScore(task, today),
        }))
        .sort((a, b) => b.priorityScore - a.priorityScore);

      // Prioritize events: by start time
      const prioritizedEvents = orgEvents
        .map(event => ({
          ...event,
          type: 'event',
          priorityScore: new Date(event.start_time).getTime(),
        }))
        .sort((a, b) => a.priorityScore - b.priorityScore);

      // Combine and take top 3
      const combined = [...prioritizedTasks, ...prioritizedEvents]
        .sort((a, b) => {
          // Events happening soon get higher priority
          if (a.type === 'event' && b.type === 'task') {
            const eventTime = new Date(a.start_time || a.priorityScore);
            const now = new Date();
            // If event is within next 2 hours, prioritize it
            if (eventTime.getTime() - now.getTime() < 2 * 60 * 60 * 1000) {
              return -1;
            }
          }
          return a.priorityScore - b.priorityScore;
        })
        .slice(0, 3);

      setMyDayItems(combined);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const getTaskPriorityScore = (task, today) => {
    let score = 0;
    
    // Due today gets high priority
    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate.getTime() === today.getTime()) {
        score += 1000;
      } else if (dueDate.getTime() < today.getTime()) {
        score += 2000; // Overdue gets highest
      }
    }

    // Priority adds to score
    switch (task.priority?.toLowerCase()) {
      case 'high':
        score += 100;
        break;
      case 'medium':
        score += 50;
        break;
      case 'low':
        score += 10;
        break;
    }

    return score;
  };

  useEffect(() => {
    loadData();
  }, [user, activeOrganization, isProjectCollaborator, supabase]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleItemPress = (item) => {
    haptics.light();
    setSelectedItem(item);
    setShowItemModal(true);
  };

  const handleItemComplete = () => {
    loadData(); // Refresh data after completion
  };

  const getUserName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.split(' ')[0]; // First name only
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'there';
  };

  const renderMyDayItem = ({ item }) => {
    const isTask = item.type === 'task';
    const isEvent = item.type === 'event';

    return (
      <PressableWithFade
        style={styles.myDayItem}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
        hapticType="light"
      >
        <View style={styles.myDayItemContent}>
          <View style={styles.myDayItemLeft}>
            {isTask && (
              <Ionicons name="checkbox-outline" size={24} color="#3B82F6" />
            )}
            {isEvent && (
              <Ionicons name="calendar-outline" size={24} color="#10B981" />
            )}
            <View style={styles.myDayItemText}>
              <Text style={styles.myDayItemTitle} numberOfLines={1}>
                {item.text || item.title}
              </Text>
              {isTask && item.due_date && (
                <Text style={styles.myDayItemSubtitle}>
                  Due: {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              )}
              {isEvent && item.start_time && (
                <Text style={styles.myDayItemSubtitle}>
                  {new Date(item.start_time).toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                  })}
                </Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#4B5563" />
        </View>
      </PressableWithFade>
    );
  };

  const renderProject = ({ item }) => (
    <ProjectCardCompact project={item} />
  );

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View>
              {activeOrganization?.name ? (
                <Text style={styles.organizationName}>{activeOrganization.name}</Text>
              ) : isProjectCollaborator ? (
                <Text style={styles.organizationName}>Projects shared with you</Text>
              ) : null}
              <Text style={styles.greeting}>Hello, {getUserName()}</Text>
            </View>
            <View style={styles.headerButtons}>
              <PressableWithFade 
                style={styles.notificationButton}
                onPress={() => {
                  haptics.light();
                  router.push('/notifications');
                }}
                activeOpacity={0.7}
                hapticType="light"
              >
                <Ionicons name="notifications-outline" size={24} color="#111827" />
                {unreadNotificationCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </Text>
                  </View>
                )}
              </PressableWithFade>
              <PressableWithFade 
                style={styles.profileButton}
                onPress={() => {
                  haptics.light();
                  setShowProfileDrawer(true);
                }}
                activeOpacity={0.7}
                hapticType="light"
              >
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>
                    {getUserName().charAt(0).toUpperCase()}
                  </Text>
                </View>
              </PressableWithFade>
            </View>
          </View>
        </View>

        {/* Weather Widget */}
        <WeatherWidget />

        {/* Section A: KPIs Carousel */}
        <View style={styles.kpiSection}>
          <KPICarousel
            activeProjects={kpis.activeProjects}
            completedTasks={kpis.completedTasks}
            overdueTasks={kpis.overdueTasks}
          />
        </View>

        {/* Section B: My Day */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MY DAY</Text>
          {myDayItems.length > 0 ? (
            <View>
              {myDayItems.map((item, index) => (
                <View key={`${item.type}-${item.id || index}`}>
                  {renderMyDayItem({ item })}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No items for today.</Text>
          )}
        </View>

        {/* Section C: Projects List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PROJECTS ({projects.length})</Text>
          {projects.length > 0 ? (
            <FlatList
              data={projects}
              renderItem={renderProject}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No projects found.</Text>
              }
            />
          ) : (
            <Text style={styles.emptyText}>No projects assigned to you.</Text>
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <PressableWithFade
        style={styles.fab}
        onPress={() => {
          haptics.medium();
          setShowQuickActions(true);
        }}
        activeOpacity={0.8}
        hapticType="medium"
      >
        <Text style={styles.fabText}>+</Text>
      </PressableWithFade>

      {/* Modals */}
      <QuickActionsModal
        visible={showQuickActions}
        onClose={() => setShowQuickActions(false)}
      />
      <MyDayItemModal
        visible={showItemModal}
        item={selectedItem}
        onClose={() => {
          setShowItemModal(false);
          setSelectedItem(null);
        }}
        onComplete={handleItemComplete}
      />
      <ProfileDrawer
        visible={showProfileDrawer}
        onClose={() => setShowProfileDrawer(false)}
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
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minHeight: 44,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  organizationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  notificationButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  profileButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  kpiSection: {
    backgroundColor: '#F9FAFB',
    paddingVertical: 12,
  },
  section: {
    padding: 20,
    backgroundColor: '#fff',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  myDayItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: 44,
  },
  myDayItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  myDayItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  myDayItemText: {
    flex: 1,
  },
  myDayItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  myDayItemSubtitle: {
    fontSize: 14,
    color: '#4B5563',
  },
  emptyText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    paddingVertical: 20,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
});
