import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '@siteweave/i18n';
import { fetchStreamReplies, createStreamReply } from '@siteweave/core-logic';
import { upsertById, removeById } from '@siteweave/core-logic';
import { useToast } from '../../context/ToastContext';
import { SkeletonRow } from '../ui/Skeleton';
import Avatar from '../Avatar';

export default function StreamReplyThread({
  postId,
  project,
  currentUserId,
  supabaseClient,
  onReplyPosted,
}) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [replies, setReplies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [body, setBody] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const inputRef = React.useRef(null);

  const load = React.useCallback(async () => {
    try {
      const rows = await fetchStreamReplies(supabaseClient, postId);
      setReplies(rows);
    } catch (e) {
      console.error(e);
      addToast(t('stream.replies_load_error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [postId, supabaseClient, addToast, t]);

  React.useEffect(() => {
    setLoading(true);
    load();
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [load]);

  React.useEffect(() => {
    const channel = supabaseClient
      .channel(`stream_replies:${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_stream_replies',
          filter: `post_id=eq.${postId}`,
        },
        async (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          try {
            const rows = await fetchStreamReplies(supabaseClient, postId);
            const match = rows.find((r) => r.id === row.id);
            if (match) setReplies((prev) => upsertById(prev, match, 'append'));
          } catch {
            load();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'project_stream_replies',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          const id = payload.old?.id;
          if (id) setReplies((prev) => removeById(prev, id));
        },
      )
      .subscribe();
    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [postId, supabaseClient, load]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || !currentUserId || !project || sending) return;
    setSending(true);
    try {
      const newReply = await createStreamReply(supabaseClient, {
        post_id: postId,
        organization_id: project.organization_id,
        author_id: currentUserId,
        body: trimmed,
      });
      setBody('');
      setReplies((prev) => upsertById(prev, newReply, 'append'));
      onReplyPosted?.();
    } catch (err) {
      console.error(err);
      addToast(err.message || t('fieldIssues.comment_post_error'), 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 pl-2">
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <SkeletonRow key={i} className="h-12" />
          ))}
        </div>
      ) : replies.length === 0 ? (
        <p className="text-xs italic text-slate-400">{t('stream.be_first_reply')}</p>
      ) : (
        replies.map((reply) => (
          <div key={reply.id} className="flex gap-2.5">
            <Avatar
              name={reply.author?.name}
              avatarUrl={reply.author?.avatar_url}
              size="sm"
              className="mt-0.5 shrink-0 bg-slate-200"
            />
            <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <p className="mb-0.5 text-[11px] text-slate-500">
                <span className="font-medium text-slate-700">{reply.author?.name || t('stream.team_member')}</span>
                <span className="mx-1 text-slate-300">·</span>
                {formatRelativeTime(reply.created_at, t)}
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-800">{reply.body}</p>
            </div>
          </div>
        ))
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
        <input
          ref={inputRef}
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('stream.reply_placeholder')}
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
        >
          {sending ? '…' : t('stream.reply')}
        </button>
      </form>
    </div>
  );
}
