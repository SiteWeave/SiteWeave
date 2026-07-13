import { View, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchTaskComments, createTaskComment } from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';
import { Text } from './ui/Text';
import { colors, spacing, touch } from '../theme';

export default function TaskCommentsSection({ task, project, supabase, currentUserId }) {
  const { t } = useTranslation();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

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
      });
      setBody('');
      await load();
    } catch (e) {
      console.error('TaskCommentsSection add error:', e);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text variant="bodyMedium" style={styles.heading}>
          {t('mobile.task_comments_heading')}
        </Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : comments.length === 0 ? (
          <Text variant="caption" style={styles.emptyTextInline}>
            {t('mobile.task_comments_empty')}
          </Text>
        ) : null}
      </View>

      {!loading && comments.length > 0
        ? comments.map((c) => (
            <View key={c.id} style={styles.comment}>
              <Text variant="caption" style={styles.meta}>
                {c.author?.name || t('mobile.stream_member_fallback')}
              </Text>
              <Text variant="body" style={styles.body}>{c.body}</Text>
            </View>
          ))
        : null}

      <TextInput
        style={styles.input}
        value={body}
        onChangeText={setBody}
        placeholder={t('mobile.task_comments_placeholder')}
        placeholderTextColor={colors.textSubtle}
      />
      <PressableWithFade
        style={[styles.addBtn, sending && styles.addBtnDisabled]}
        onPress={handleAdd}
        disabled={sending}
      >
        <Text style={styles.addBtnText}>
          {sending ? t('mobile.task_comments_adding') : t('mobile.task_comments_add')}
        </Text>
      </PressableWithFade>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 0 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  heading: { fontWeight: '600', color: colors.textSecondary, flexShrink: 1 },
  emptyTextInline: { color: colors.textSubtle, textAlign: 'right', flexShrink: 0 },
  comment: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  meta: { color: colors.textMuted, marginBottom: spacing.xs },
  body: { color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    minHeight: touch.minSize,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  addBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: colors.white, fontWeight: '700' },
});
