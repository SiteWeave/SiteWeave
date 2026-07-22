import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import {
  fetchStreamPosts,
  createStreamPost,
  fetchStreamReplies,
  createStreamReply,
  STREAM_POST_TYPES,
} from '@siteweave/core-logic';
import { formatStreamTimestamp } from '@siteweave/i18n';
import DailyLogStreamBody from './DailyLogStreamBody';
import PressableWithFade from './PressableWithFade';
import PanelEmptyState from './PanelEmptyState';
import { Text } from './ui/Text';
import { SkeletonCard } from './ui/Skeleton';
import { useBranding } from '../context/BrandingContext';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing, radius, touch } from '../theme';

const TYPE_LABELS = Object.fromEntries(STREAM_POST_TYPES.map((t) => [t.value, t.label]));

export default function ProjectStreamPanel({
  project,
  supabase,
  currentUserId,
  listHeaderExtra = null,
  contentPaddingBottom = spacing.lg,
  canPost = true,
}) {
  const { t, i18n } = useTranslation();
  const { primaryColor } = useBranding();
  const haptics = useHaptics();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [body, setBody] = useState('');
  const [viewFilter, setViewFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState(null);
  const [replies, setReplies] = useState({});
  const [replyDraft, setReplyDraft] = useState('');
  const composerRef = useRef(null);
  const searchRef = useRef('');

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    searchRef.current = debouncedSearch;
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    if (!project?.id || !supabase) return;
    try {
      setError(null);
      const { posts: rows } = await fetchStreamPosts(supabase, project.id, {
        search: searchRef.current || undefined,
      });
      setPosts(rows);
    } catch (e) {
      console.error('ProjectStreamPanel load error:', e);
      setError(t('mobile.stream_load_error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [project?.id, supabase, t]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, debouncedSearch]);

  useEffect(() => {
    if (!project?.id || !supabase) return;
    const ch = supabase
      .channel(`mobile_stream:${project.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_stream_posts', filter: `project_id=eq.${project.id}` },
        () => load(),
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [project?.id, supabase, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const filterOptions = useMemo(
    () => [{ value: 'all', label: t('mobile.stream_filter_all') }, ...STREAM_POST_TYPES],
    [t],
  );

  const composePostType = viewFilter === 'all' ? 'general' : viewFilter;

  const filteredPosts = useMemo(() => {
    if (viewFilter === 'all') return posts;
    return posts.filter((post) => post.post_type === viewFilter);
  }, [posts, viewFilter]);

  const handlePost = async () => {
    const trimmed = body.trim();
    if (!canPost || !trimmed || !currentUserId || !project) return;
    setSending(true);
    try {
      await createStreamPost(supabase, {
        project_id: project.id,
        organization_id: project.organization_id,
        author_id: currentUserId,
        post_type: composePostType,
        body: trimmed,
      });
      setBody('');
      haptics.success();
      await load();
    } catch (e) {
      console.error('ProjectStreamPanel post error:', e);
      haptics.error();
    } finally {
      setSending(false);
    }
  };

  const loadReplies = async (postId) => {
    try {
      const rows = await fetchStreamReplies(supabase, postId);
      setReplies((prev) => ({ ...prev, [postId]: rows }));
    } catch (e) {
      console.error('loadReplies error:', e);
    }
  };

  const toggleReplies = async (postId) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }
    setExpandedPostId(postId);
    await loadReplies(postId);
  };

  const submitReply = async (postId) => {
    const trimmed = replyDraft.trim();
    if (!trimmed || !currentUserId || !project) return;
    try {
      await createStreamReply(supabase, {
        post_id: postId,
        organization_id: project.organization_id,
        author_id: currentUserId,
        body: trimmed,
      });
      setReplyDraft('');
      haptics.light();
      await loadReplies(postId);
      await load();
    } catch (e) {
      console.error('submitReply error:', e);
      haptics.error();
    }
  };

  const composerHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        {listHeaderExtra}
        {error ? (
          <PressableWithFade onPress={load} style={styles.errorBox}>
            <Text variant="caption" style={styles.errorText}>
              {error}
            </Text>
          </PressableWithFade>
        ) : null}
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('mobile.stream_search_placeholder')}
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          testID="stream-search"
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterOptions}
          keyExtractor={(item) => item.value}
          style={styles.typeRow}
          renderItem={({ item }) => (
            <PressableWithFade
              style={[
                styles.typeChip,
                viewFilter === item.value && { backgroundColor: primaryColor },
              ]}
              onPress={() => setViewFilter(item.value)}
              testID={`stream-filter-${item.value}`}
            >
              <Text
                style={[
                  styles.typeChipText,
                  viewFilter === item.value && styles.typeChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </PressableWithFade>
          )}
        />
        {canPost ? (
          <>
            <TextInput
              ref={composerRef}
              style={styles.composer}
              value={body}
              onChangeText={setBody}
              placeholder={t('mobile.stream_composer_placeholder')}
              multiline
              placeholderTextColor={colors.textSubtle}
            />
            <Text variant="caption" style={styles.visibilityHint}>
              {t('mobile.stream_visibility_hint')}
            </Text>
            <View style={styles.composerFooter}>
              <PressableWithFade
                style={[
                  styles.postBtn,
                  { backgroundColor: primaryColor },
                  (sending || !body.trim()) && styles.postBtnDisabled,
                ]}
                onPress={handlePost}
                disabled={sending || !body.trim()}
                testID="stream-post-button"
              >
                {sending ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text variant="caption" style={styles.postBtnText}>
                    {t('mobile.stream_post')}
                  </Text>
                )}
              </PressableWithFade>
            </View>
          </>
        ) : (
          <Text variant="caption" style={styles.blockedHint}>
            {t('mobile.stream_composer_blocked')}
          </Text>
        )}
      </View>
    ),
    [listHeaderExtra, error, viewFilter, body, sending, primaryColor, t, load, filterOptions, canPost, searchQuery],
  );

  const renderPost = ({ item: post, index }) => {
    const replyCount = post.reply_count || 0;
    const expanded = expandedPostId === post.id;
    const isLast = index === filteredPosts.length - 1;
    return (
      <View style={[styles.postRow, isLast && styles.postRowLast]}>
        <Text variant="caption" style={styles.cardType}>
          {TYPE_LABELS[post.post_type] || post.post_type}
        </Text>
        {post.title ? (
          <Text variant="bodyMedium" style={styles.cardTitle}>
            {post.title}
          </Text>
        ) : null}
        {post.post_type === 'daily_log' && post.payload?.sections ? (
          <DailyLogStreamBody post={post} compact />
        ) : (
          <Text variant="body" style={styles.cardBody}>
            {post.body}
          </Text>
        )}
        <Text variant="caption" style={styles.cardMeta}>
          {post.author?.name || t('mobile.stream_member_fallback')} ·{' '}
          {formatStreamTimestamp(post.created_at, i18n.language)}
        </Text>
        <PressableWithFade
          style={styles.replyLinkBtn}
          onPress={() => toggleReplies(post.id)}
          testID={`stream-toggle-replies-${post.id}`}
        >
          <Text variant="caption" style={styles.replyLink}>
            {expanded ? t('mobile.stream_hide_replies') : t('mobile.stream_view_replies', { count: replyCount })}
          </Text>
        </PressableWithFade>
        {expanded ? (
          <View style={styles.replyBox}>
            {(replies[post.id] || []).map((r) => (
              <View key={r.id} style={styles.replyItem}>
                <Text variant="caption" style={styles.replyMeta}>
                  {r.author?.name || t('mobile.stream_member_fallback')}
                </Text>
                <Text variant="body" style={styles.replyBody}>
                  {r.body}
                </Text>
              </View>
            ))}
            <TextInput
              style={styles.replyInput}
              value={replyDraft}
              onChangeText={setReplyDraft}
              placeholder={t('mobile.stream_reply_placeholder')}
              placeholderTextColor={colors.textSubtle}
            />
            <PressableWithFade
              style={[styles.replyBtn, { backgroundColor: primaryColor }]}
              onPress={() => submitReply(post.id)}
              disabled={!replyDraft.trim()}
            >
              <Text variant="caption" style={styles.replyBtnText}>
                {t('mobile.stream_reply')}
              </Text>
            </PressableWithFade>
          </View>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.skeletonPosts}>
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} height={112} style={styles.skeletonPost} />
        ))}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <FlatList
        style={styles.container}
        data={filteredPosts}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPost}
        ListHeaderComponent={composerHeader}
        ListEmptyComponent={
          debouncedSearch ? (
            <PanelEmptyState
              icon="search-outline"
              title={t('mobile.stream_no_search_results')}
              testID="stream-search-empty"
            />
          ) : (
            <PanelEmptyState
              icon="chatbubbles-outline"
              title={t('mobile.stream_empty')}
              hint={t('mobile.stream_empty_hint')}
              ctaLabel={canPost ? t('mobile.stream_empty_cta') : undefined}
              onCta={canPost ? () => composerRef.current?.focus?.() : undefined}
              testID="stream-empty-post"
            />
          )
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexGrow: 1,
  },
  headerBlock: { gap: spacing.sm, marginBottom: spacing.md },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  skeletonPosts: { padding: spacing.md, gap: spacing.md, flex: 1 },
  skeletonPost: { marginBottom: spacing.sm },
  heading: { marginBottom: spacing.xs },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: radius.card,
    padding: spacing.md,
  },
  errorText: { color: colors.error, textAlign: 'center' },
  emptyText: { textAlign: 'center', color: colors.textSubtle, marginTop: spacing.xl },
  typeRow: { maxHeight: 40, marginBottom: spacing.xs },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    marginRight: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  typeChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  typeChipTextActive: { color: colors.white },
  composer: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.card,
    padding: spacing.md,
    minHeight: 88,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  composerFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  postBtn: {
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 72,
  },
  postBtnDisabled: { opacity: 0.45 },
  postBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  visibilityHint: { color: colors.textSubtle, marginBottom: spacing.sm },
  blockedHint: { color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18 },
  postRow: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  postRowLast: {
    borderBottomWidth: 0,
  },
  cardType: {
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  cardTitle: { fontWeight: '700', marginBottom: spacing.xs },
  cardBody: { lineHeight: 22, marginBottom: spacing.sm },
  cardMeta: { color: colors.textSubtle },
  replyLinkBtn: { marginTop: spacing.sm, minHeight: touch.minSize, justifyContent: 'center' },
  replyLink: { fontWeight: '700', color: colors.textMuted },
  replyBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  replyItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  replyMeta: { color: colors.textMuted, marginBottom: spacing.xs },
  replyBody: { color: colors.text },
  replyInput: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.card,
    padding: spacing.md,
    fontSize: 14,
    marginTop: spacing.xs,
    minHeight: touch.minRowHeight,
  },
  replyBtn: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  replyBtnText: { color: colors.white, fontWeight: '700' },
});
