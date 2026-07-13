import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, spacing, touch } from '../../theme';

export const MAX_VISIBLE_ITEMS = 5;

export function buildCollapsedList(items, selectedKeys, max = MAX_VISIBLE_ITEMS) {
  const selectedSet = new Set(
    Array.isArray(selectedKeys)
      ? selectedKeys.filter(Boolean)
      : selectedKeys != null && selectedKeys !== ''
        ? [selectedKeys]
        : [],
  );
  const getKey = (item) => item?.id ?? item?.email ?? item;
  const selected = items.filter((item) => selectedSet.has(getKey(item)));
  const rest = items.filter((item) => !selectedSet.has(getKey(item)));
  return [...selected, ...rest].slice(0, max);
}

export function useCollapsibleList(items, selectedKeys, { max = MAX_VISIBLE_ITEMS, collapseWhenHidden = true } = {}) {
  const [expanded, setExpanded] = useState(false);
  const options = useMemo(() => (items || []).filter(Boolean), [items]);
  const hasMore = options.length > max;

  useEffect(() => {
    if (!collapseWhenHidden) setExpanded(false);
  }, [collapseWhenHidden]);

  const displayedItems = useMemo(() => {
    if (expanded || !hasMore) return options;
    return buildCollapsedList(options, selectedKeys, max);
  }, [options, selectedKeys, expanded, hasMore, max]);

  const hiddenCount = hasMore && !expanded ? options.length - displayedItems.length : 0;

  return { options, displayedItems, expanded, setExpanded, hasMore, hiddenCount };
}

export function ShowMoreToggle({ expanded, hiddenCount, onPress, testID }) {
  const { t } = useTranslation();

  if (hiddenCount <= 0 && !expanded) return null;

  return (
    <PressableWithFade
      style={styles.toggle}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        expanded
          ? t('mobile.show_less')
          : t('mobile.show_more_count', { count: hiddenCount })
      }
    >
      <Text variant="bodyMedium" style={styles.toggleText}>
        {expanded
          ? t('mobile.show_less')
          : t('mobile.show_more_count', { count: hiddenCount })}
      </Text>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={18}
        color={colors.primary}
      />
    </PressableWithFade>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touch.minSize,
    marginTop: spacing.sm,
  },
  toggleText: { color: colors.primary, fontWeight: '600' },
});
