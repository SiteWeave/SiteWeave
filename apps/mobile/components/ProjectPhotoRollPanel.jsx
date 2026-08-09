import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Modal, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { fetchProjectPhotoRoll } from '@siteweave/core-logic';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import RemoteImage from './RemoteImage';
import { colors, spacing, radius } from '../theme';
import { SkeletonList } from './ui/Skeleton';
import { useScrollPrefetch } from '../hooks/useScrollPrefetch';
import { prefetchRemoteImages } from '../utils/prefetchIntent';

const FILTERS = [
  { id: 'all', sources: null },
  { id: 'tasks', sources: ['task'] },
  { id: 'site_day', sources: ['site_day'] },
  { id: 'issues', sources: ['issue'] },
];

export default function ProjectPhotoRollPanel({
  projectId,
  supabase,
  contentPaddingBottom = 0,
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    if (!supabase || !projectId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchProjectPhotoRoll(supabase, projectId, { limit: 120 });
      setItems(rows);
    } catch (err) {
      console.error('ProjectPhotoRollPanel load failed:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const def = FILTERS.find((f) => f.id === filter);
    if (!def?.sources) return items;
    return items.filter((row) => def.sources.includes(row.source));
  }, [items, filter]);

  const onScrollPrefetch = useScrollPrefetch(() => {
    prefetchRemoteImages(visibleItems.map((row) => row.full_url || row.thumbnail_url));
  });

  if (loading) {
    return (
      <View style={[styles.wrap, { paddingBottom: contentPaddingBottom }]}>
        <SkeletonList count={4} rowHeight={100} />
      </View>
    );
  }

  return (
    <>
      <FlashList
        data={visibleItems}
        keyExtractor={(item) => String(item.id)}
        numColumns={3}
        contentContainerStyle={[styles.list, { paddingBottom: contentPaddingBottom }]}
        onScroll={onScrollPrefetch}
        scrollEventThrottle={400}
        ListHeaderComponent={
          <View style={styles.filterRow}>
            {FILTERS.map((f) => (
              <PressableWithFade
                key={f.id}
                style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
                onPress={() => setFilter(f.id)}
              >
                <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
                  {t(`mobile.photo_roll_filter_${f.id === 'site_day' ? 'site_day' : f.id}`)}
                </Text>
              </PressableWithFade>
            ))}
          </View>
        }
        ListEmptyComponent={
          <Text variant="body" style={styles.empty}>
            {t('mobile.photo_roll_empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <PressableWithFade style={styles.thumbWrap} onPress={() => setViewer(item)} static>
            <RemoteImage
              uri={item.thumbnail_url || item.full_url}
              style={styles.thumb}
              recyclingKey={`photo-roll-${item.id}`}
            />
          </PressableWithFade>
        )}
        testID="project-photo-roll-panel"
      />
      <Modal visible={Boolean(viewer)} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
          {viewer ? (
            <RemoteImage
              uri={viewer.full_url || viewer.thumbnail_url}
              style={styles.viewerImage}
              contentFit="contain"
              recyclingKey={`photo-viewer-${viewer.id}`}
            />
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg },
  list: { padding: spacing.lg },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  filterText: { fontWeight: '600', color: colors.textMuted, fontSize: 12 },
  filterTextActive: { color: colors.primary },
  thumbWrap: { flex: 1, aspectRatio: 1, margin: spacing.xs / 2, maxWidth: '33%' },
  thumb: { width: '100%', height: '100%', borderRadius: radius.card, backgroundColor: colors.surfaceMuted },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  viewerImage: { width: '100%', height: '80%' },
});
