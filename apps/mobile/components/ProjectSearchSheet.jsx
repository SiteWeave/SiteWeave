import { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import BottomSheet from './ui/BottomSheet';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, touch } from '../theme';

export default function ProjectSearchSheet({
  visible,
  onClose,
  projectName,
  tasks = [],
  issues = [],
  onSelectTask,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    tasks.forEach((task) => {
      if ((task.text || '').toLowerCase().includes(q)) {
        out.push({ type: 'task', id: task.id, title: task.text, subtitle: projectName });
      }
    });
    issues.forEach((issue) => {
      if ((issue.title || '').toLowerCase().includes(q)) {
        out.push({ type: 'issue', id: issue.id, title: issue.title, subtitle: projectName });
      }
    });
    return out.slice(0, 20);
  }, [query, tasks, issues, projectName]);

  const handleSelect = (item) => {
    onClose?.();
    if (item.type === 'task') {
      const task = tasks.find((row) => row.id === item.id);
      if (task) onSelectTask?.(task);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.project_search_placeholder')}
      onClose={onClose}
      snap="medium"
      expandOnFocus
      testID="project-search-sheet"
    >
      <BottomSheet.Scroll>
        <BottomSheet.Input
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={t('mobile.project_search_placeholder')}
          placeholderTextColor={colors.textSubtle}
          autoFocus
          testID="project-search-input"
        />
        {results.map((item) => (
          <PressableWithFade
            key={`${item.type}-${item.id}`}
            style={styles.row}
            onPress={() => handleSelect(item)}
          >
            <Text variant="bodyMedium" style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text variant="caption" style={styles.sub}>
              {item.type}
            </Text>
          </PressableWithFade>
        ))}
        {query.trim() && results.length === 0 ? (
          <Text variant="body" style={styles.empty}>
            {t('mobile.search_no_results')}
          </Text>
        ) : null}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.md,
  },
  row: {
    minHeight: touch.minRowHeight,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontWeight: '600', color: colors.text },
  sub: { color: colors.textSubtle, marginTop: 2, textTransform: 'capitalize' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
