import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getLocalizedProjectStatus } from '@siteweave/i18n';
import PressableWithFade from './PressableWithFade';
import ProgressDonut from './ProgressDonut';
import NotificationBadge from './ui/NotificationBadge';
import { Text as UiText } from './ui/Text';
import { colors, spacing, radius, shadows } from '../theme';
import {
  getMilestoneLabel,
  getProjectScheduleHealth,
  getProjectTypeIcon,
  getRelativeDuePhrase,
  getScheduleHealthAccentColor,
  getStatusPillStyle,
} from '../utils/projectScheduleHealth';

export default function ProjectListCard({ project, onPress, testID }) {
  const { t, i18n } = useTranslation();

  const pct = Math.round(project.progress_percent ?? project.progress ?? 0);
  const name = project.name || project.title || t('mobile.project_card.unnamed');
  const health = getProjectScheduleHealth(project, pct);
  const scheduleColor = getScheduleHealthAccentColor(health);
  const statusStyle = getStatusPillStyle(project.status);
  const statusLabel = getLocalizedProjectStatus(project.status, t);
  const milestone = getMilestoneLabel(project);
  const duePhrase = getRelativeDuePhrase(project.due_date, t, i18n.language);
  const typeIcon = getProjectTypeIcon(project.project_type);
  const notificationCount = project.notification_count ?? 0;

  const scheduleLine = [duePhrase, t('mobile.percent_complete', { percent: pct })]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableWithFade onPress={onPress} testID={testID} static>
      <View style={styles.card}>
        <View style={[styles.accent, { backgroundColor: scheduleColor }]} />
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <UiText style={styles.name} numberOfLines={2}>
              {name}
            </UiText>
            <View style={[styles.statusPill, { backgroundColor: statusStyle.backgroundColor }]}>
              <UiText style={[styles.statusText, { color: statusStyle.color }]} numberOfLines={1}>
                {statusLabel}
              </UiText>
            </View>
          </View>

          {project.project_type ? (
            <View style={styles.typeRow}>
              <Ionicons name={typeIcon} size={14} color={colors.textMuted} />
              <UiText style={styles.typeText} numberOfLines={1}>
                {project.project_type}
              </UiText>
            </View>
          ) : null}

          {milestone ? (
            <UiText style={styles.milestone} numberOfLines={2}>
              {t('mobile.project_card.next_milestone_prefix', { milestone })}
            </UiText>
          ) : null}

          {scheduleLine ? (
            <UiText style={styles.scheduleLine} numberOfLines={1}>
              {scheduleLine}
            </UiText>
          ) : null}
        </View>

        <View style={styles.donutWrap}>
          <ProgressDonut progress={pct} size={52} color={scheduleColor} />
        </View>

        {notificationCount > 0 ? (
          <NotificationBadge
            count={notificationCount}
            style={styles.notificationBadge}
            testID={testID ? `${testID}-notifications` : undefined}
          />
        ) : null}
      </View>
    </PressableWithFade>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
    minHeight: 56,
    ...shadows.card,
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    gap: spacing.xs,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    maxWidth: '42%',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  milestone: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 20,
  },
  scheduleLine: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  donutWrap: {
    justifyContent: 'center',
    paddingRight: spacing.md,
    paddingLeft: spacing.xs,
  },
  notificationBadge: {
    top: spacing.sm,
    right: spacing.sm,
  },
});
