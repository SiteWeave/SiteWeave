import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

export default function KPICarousel({ activeProjects, completedTasks, overdueTasks }) {
  const { t } = useTranslation();
  const kpiData = [
    {
      title: t('mobile.kpi_active'),
      subtitle: t('mobile.kpi_projects'),
      value: activeProjects ?? '—',
      color: '#3B82F6',
      icon: 'business-outline',
    },
    {
      title: t('mobile.kpi_tasks'),
      subtitle: t('mobile.kpi_completed'),
      value: completedTasks ?? '—',
      color: '#10B981',
      icon: 'checkmark-circle-outline',
    },
    {
      title: t('mobile.kpi_overdue'),
      subtitle: t('mobile.kpi_tasks'),
      value: overdueTasks ?? '—',
      color: (overdueTasks ?? 0) > 0 ? '#EF4444' : '#6B7280',
      icon: 'alert-circle-outline',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.dashboardCard}>
        {kpiData.map((kpi, index) => (
          <View key={index} style={styles.statContainer}>
            <View style={styles.statContent}>
              <Ionicons name={kpi.icon} size={20} color={kpi.color} style={styles.icon} />
              <Text style={[styles.value, { color: kpi.color }]}>{kpi.value}</Text>
              <View style={styles.labelContainer}>
                <Text style={styles.title} numberOfLines={1}>{kpi.title}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{kpi.subtitle}</Text>
              </View>
            </View>
            {index < kpiData.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
  },
  dashboardCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statContent: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    marginBottom: 4,
  },
  value: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  labelContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  subtitle: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  divider: {
    width: 1,
    height: '80%',
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
});
