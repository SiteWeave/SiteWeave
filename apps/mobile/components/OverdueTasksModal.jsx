import { View, StyleSheet, Modal, ScrollView, Animated, Dimensions } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { groupTasksByProject } from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';
import { Text } from './ui/Text';
import { colors, spacing, touch } from '../theme';
import { useHaptics } from '../hooks/useHaptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sheetBottomPadding } from '../utils/layoutInsets';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

function formatOverdueDueDateShort(value, locale) {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let d;
  if (ymd) {
    d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  } else {
    d = new Date(s);
  }
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}


function groupKey(group, index) {
  return String(group.projectId ?? group.items?.[0]?.project_id ?? `group-${index}`);
}

export default function OverdueTasksModal({ visible, onClose, tasks = [], projects = [], loading = false }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const modalTranslateY = useRef(new Animated.Value(1)).current;
  const wasVisibleRef = useRef(false);
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set());

  const locale = i18n.language?.startsWith('es') ? 'es' : 'en-US';
  const noProjectLabel = t('common.no_project');
  const overdueGroups = useMemo(
    () => groupTasksByProject(tasks, projects, { noProjectLabel }),
    [tasks, projects, noProjectLabel],
  );

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      haptics.light();
      setCollapsedKeys(new Set());
      modalTranslateY.setValue(1);
      requestAnimationFrame(() => {
        Animated.timing(modalTranslateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    } else if (!visible) {
      modalTranslateY.setValue(1);
    }
    wasVisibleRef.current = visible;
  }, [visible, modalTranslateY]);

  const toggleGroup = (key) => {
    haptics.light();
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleTaskPress = (task, projectId) => {
    if (!projectId) return;
    haptics.light();
    onClose?.();
    router.push(`/(tabs)/projects/${projectId}`);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <ModalScrim onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: sheetBottomPadding(insets) },
          {
            transform: [{
              translateY: modalTranslateY.interpolate({
                inputRange: [0, 1],
                outputRange: [0, SCREEN_HEIGHT],
              }),
            }],
          },
        ]}
      >
        <View style={styles.header}>
          <Text variant="section" style={styles.title}>
            {t('dashboard.overdue_tasks_by_project')}
          </Text>
          <PressableWithFade onPress={onClose} style={styles.closeBtn} testID="overdue-modal-close">
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </PressableWithFade>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {loading ? (
            <Text style={styles.muted}>{t('dashboard.loading_tasks')}</Text>
          ) : overdueGroups.length === 0 ? (
            <Text style={styles.muted}>{t('dashboard.no_overdue_tasks')}</Text>
          ) : (
            overdueGroups.map((group, index) => {
              const key = groupKey(group, index);
              const isCollapsed = collapsedKeys.has(key);
              const taskCount = group.items.length;

              return (
                <View key={key} style={styles.groupCard}>
                  <PressableWithFade
                    style={styles.groupHeader}
                    onPress={() => toggleGroup(key)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !isCollapsed }}
                    accessibilityLabel={`${group.projectName}, ${taskCount} tasks`}
                    testID={`overdue-group-${key}`}
                  >
                    <View style={styles.groupHeaderText}>
                      <Text style={styles.groupTitle}>{group.projectName}</Text>
                      <Text style={styles.groupCount}>
                        {taskCount}{' '}
                        {taskCount === 1
                          ? t('mobile.task_singular', { defaultValue: 'task' })
                          : t('mobile.tasks_plural', { defaultValue: 'tasks' })}
                      </Text>
                    </View>
                    <Ionicons
                      name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </PressableWithFade>

                  {!isCollapsed && group.items.map((task) => (
                    <PressableWithFade
                      key={task.id}
                      style={styles.taskRow}
                      onPress={() => handleTaskPress(task, group.projectId || task.project_id)}
                      disabled={!group.projectId && !task.project_id}
                      testID={`overdue-task-${task.id}`}
                    >
                      <Text style={styles.taskTitle} numberOfLines={1}>
                        {task.text}
                      </Text>
                      <Text style={styles.taskMeta} numberOfLines={1}>
                        {formatOverdueDueDateShort(task.due_date, locale)}
                      </Text>
                    </PressableWithFade>
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: SCREEN_HEIGHT * 0.82,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  closeBtn: {
    minHeight: touch.minSize,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  closeText: { color: colors.textSecondary, fontWeight: '600' },
  body: { flexGrow: 0 },
  bodyContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  muted: { color: colors.textSecondary, fontSize: 15 },
  groupCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: spacing.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: touch.minRowHeight,
    backgroundColor: colors.surfaceMuted,
  },
  groupHeaderText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  groupTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  groupCount: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: touch.minRowHeight,
  },
  taskTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  taskMeta: {
    flexShrink: 0,
    maxWidth: '42%',
    fontSize: 12,
    fontWeight: '600',
    color: colors.error,
    textAlign: 'right',
  },
});
