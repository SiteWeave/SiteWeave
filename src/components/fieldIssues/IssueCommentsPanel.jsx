import React from 'react';
import {
  fetchIssueComments,
  createIssueComment,
  deleteIssueComment,
} from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import ReportContentModal from '../moderation/ReportContentModal';

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

export default function IssueCommentsPanel({ issue, organizationId }) {
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [comments, setComments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [body, setBody] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState(null);

  const userName =
    state.user?.user_metadata?.full_name || state.user?.email || 'User';

  const load = React.useCallback(async () => {
    if (!issue?.id) return;
    try {
      setLoading(true);
      const rows = await fetchIssueComments(supabaseClient, issue.id);
      setComments(rows);
    } catch (e) {
      console.error(e);
      addToast('Could not load comments.', 'error');
    } finally {
      setLoading(false);
    }
  }, [issue?.id, addToast]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!issue?.id) return;
    const ch = supabaseClient
      .channel(`issue_comments:${issue.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'issue_comments',
          filter: `issue_id=eq.${issue.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => supabaseClient.removeChannel(ch);
  }, [issue?.id, load]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || !state.user?.id) return;
    setSending(true);
    try {
      const row = await createIssueComment(supabaseClient, {
        issue_id: issue.id,
        organization_id: organizationId,
        user_id: state.user.id,
        user_name: userName,
        comment: text,
      });
      setComments((prev) => [...prev, row]);
      setBody('');
    } catch (err) {
      addToast(err.message || 'Could not post comment.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId) => {
    try {
      await deleteIssueComment(supabaseClient, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      addToast(err.message || 'Could not delete comment.', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Discussion</h4>
      {loading ? (
        <p className="text-xs text-slate-500">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-slate-500">No comments yet.</p>
      ) : (
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {comments.map((c) => {
            const authorName = c.author?.name || c.user_name || 'User';
            const isOwn = c.user_id === state.user?.id;
            return (
              <li key={c.id} className="flex gap-2 text-sm">
                <span className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                  {initials(authorName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-xs">{authorName}</span>
                    <span className="text-[10px] text-slate-400">{formatWhen(c.created_at)}</span>
                    {isOwn ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="text-[10px] text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setReportTarget({
                            contentType: 'issue_comment',
                            contentId: String(c.id),
                            reportedUserId: c.user_id,
                          })
                        }
                        className="text-[10px] text-slate-500 hover:underline"
                      >
                        Report
                      </button>
                    )}
                  </div>
                  <p className="text-slate-700 text-xs whitespace-pre-wrap">{c.comment}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!body.trim() || sending}
          className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg disabled:opacity-50"
        >
          {sending ? '…' : 'Post'}
        </button>
      </form>

      {reportTarget ? (
        <ReportContentModal
          show
          onClose={() => setReportTarget(null)}
          contentType={reportTarget.contentType}
          contentId={reportTarget.contentId}
          reportedUserId={reportTarget.reportedUserId}
        />
      ) : null}
    </div>
  );
}
