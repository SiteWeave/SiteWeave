import { View, Text, StyleSheet, TextInput, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import {
  fetchStreamPosts,
  createStreamPost,
  fetchStreamReplies,
  createStreamReply,
  STREAM_POST_TYPES,
} from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';

const TYPE_LABELS = Object.fromEntries(STREAM_POST_TYPES.map((t) => [t.value, t.label]));

export default function ProjectStreamPanel({ project, supabase, currentUserId }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [body, setBody] = useState('');
  const [postType, setPostType] = useState('general');
  const [sending, setSending] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState(null);
  const [replies, setReplies] = useState({});
  const [replyDraft, setReplyDraft] = useState('');

  const load = useCallback(async () => {
    if (!project?.id || !supabase) return;
    try {
      setError(null);
      const rows = await fetchStreamPosts(supabase, project.id);
      setPosts(rows);
    } catch (e) {
      console.error('ProjectStreamPanel load error:', e);
      setError('Could not load stream. Pull down to retry.');
    } finally {
      setLoading(false);
    }
  }, [project?.id, supabase]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

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

  const handlePost = async () => {
    const trimmed = body.trim();
    if (!trimmed || !currentUserId || !project) return;
    setSending(true);
    try {
      await createStreamPost(supabase, {
        project_id: project.id,
        organization_id: project.organization_id,
        author_id: currentUserId,
        post_type: postType,
        body: trimmed,
      });
      setBody('');
      setPostType('general');
      await load();
    } catch (e) {
      console.error('ProjectStreamPanel post error:', e);
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
      await loadReplies(postId);
      await load();
    } catch (e) {
      console.error('submitReply error:', e);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color="#6B7280" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Project stream</Text>

      {error ? (
        <PressableWithFade onPress={load} style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </PressableWithFade>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
        {STREAM_POST_TYPES.map((t) => (
          <PressableWithFade
            key={t.value}
            style={[styles.typeChip, postType === t.value && styles.typeChipActive]}
            onPress={() => setPostType(t.value)}
          >
            <Text style={[styles.typeChipText, postType === t.value && styles.typeChipTextActive]}>{t.label}</Text>
          </PressableWithFade>
        ))}
      </ScrollView>
      <TextInput
        style={styles.composer}
        value={body}
        onChangeText={setBody}
        placeholder="Share a project update…"
        multiline
        placeholderTextColor="#9CA3AF"
      />
      <PressableWithFade style={[styles.postBtn, sending && styles.postBtnDisabled]} onPress={handlePost} disabled={sending}>
        <Text style={styles.postBtnText}>{sending ? 'Posting…' : 'Post'}</Text>
      </PressableWithFade>

      {posts.length === 0 ? (
        <Text style={styles.emptyText}>No posts yet. Share the first project update.</Text>
      ) : null}

      {posts.map((post) => (
        <View key={post.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardType}>{TYPE_LABELS[post.post_type] || post.post_type}</Text>
          </View>
          {post.title ? <Text style={styles.cardTitle}>{post.title}</Text> : null}
          <Text style={styles.cardBody}>{post.body}</Text>
          <Text style={styles.cardMeta}>
            {post.author?.name || 'Member'} · {new Date(post.created_at).toLocaleString()}
          </Text>
          <Pressable onPress={() => toggleReplies(post.id)}>
            <Text style={styles.replyLink}>
              {expandedPostId === post.id ? 'Hide' : 'View'} {post.reply_count || 0}{' '}
              {(post.reply_count || 0) === 1 ? 'reply' : 'replies'}
            </Text>
          </Pressable>
          {expandedPostId === post.id ? (
            <View style={styles.replyBox}>
              {(replies[post.id] || []).map((r) => (
                <View key={r.id} style={styles.replyItem}>
                  <Text style={styles.replyMeta}>{r.author?.name || 'Member'}</Text>
                  <Text style={styles.replyBody}>{r.body}</Text>
                </View>
              ))}
              <TextInput
                style={styles.replyInput}
                value={replyDraft}
                onChangeText={setReplyDraft}
                placeholder="Reply…"
                placeholderTextColor="#9CA3AF"
              />
              <PressableWithFade style={styles.replyBtn} onPress={() => submitReply(post.id)}>
                <Text style={styles.replyBtnText}>Reply</Text>
              </PressableWithFade>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  heading: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 12 },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 13, color: '#B91C1C', textAlign: 'center' },
  emptyText: { textAlign: 'center', fontSize: 14, color: '#9CA3AF', marginTop: 24 },
  typeRow: { marginBottom: 8, maxHeight: 36 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F3F4F6', marginRight: 8 },
  typeChipActive: { backgroundColor: '#111827' },
  typeChipText: { fontSize: 12, color: '#4B5563' },
  typeChipTextActive: { color: '#fff' },
  composer: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, minHeight: 80, fontSize: 15, color: '#111827', marginBottom: 8 },
  postBtn: { alignSelf: 'flex-end', backgroundColor: '#111827', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginBottom: 20 },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 16, marginBottom: 12 },
  cardHeader: { marginBottom: 6 },
  cardType: { fontSize: 11, fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 6 },
  cardBody: { fontSize: 15, color: '#1F2937', lineHeight: 22, marginBottom: 8 },
  cardMeta: { fontSize: 12, color: '#9CA3AF' },
  replyLink: { marginTop: 10, fontSize: 13, fontWeight: '600', color: '#4B5563' },
  replyBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  replyItem: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 8 },
  replyMeta: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  replyBody: { fontSize: 14, color: '#374151' },
  replyInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, fontSize: 14, marginTop: 4 },
  replyBtn: { alignSelf: 'flex-end', marginTop: 8, backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  replyBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
