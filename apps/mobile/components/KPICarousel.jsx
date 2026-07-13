import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from './PressableWithFade';
import { shadows } from '../theme';

export default function KPICarousel({ activeProjects, completedTasks, overdueTasks, onOverduePress }) {
  const { t } = useTranslation();
  const overdueCount = overdueTasks ?? 0;
  const kpiData = [
    {
      id: 'active',
      title: t('mobile.kpi_active'),
      subtitle: t('mobile.kpi_projects'),
      value: activeProjects ?? '—',
      color: '#3B82F6',
      icon: 'business-outline',
      onPress: null,
    },
    {
      id: 'completed',
      title: t('mobile.kpi_tasks'),
      subtitle: t('mobile.kpi_completed'),
      value: completedTasks ?? '—',
      color: '#10B981',
      icon: 'checkmark-circle-outline',
      onPress: null,
    },
    {
      id: 'overdue',
      title: t('mobile.kpi_overdue'),
      subtitle: t('mobile.kpi_tasks'),
      value: overdueTasks ?? '—',
      color: overdueCount > 0 ? '#EF4444' : '#6B7280',
      icon: 'alert-circle-outline',
      onPress: overdueCount > 0 ? onOverduePress : null,
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.dashboardCard}>
        {kpiData.map((kpi, index) => {
          const StatWrapper = kpi.onPress ? PressableWithFade : View;
          const statProps = kpi.onPress
            ? {
                onPress: kpi.onPress,
                accessibilityRole: 'button',
                accessibilityLabel: `${kpi.title} ${kpi.value}`,
                testID: `kpi-${kpi.id}`,
              }
            : {};

          return (
            <View
              key={kpi.id}
              style={[styles.statColumn, index > 0 && styles.statColumnWithDivider]}
            >
              <StatWrapper style={styles.statContent} {...statProps}>
                <Ionicons name={kpi.icon} size={20} color={kpi.color} style={styles.icon} />
                <Text style={[styles.value, { color: kpi.color, fontVariant: 'tabular-nums' }]}>{kpi.value}</Text>
                <View style={styles.labelContainer}>
                  <Text style={styles.title} numberOfLines={1}>{kpi.title}</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>{kpi.subtitle}</Text>
                </View>
              </StatWrapper>
            </View>
          );
        })}
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
    paddingVertical: 16,
    ...shadows.card,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  statColumnWithDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#E5E7EB',
    paddingLeft: 14,
  },
  statContent: {
    width: '100%',
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
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
