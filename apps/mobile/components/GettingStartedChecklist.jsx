import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Card from './ui/Card';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing } from '../theme';
import { useBranding } from '../context/BrandingContext';
import { useAuth } from '../context/AuthContext';
import {
  dismissGettingStarted,
  showGettingStarted,
  readGettingStartedState,
} from '../utils/onboarding';

const MANAGER_ITEMS = [
  { id: 'project', icon: 'folder-outline' },
  { id: 'invite', icon: 'people-outline' },
  { id: 'task', icon: 'checkbox-outline' },
];

const FIELD_ITEMS = [
  { id: 'project', icon: 'folder-outline' },
  { id: 'task', icon: 'checkbox-outline' },
];

export default function GettingStartedChecklist({
  firstProjectId,
  projectCount = 0,
  taskCount = 0,
  canCreateProjects = false,
  isManagerView = false,
  onCreateProject,
  onInviteCrew,
  onAddTask,
  refreshKey,
}) {
  const { t } = useTranslation();
  const { primaryColor } = useBranding();
  const { user } = useAuth();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [completed, setCompleted] = useState({
    project: false,
    invite: false,
    task: false,
  });

  const checklistItems = useMemo(() => {
    if (!isManagerView) return FIELD_ITEMS;
    return MANAGER_ITEMS;
  }, [isManagerView]);

  const getItemLabel = useCallback(
    (itemId) => {
      if (itemId === 'project') {
        if (isManagerView && projectCount === 0 && canCreateProjects) {
          return t('mobile.getting_started_create_project');
        }
        if (isManagerView) {
          return t('mobile.getting_started_open_project');
        }
        return t('mobile.getting_started_open_job');
      }
      if (itemId === 'invite') return t('mobile.getting_started_invite');
      if (itemId === 'task') {
        return isManagerView
          ? t('mobile.getting_started_add_task')
          : t('mobile.getting_started_update_task');
      }
      return '';
    },
    [isManagerView, projectCount, canCreateProjects, t],
  );

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setEligible(false);
      setDismissed(false);
      return;
    }

    const state = await readGettingStartedState(user.id);
    setDismissed(Boolean(state.dismissed));

    const nextCompleted = {
      project: isManagerView && projectCount === 0 ? false : state.projectOpened,
      invite: state.inviteSent,
      task: taskCount > 0 || state.taskCreated || state.taskUpdated,
    };
    setCompleted(nextCompleted);

    const relevant = checklistItems.map((item) => nextCompleted[item.id]);
    const allDone = relevant.every(Boolean);
    setEligible(!allDone);
  }, [checklistItems, taskCount, projectCount, isManagerView, user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh, refreshKey]),
  );

  const handleDismiss = async () => {
    await dismissGettingStarted(user?.id);
    setDismissed(true);
  };

  const handleShow = async () => {
    await showGettingStarted(user?.id);
    setDismissed(false);
  };

  const handleItemPress = async (itemId) => {
    if (completed[itemId]) return;

    switch (itemId) {
      case 'project':
        if (projectCount === 0 && canCreateProjects && isManagerView) {
          onCreateProject?.();
        } else if (firstProjectId) {
          router.push(`/(tabs)/projects/${firstProjectId}`);
        } else {
          router.push('/(tabs)/projects');
        }
        break;
      case 'invite':
        if (onInviteCrew) {
          onInviteCrew();
        } else if (firstProjectId) {
          router.push(`/(tabs)/projects/${firstProjectId}?openInvite=1`);
        } else if (canCreateProjects) {
          onCreateProject?.();
        }
        break;
      case 'task':
        if (onAddTask) {
          onAddTask();
        } else if (firstProjectId) {
          router.push(`/(tabs)/projects/${firstProjectId}`);
        } else {
          router.push('/(tabs)/projects');
        }
        break;
      default:
        break;
    }
  };

  if (!eligible) return null;

  const title = isManagerView
    ? t('mobile.getting_started_title')
    : t('mobile.getting_started_field_title');

  if (dismissed) {
    return (
      <PressableWithFade
        style={styles.showChip}
        onPress={handleShow}
        testID="getting-started-show"
        accessibilityRole="button"
        accessibilityLabel={t('mobile.getting_started_show')}
      >
        <Ionicons name="list-outline" size={18} color={primaryColor} />
        <Text variant="bodyMedium" style={[styles.showChipText, { color: primaryColor }]}>
          {t('mobile.getting_started_show')}
        </Text>
      </PressableWithFade>
    );
  }

  const doneCount = checklistItems.filter((item) => completed[item.id]).length;

  return (
    <Card style={styles.card} testID="getting-started-checklist">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text variant="sectionTitle" style={styles.title}>
            {title}
          </Text>
          <Text variant="caption" style={styles.progress}>
            {t('mobile.getting_started_progress', { done: doneCount, total: checklistItems.length })}
          </Text>
        </View>
        <PressableWithFade onPress={handleDismiss} testID="getting-started-dismiss" hitSlop={8}>
          <Text variant="caption" style={[styles.hideLink, { color: primaryColor }]}>
            {t('mobile.getting_started_hide')}
          </Text>
        </PressableWithFade>
      </View>

      <View style={styles.list}>
        {checklistItems.map((item) => {
          const isDone = completed[item.id];
          return (
            <PressableWithFade
              key={item.id}
              style={styles.row}
              onPress={() => handleItemPress(item.id)}
              disabled={isDone}
              testID={`getting-started-item-${item.id}`}
            >
              <Ionicons
                name={isDone ? 'checkmark-circle' : item.icon}
                size={22}
                color={isDone ? colors.secondary : colors.textMuted}
              />
              <Text
                variant="bodyMedium"
                style={[styles.rowLabel, isDone && styles.rowLabelDone]}
              >
                {getItemLabel(item.id)}
              </Text>
            </PressableWithFade>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.lg,
  },
  showChip: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 40,
  },
  showChipText: { fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  headerCopy: { flex: 1 },
  title: { marginBottom: spacing.xs },
  progress: { color: colors.textMuted },
  hideLink: { fontWeight: '600' },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  rowLabel: { flex: 1, color: colors.text },
  rowLabelDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
