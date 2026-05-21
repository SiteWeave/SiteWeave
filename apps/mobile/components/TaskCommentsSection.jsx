import { View, Text, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import {
  fetchTaskComments,
  createTaskComment,
  canSetInternalVisibility,
} from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';

export default function TaskCommentsSection({ task, project, supabase, currentUserId, viewerOrgId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [sending, setSending] = useState(false);
  const canInternal = canSetInternalVisibility(
    { organization_id: viewerOrgId },
    project,
  );

  const load = useCallback(async () => {
    if (!task?.id || !supabase) return;
    try {
      const rows = await fetchTaskComments(supabase, task.id);
      setComments(rows);
    } catch (e) {
      console.error('TaskCommentsSection load error:', e);
    } finally {
      setLoading(false);
    }
  }, [task?.id, supabase]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Realtime: refresh on any comment change for this task
  useEffect(() => {
    if (!task?.id || !supabase) return;
    const ch = supabase
      .channel(`mobile_task_comments:${task.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
        () => load(),
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [task?.id, supabase, load]);

  const handleAdd = async () => {
    const trimmed = body.trim();
    if (!trimmed || !currentUserId || !project || !task) return;
    setSending(true);
    try {
      await createTaskComment(supabase, {
        task_id: task.id,
        project_id: project.id,
        organization_id: project.organization_id,
        author_id: currentUserId,
        body: trimmed,
        visibility: canInternal ? visibility : 'public',
      });
      setBody('');
      setVisibility('public');
      await load();
    } catch (e) {
      console.error('TaskCommentsSection add error:', e);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Task discussion</Text>

      {loading ? (
        <ActivityIndicator size="small" color="#9CA3AF" style={styles.spinner} />
      ) : comments.length === 0 ? (
        <Text style={styles.emptyText}>No comments yet.</Text>
      ) : (
        comments.map((c) => (
          <View
            key={c.id}
            style={[styles.comment, c.visibility === 'internal' && styles.commentInternal]}
          >
            <Text style={styles.meta}>
              {c.author?.name || 'Member'}
              {c.visibility === 'internal' ? (
                <Text style={styles.internalBadge}> · Internal</Text>
              ) : null}
            </Text>
            <Text style={styles.body}>{c.body}</Text>
          </View>
        ))
      )}

      {canInternal ? (
        <View style={styles.visRow}>
          <PressableWithFade
            style={[styles.visBtn, visibility === 'public' && styles.visBtnActive]}
            onPress={() => setVisibility('public')}
          >
            <Text style={[styles.visText, visibility === 'public' && styles.visTextActive]}>Public</Text>
          </PressableWithFade>
          <PressableWithFade
            style={[styles.visBtn, visibility === 'internal' && styles.visBtnActive]}
            onPress={() => setVisibility('internal')}
          >
            <Text style={[styles.visText, visibility === 'internal' && styles.visTextActive]}>Internal</Text>
          </PressableWithFade>
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        value={body}
        onChangeText={setBody}
        placeholder="Comment on this task…"
        placeholderTextColor="#9CA3AF"
      />
      <PressableWithFade style={[styles.addBtn, sending && styles.addBtnDisabled]} onPress={handleAdd} disabled={sending}>
        <Text style={styles.addBtnText}>{sending ? 'Adding…' : 'Add comment'}</Text>
      </PressableWithFade>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  heading: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 },
  spinner: { marginVertical: 12 },
  emptyText: { fontSize: 13, color: '#9CA3AF', marginBottom: 10 },
  comment: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 8 },
  commentInternal: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  meta: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  internalBadge: { color: '#92400E', fontWeight: '600' },
  body: { fontSize: 14, color: '#1F2937' },
  visRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  visBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },
  visBtnActive: { backgroundColor: '#111827' },
  visText: { fontSize: 12, color: '#4B5563' },
  visTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 8 },
  addBtn: { alignSelf: 'flex-end', backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
