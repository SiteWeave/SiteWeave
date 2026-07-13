import { useState, useEffect, useCallback, useMemo } from 'react';

import { View, StyleSheet } from 'react-native';

import { useTranslation } from 'react-i18next';

import { Ionicons } from '@expo/vector-icons';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useFocusEffect, useRouter } from 'expo-router';

import Card from './ui/Card';

import { Text } from './ui/Text';

import PressableWithFade from './PressableWithFade';

import { colors, spacing } from '../theme';

import { useBranding } from '../context/BrandingContext';

import {

  GETTING_STARTED_DISMISSED_KEY,

  GETTING_STARTED_PROJECT_OPENED_KEY,

  GETTING_STARTED_INVITE_SENT_KEY,

  GETTING_STARTED_TASK_CREATED_KEY,

  GETTING_STARTED_TASK_UPDATED_KEY,

  dismissGettingStarted,

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



async function readChecklistState({ taskCount = 0, projectCount = 0, isManagerView = false } = {}) {

  const [dismissed, projectOpened, inviteSent, taskCreated, taskUpdated] = await Promise.all([

    AsyncStorage.getItem(GETTING_STARTED_DISMISSED_KEY),

    AsyncStorage.getItem(GETTING_STARTED_PROJECT_OPENED_KEY),

    AsyncStorage.getItem(GETTING_STARTED_INVITE_SENT_KEY),

    AsyncStorage.getItem(GETTING_STARTED_TASK_CREATED_KEY),

    AsyncStorage.getItem(GETTING_STARTED_TASK_UPDATED_KEY),

  ]);



  return {

    dismissed: dismissed === '1',

    completed: {

      project: isManagerView && projectCount === 0 ? false : projectOpened === '1',

      invite: inviteSent === '1',

      task: taskCount > 0 || taskCreated === '1' || taskUpdated === '1',

    },

  };

}



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

  const router = useRouter();

  const [visible, setVisible] = useState(false);

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

    const state = await readChecklistState({ taskCount, projectCount, isManagerView });

    if (state.dismissed) {

      setVisible(false);

      return;

    }

    setCompleted(state.completed);

    const relevant = checklistItems.map((item) => state.completed[item.id]);

    const allDone = relevant.every(Boolean);

    setVisible(!allDone);

  }, [checklistItems, taskCount, projectCount, isManagerView]);



  useEffect(() => {

    refresh();

  }, [refresh, refreshKey]);



  useFocusEffect(

    useCallback(() => {

      refresh();

    }, [refresh, refreshKey]),

  );



  const handleDismiss = async () => {

    await dismissGettingStarted();

    setVisible(false);

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



  if (!visible) return null;



  const doneCount = checklistItems.filter((item) => completed[item.id]).length;



  return (

    <Card style={styles.card} testID="getting-started-checklist">

      <View style={styles.header}>

        <View style={styles.headerCopy}>

          <Text variant="sectionTitle" style={styles.title}>

            {isManagerView ? t('mobile.getting_started_title') : t('mobile.getting_started_field_title')}

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

