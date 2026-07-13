import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, spacing, touch } from '../../theme';
import {
  MAX_VISIBLE_ITEMS,
  buildCollapsedList,
  useCollapsibleList,
  ShowMoreToggle,
} from './CollapsibleList';

export const MAX_VISIBLE_PROJECTS = MAX_VISIBLE_ITEMS;

function projectLabel(project, fallback) {
  return project?.name || project?.title || fallback;
}

function useProjectPickerList(projects, selectedIds, collapseWhenHidden) {
  const [expanded, setExpanded] = useState(false);
  const options = useMemo(() => projects.filter((project) => project?.id), [projects]);
  const hasMore = options.length > MAX_VISIBLE_PROJECTS;

  useEffect(() => {
    if (!collapseWhenHidden) setExpanded(false);
  }, [collapseWhenHidden]);

  const displayedProjects = useMemo(() => {
    if (expanded || !hasMore) return options;
    return buildCollapsedList(options, selectedIds, MAX_VISIBLE_PROJECTS);
  }, [options, selectedIds, expanded, hasMore]);

  return { options, displayedProjects, expanded, setExpanded, hasMore };
}

function ProjectShowMoreToggle({ expanded, hiddenCount, onPress, testID }) {
  const { t } = useTranslation();

  if (hiddenCount <= 0) return null;

  return (
    <PressableWithFade
      style={styles.toggle}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        expanded
          ? t('mobile.project_picker_show_less')
          : t('mobile.project_picker_show_all', { count: hiddenCount })
      }
    >
      <Text variant="bodyMedium" style={styles.toggleText}>
        {expanded
          ? t('mobile.project_picker_show_less')
          : t('mobile.project_picker_show_all', { count: hiddenCount })}
      </Text>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={18}
        color={colors.primary}
      />
    </PressableWithFade>
  );
}

export function ProjectChipPicker({
  projects = [],
  selectedId,
  onSelect,
  disabled = false,
  collapseWhenHidden = true,
  hideWhenSingle = true,
  testID = 'project-chip-picker',
}) {
  const { t } = useTranslation();
  const { options, displayedProjects, expanded, setExpanded, hasMore } = useProjectPickerList(
    projects,
    selectedId,
    collapseWhenHidden,
  );

  if (hideWhenSingle && options.length <= 1) return null;

  const hiddenCount = hasMore && !expanded ? options.length - displayedProjects.length : 0;

  return (
    <View testID={testID}>
      <View style={styles.chipRow}>
        {displayedProjects.map((project) => {
          const active = selectedId === project.id;
          return (
            <PressableWithFade
              key={project.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelect?.(project.id)}
              disabled={disabled}
              testID={`${testID}-chip-${project.id}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {projectLabel(project, t('mobile.unnamed_project'))}
              </Text>
            </PressableWithFade>
          );
        })}
      </View>
      {hasMore ? (
        <ProjectShowMoreToggle
          expanded={expanded}
          hiddenCount={hiddenCount}
          onPress={() => setExpanded((value) => !value)}
          testID={`${testID}-toggle`}
        />
      ) : null}
    </View>
  );
}

export function ProjectCheckboxList({
  projects = [],
  selectedIds = [],
  onToggle,
  disabled = false,
  collapseWhenHidden = true,
  testID = 'project-checkbox-list',
}) {
  const { t } = useTranslation();
  const { options, displayedProjects, expanded, setExpanded, hasMore } = useProjectPickerList(
    projects,
    selectedIds,
    collapseWhenHidden,
  );

  if (options.length === 0) return null;

  const hiddenCount = hasMore && !expanded ? options.length - displayedProjects.length : 0;

  return (
    <View testID={testID}>
      {displayedProjects.map((project) => {
        const selected = selectedIds.includes(project.id);
        return (
          <PressableWithFade
            key={project.id}
            style={[styles.projectRow, selected && styles.projectRowActive]}
            onPress={() => onToggle?.(project.id)}
            disabled={disabled}
            testID={`${testID}-row-${project.id}`}
          >
            <Ionicons
              name={selected ? 'checkbox' : 'square-outline'}
              size={24}
              color={selected ? colors.primary : colors.textMuted}
            />
            <Text variant="body" style={styles.projectName}>
              {projectLabel(project, t('mobile.unnamed_project'))}
            </Text>
          </PressableWithFade>
        );
      })}
      {hasMore ? (
        <ProjectShowMoreToggle
          expanded={expanded}
          hiddenCount={hiddenCount}
          onPress={() => setExpanded((value) => !value)}
          testID={`${testID}-toggle`}
        />
      ) : null}
    </View>
  );
}

export function ProjectSelectList({
  projects = [],
  selectedId,
  onSelect,
  disabled = false,
  collapseWhenHidden = true,
  testID = 'project-select-list',
}) {
  const { t } = useTranslation();
  const { options, displayedProjects, expanded, setExpanded, hasMore } = useProjectPickerList(
    projects,
    selectedId,
    collapseWhenHidden,
  );

  if (options.length === 0) {
    return (
      <Text variant="bodyMedium" style={styles.emptyText}>
        {t('mobile.project_picker_empty')}
      </Text>
    );
  }

  const hiddenCount = hasMore && !expanded ? options.length - displayedProjects.length : 0;

  return (
    <View testID={testID}>
      {displayedProjects.map((project) => {
        const active = selectedId === project.id;
        return (
          <PressableWithFade
            key={project.id}
            style={[styles.selectRow, active && styles.selectRowActive]}
            onPress={() => onSelect?.(project.id)}
            disabled={disabled}
            testID={`${testID}-row-${project.id}`}
          >
            <Text style={[styles.selectRowText, active && styles.selectRowTextActive]} numberOfLines={1}>
              {projectLabel(project, t('mobile.unnamed_project'))}
            </Text>
            {active ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
          </PressableWithFade>
        );
      })}
      {hasMore ? (
        <ProjectShowMoreToggle
          expanded={expanded}
          hiddenCount={hiddenCount}
          onPress={() => setExpanded((value) => !value)}
          testID={`${testID}-toggle`}
        />
      ) : null}
    </View>
  );
}

export { useCollapsibleList, ShowMoreToggle, MAX_VISIBLE_ITEMS };

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    maxWidth: '100%',
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.minRowHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceMuted,
  },
  projectRowActive: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  projectName: { flex: 1 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touch.minSize,
    marginTop: spacing.sm,
  },
  toggleText: { color: colors.primary, fontWeight: '600' },
  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
    minHeight: touch.minSize,
  },
  selectRowActive: { backgroundColor: colors.primaryLight },
  selectRowText: { fontSize: 16, color: colors.text, flex: 1, marginRight: spacing.sm },
  selectRowTextActive: { color: colors.primary, fontWeight: '600' },
  emptyText: { color: colors.textMuted, padding: spacing.md },
});
