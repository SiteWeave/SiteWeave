import { ScrollView, StyleSheet, View } from 'react-native';
import RemoteImage from './RemoteImage';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeTaskProgressUpdate, fetchTaskPhotos, attachTaskPhotoUrls } from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import TaskCommentsSection from './TaskCommentsSection';
import TaskManageSection from './TaskManageSection';
import ProgressEditor from './ui/ProgressEditor';
import DateRangeField from './ui/DateRangeField';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, touch } from '../theme';

function initialPercent(task) {
  if (!task) return 0;
  if (task.completed) return 100;
  const p = Number(task.percent_complete);
  return Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
}

const PRIORITY_KEYS = {
  Low: 'tasks.priority_low',
  Medium: 'tasks.priority_medium',
  High: 'tasks.priority_high',
};

function PriorityChipRow({ priorities, value, onChange, disabled, t, inline = false }) {
  return (
    <View style={[styles.prioritySection, inline && styles.prioritySectionInline]}>
      <Text style={[styles.priorityLabel, inline && styles.priorityLabelInline]}>
        {t('mobile.task_priority_label')}
      </Text>
      <View style={[styles.priorityRow, inline && styles.priorityRowInline]}>
        {priorities.map((level) => {
          const active = value === level;
          return (
            <PressableWithFade
              key={level}
              style={[
                styles.priorityChip,
                inline && styles.priorityChipInline,
                active && styles.priorityChipActive,
              ]}
              onPress={() => onChange(level)}
              disabled={disabled}
            >
              <Text
                style={[styles.priorityChipText, active && styles.priorityChipTextActive]}
                numberOfLines={1}
              >
                {t(PRIORITY_KEYS[level] || level)}
              </Text>
            </PressableWithFade>
          );
        })}
      </View>
    </View>
  );
}

