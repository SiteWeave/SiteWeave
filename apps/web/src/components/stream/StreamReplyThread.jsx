import React from 'react';
import { fetchStreamReplies, createStreamReply } from '@siteweave/core-logic';
import { upsertById, removeById } from '@siteweave/core-logic';
import { useToast } from '../../context/ToastContext';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMins = Math.floor((now - d) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric' });
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export default function StreamReplyThread({
  postId,
  project,
  currentUserId,
  supabaseClient,
  onReplyPosted,
}) {
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
      addToast('Could not load replies.', 'error');
    } finally {
      setLoading(false);
    }
  }, [postId, supabaseClient, addToast]);

  React.useEffect(() => {
    setLoading(true);
    load();
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
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
      addToast(err.message || 'Failed to post reply.', 'error');
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
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : replies.length === 0 ? (
        <p className="text-xs italic text-slate-400">Be the first to reply.</p>
      ) : (
        replies.map((reply) => (
          <div key={reply.id} className="flex gap-2.5">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
              {reply.author?.avatar_url ? (
                <img src={reply.author.avatar_url} alt={reply.author.name} className="h-6 w-6 rounded-full object-cover" />
              ) : (
                initials(reply.author?.name)
              )}
            </span>
            <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <p className="mb-0.5 text-[11px] text-slate-500">
                <span className="font-medium text-slate-700">{reply.author?.name || 'Team member'}</span>
                <span className="mx-1 text-slate-300">·</span>
                {formatWhen(reply.created_at)}
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
          placeholder="Reply… (Enter to send)"
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
        >
          {sending ? '…' : 'Reply'}
        </button>
      </form>
    </div>
  );
}
