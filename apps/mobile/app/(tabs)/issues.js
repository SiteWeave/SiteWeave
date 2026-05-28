import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { fetchUserIncompleteTasks, completeTask } from '@siteweave/core-logic';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHaptics } from '../../hooks/useHaptics';

export default function IssuesScreen() {
  const { t } = useTranslation();
  const { user, supabase } = useAuth();
  const haptics = useHaptics();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadIssues = async () => {
    if (!user) return;
    
    try {
      const tasks = await fetchUserIncompleteTasks(supabase, user.id);
      setIssues(tasks);
    } catch (error) {
      console.error('Error loading issues:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();
  }, [user]);

  const handleCompleteTask = async (taskId) => {
    try {
      haptics.medium();
      await completeTask(supabase, taskId);
      haptics.success();
      setIssues(issues.filter(issue => issue.id !== taskId));
    } catch (error) {
      console.error('Error completing task:', error);
      haptics.error();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <Text>{t('mobile.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('mobile.issues_title')}</Text>
        </View>
      
      <FlatList
        data={issues}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.issueCard}>
            <Text style={styles.issueTitle}>{item.text}</Text>
            {item.description && (
              <Text style={styles.issueDescription}>{item.description}</Text>
            )}
            <View style={styles.issueFooter}>
              {item.due_date && (
                <Text style={styles.issueDate}>
                  {t('mobile.due_label', { date: new Date(item.due_date).toLocaleDateString() })}
                </Text>
              )}
              <TouchableOpacity
                style={styles.completeButton}
                onPress={() => handleCompleteTask(item.id)}
              >
                <Text style={styles.completeButtonText}>{t('mobile.complete')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('myDay.no_tasks_assigned')}</Text>
          </View>
        }
      />
      </View>
    </SafeAreaView>
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
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  issueCard: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  issueTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  issueDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  issueFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  issueDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  completeButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  completeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
});

