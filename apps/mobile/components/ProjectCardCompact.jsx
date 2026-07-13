import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import ProgressDonut from './ProgressDonut';
import PressableWithFade from './PressableWithFade';
import { Ionicons } from '@expo/vector-icons';

export default function ProjectCardCompact({ project }) {
  const router = useRouter();

  const handlePress = () => {
    // Navigate to project detail screen
    router.push(`/(tabs)/projects/${project.id}`);
  };

  const getProgressColor = (progress) => {
    if (progress >= 75) return '#10B981';
    if (progress >= 50) return '#3B82F6';
    if (progress >= 25) return '#F59E0B';
    return '#EF4444';
  };

  return (
    <PressableWithFade
      style={styles.card}
      onPress={handlePress}
      static
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          <Text style={styles.projectName} numberOfLines={1}>
            {project.name}
          </Text>
          {project.incomingTasks && project.incomingTasks.length > 0 && (
            <View style={styles.tasksList}>
              {project.incomingTasks.map((task, index) => (
                <View key={task.id || index} style={styles.taskItem}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#3B82F6" />
                  <Text style={styles.taskText} numberOfLines={1}>
                    {task.text}
                  </Text>
                  <Text style={styles.assigneeText} numberOfLines={1}>
                    • {task.assigneeName}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={styles.rightSection}>
          <ProgressDonut
            progress={project.progress || 0}
            size={60}
            color={getProgressColor(project.progress || 0)}
          />
        </View>
      </View>
    </PressableWithFade>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 44,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftSection: {
    flex: 1,
    marginRight: 16,
  },
  rightSection: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  tasksList: {
    marginTop: 8,
    gap: 6,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  taskText: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
  },
  assigneeText: {
    fontSize: 12,
    color: '#6B7280',
    flexShrink: 0,
  },
});