export default function TaskDetailSheet({
  visible,
  task,
  project = null,
  phases = [],
  supabase = null,
  currentUserId = null,
  onClose,
  onSave,
  onCreate,
  loading = false,
  compact = false,
  mode = 'edit',
  defaultPhaseId = null,
  photoRefreshKey = 0,
  canAssignTasks = false,
  organizationName = '',
  currentUser = null,
  onTaskUpdated,
}) {
  const { t } = useTranslation();
  const isCreate = mode === 'create';
  const [text, setText] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [completionPercent, setCompletionPercent] = useState(0);
  const [startDate, setStartDate] = useState(null);
  const [dueDate, setDueDate] = useState(null);
  const [projectPhaseId, setProjectPhaseId] = useState(null);
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    if (!visible) return;
    if (isCreate) {
      setText('');
      setPriority('Medium');
      setCompletionPercent(0);
      setStartDate(null);
      setDueDate(null);
      setProjectPhaseId(defaultPhaseId || null);
      return;
    }
    if (!task) return;
    setText(task.text || '');
    setPriority(task.priority || 'Medium');
    setCompletionPercent(initialPercent(task));
    setStartDate(task.start_date || null);
    setDueDate(task.due_date || null);
    setProjectPhaseId(task.project_phase_id || null);
  }, [visible, task?.id, isCreate, defaultPhaseId]);

  useEffect(() => {
    if (!visible || isCreate || !task?.id || !supabase) {
      setPhotos([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchTaskPhotos(supabase, task.id);
        const withUrls = await attachTaskPhotoUrls(supabase, rows);
        if (!cancelled) setPhotos(withUrls);
      } catch {
        if (!cancelled) setPhotos([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, task?.id, supabase, photoRefreshKey, isCreate]);

  if (!isCreate && !task) return null;

  const priorities = ['Low', 'Medium', 'High'];

  const buildPayload = (overrides = {}) => {
    const base = {
      text: text.trim(),
      priority,
      start_date: startDate,
      due_date: dueDate,
      project_phase_id: projectPhaseId,
      percent_complete: completionPercent,
      completed: completionPercent >= 100,
      ...overrides,
    };
    return normalizeTaskProgressUpdate(base);
  };

  const saveDisabled = loading || !text.trim();

  const handleSave = () => {
    if (isCreate) {
      onCreate?.(buildPayload());
    } else {
      onSave?.(buildPayload());
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isCreate ? t('mobile.tasks_create_title') : t('mobile.task_edit_title', { defaultValue: 'Edit task' })}
      hideHeader={false}
      onPrimary={handleSave}
      primaryLabel={isCreate ? t('common.create') : t('common.save')}
      primaryDisabled={saveDisabled}
      primaryLoading={loading}
      snap={isCreate ? 'medium' : 'medium'}
      maxSnap="large"
      expandOnFocus
      stickyPrimary
      primaryPlacement="footer"
      closeVariant="minimal"
      closePosition="right"
      testID={isCreate ? 'task-create-sheet' : 'task-detail-sheet'}
    >
      <BottomSheet.Scroll>
        {isCreate ? (
          <>
            <Text variant="caption" style={styles.label}>
              {t('mobile.task_name_label')}
            </Text>
            <BottomSheet.Input
              style={styles.input}
              value={text}
              onChangeText={setText}
              editable={!loading}
              placeholder={t('mobile.task_name_placeholder')}
              placeholderTextColor={colors.textSubtle}
              testID="task-detail-title"
            />
          </>
        ) : (
        <View style={styles.titleRow}>
          <BottomSheet.Input
            style={styles.heroTitle}
            value={text}
            onChangeText={setText}
            editable={!loading}
            placeholder={t('mobile.task_name_placeholder')}
            placeholderTextColor={colors.textSubtle}
            multiline
            scrollEnabled={false}
            testID="task-detail-title"
          />
        </View>
        )}

        {!isCreate ? (
        <View style={styles.progressCard}>
          <ProgressEditor
            value={completionPercent}
            onChange={setCompletionPercent}
            showMarkComplete={false}
            detail
          />
        </View>
        ) : null}

        {photos.length > 0 || (!compact && !isCreate) || isCreate ? (
          <View style={[styles.metaRow, photos.length === 0 && styles.metaRowPriorityOnly]}>
            {photos.length > 0 ? (
              <View style={styles.photosCol}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {photos.map((photo) => {
                    const uri = photo.thumbnail_url || photo.full_url;
                    if (!uri) return null;
                    return (
                      <RemoteImage
                        key={photo.id}
                        uri={uri}
                        style={styles.photoThumb}
                        recyclingKey={`task-photo-${photo.id}`}
                        accessibilityLabel={t('mobile.task_photo_preview')}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {!compact && !isCreate ? (
              <View style={[styles.priorityCol, photos.length === 0 && styles.priorityColFull]}>
                <PriorityChipRow
                  priorities={priorities}
                  value={priority}
                  onChange={setPriority}
                  disabled={loading}
                  t={t}
                  inline={photos.length > 0}
                />
              </View>
            ) : null}

            {isCreate ? (
              <View style={styles.priorityColFull}>
                <PriorityChipRow
                  priorities={priorities}
                  value={priority}
                  onChange={setPriority}
                  disabled={loading}
                  t={t}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {phases.length > 0 ? (
          <View style={styles.phaseSection}>
            <Text style={styles.phaseLabel}>{t('mobile.task_phase')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.phaseRow}>
              <PressableWithFade
                style={[styles.phaseChip, projectPhaseId == null && styles.phaseChipActive]}
                onPress={() => setProjectPhaseId(null)}
                disabled={loading}
              >
                <Text
                  style={[styles.phaseChipText, projectPhaseId == null && styles.phaseChipTextActive]}
                  numberOfLines={1}
                >
                  {t('mobile.task_phase_unassigned')}
                </Text>
              </PressableWithFade>
              {phases.map((phase) => {
                const active = projectPhaseId === phase.id;
                return (
                  <PressableWithFade
                    key={phase.id}
                    style={[styles.phaseChip, active && styles.phaseChipActive]}
                    onPress={() => setProjectPhaseId(phase.id)}
                    disabled={loading}
                  >
                    <Text
                      style={[styles.phaseChipText, active && styles.phaseChipTextActive]}
                      numberOfLines={1}
                    >
                      {phase.name}
                    </Text>
                  </PressableWithFade>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <DateRangeField
          label={t('mobile.task_date_range')}
          startValue={startDate}
          endValue={dueDate}
          onChange={({ start_date, due_date }) => {
            setStartDate(start_date);
            setDueDate(due_date);
          }}
          placeholder={t('mobile.task_date_range_placeholder')}
          disabled={loading}
          active={visible}
          testID="task-date-range"
        />

        {!isCreate && canAssignTasks ? (
          <TaskManageSection
            task={task}
            project={project}
            supabase={supabase}
            currentUser={currentUser}
            organizationName={organizationName}
            canAssignTasks={canAssignTasks}
            onTaskUpdated={onTaskUpdated}
          />
        ) : null}

        {!isCreate && project && supabase && currentUserId && task ? (
          <View style={styles.commentsSection}>
            <TaskCommentsSection
              task={task}
              project={project}
              supabase={supabase}
              currentUserId={currentUserId}
            />
          </View>
        ) : null}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  heroTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    color: colors.text,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    margin: 0,
    textAlignVertical: 'top',
    includeFontPadding: false,
  },
  saveBtn: {
    minHeight: 32,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 26,
    color: colors.primary,
    includeFontPadding: false,
  },
  saveTextDisabled: { color: colors.textMuted },
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 17,
    minHeight: touch.minSize,
    color: colors.text,
    backgroundColor: colors.surface,
    textAlignVertical: 'center',
    marginBottom: spacing.md,
  },
  progressCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    minHeight: 56,
  },
  metaRowPriorityOnly: {
    minHeight: 0,
  },
  photosCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  prioritySection: {
    marginBottom: spacing.lg,
  },
  prioritySectionInline: {
    marginBottom: 0,
  },
  priorityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  priorityLabelInline: {
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  priorityCol: {
    flexShrink: 0,
    minWidth: 148,
    justifyContent: 'center',
  },
  priorityColFull: {
    flex: 1,
    minWidth: 0,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityRowInline: {
    gap: spacing.xs,
  },
  priorityChip: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityChipInline: {
    flex: 0,
    minWidth: 44,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
  },
  priorityChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  priorityChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    includeFontPadding: false,
  },
  priorityChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    marginRight: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  phaseSection: {
    marginBottom: spacing.xl,
  },
  phaseLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  phaseRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  phaseChip: {
    minHeight: touch.minSize,
    paddingHorizontal: spacing.md,
    borderRadius: touch.minSize / 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 180,
  },
  phaseChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  phaseChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    includeFontPadding: false,
  },
  phaseChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  dateCol: { flex: 1, minWidth: 0 },
  commentsSection: {
    marginTop: spacing.md,
  },
});
