import React from 'react';
import {
  fetchTaskComments,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
  canSetInternalVisibility,
} from '@siteweave/core-logic';
import { upsertById, removeById } from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ReportContentModal from './moderation/ReportContentModal';

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

export default function TaskCommentsPanel({ task, project, inModal = false }) {
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [comments, setComments] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [body, setBody] = React.useState('');
  const [visibility, setVisibility] = React.useState('public');
  const [sending, setSending] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState(null);
  const [editingId, setEditingId] = React.useState(null);
  const [editBody, setEditBody] = React.useState('');

  const viewerOrgId = state.currentOrganization?.id || project?.organization_id || null;
  const canInternal = canSetInternalVisibility({ organization_id: viewerOrgId }, project);

  const load = React.useCallback(async () => {
    if (!task?.id) return;
    try {
      const rows = await fetchTaskComments(supabaseClient, task.id);
      setComments(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [task?.id]);

  React.useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  React.useEffect(() => {
    if (!task?.id) return;
    const channel = supabaseClient
      .channel(`task_comments:${task.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
        async (payload) => {
          const row = payload.new;
          if (!row?.id || row.parent_comment_id) return;
          try {
            const rows = await fetchTaskComments(supabaseClient, task.id);
            const match = rows.find((c) => c.id === row.id);
            if (match) setComments((prev) => upsertById(prev, match, 'append'));
          } catch {
            load();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
        async (payload) => {
          const row = payload.new;
          if (!row?.id || row.parent_comment_id) return;
          setComments((prev) => {
            const existing = prev.find((c) => c.id === row.id);
            return upsertById(prev, { ...existing, ...row, author: existing?.author }, 'append');
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
        (payload) => {
          const id = payload.old?.id;
          if (id) setComments((prev) => removeById(prev, id));
        },
      )
      .subscribe();
    return () => supabaseClient.removeChannel(channel);
  }, [task?.id, load]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || !state.user?.id || !project || !task || sending) return;
    setSending(true);
    try {
      const newComment = await createTaskComment(supabaseClient, {
        task_id: task.id,
        project_id: project.id,
        organization_id: project.organization_id,
        author_id: state.user.id,
        body: trimmed,
        visibility: canInternal ? visibility : 'public',
      });
      setBody('');
      setComments((prev) => upsertById(prev, newComment, 'append'));
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to add comment.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit();
  };

  const handleSaveEdit = async (commentId) => {
    try {
      const updated = await updateTaskComment(supabaseClient, commentId, { body: editBody });
      setComments((prev) => {
        const existing = prev.find((c) => c.id === commentId);
        return upsertById(prev, { ...existing, ...updated }, 'append');
      });
      setEditingId(null);
      addToast('Comment updated.', 'success');
    } catch (err) {
      addToast(err.message || 'Could not update comment.', 'error');
    }
  };

  const handleDelete = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteTaskComment(supabaseClient, commentId);
      setComments((prev) => removeById(prev, commentId));
    } catch (err) {
      addToast('Could not delete comment.', 'error');
    }
  };

  if (!task?.id || !project) return null;

  return (
    <div className={inModal ? '' : 'mt-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3'}>
      {!inModal ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Task discussion
        </p>
      ) : null}

      {loading ? (
        <div className="mb-3 space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-200/60" />)}
        </div>
      ) : comments.length === 0 ? (
        <p className="mb-2 text-xs italic text-slate-400">No comments yet.</p>
      ) : (
        <ul className="mb-3 max-h-52 space-y-2 overflow-y-auto">
          {comments.map((c) => (
            <li
              key={c.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                c.visibility === 'internal'
                  ? 'border border-amber-100 bg-amber-50/70'
                  : 'border border-slate-100 bg-white'
              }`}
            >
              <div className="flex gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-600">
                  {initials(c.author?.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700">{c.author?.name || 'Member'}</span>
                      {c.visibility === 'internal' ? (
                        <span className="ml-1.5 rounded bg-amber-200/70 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-900">
                          Internal
                        </span>
                      ) : null}
                      <span className="mx-1 text-slate-300">·</span>
                      {formatWhen(c.created_at)}
                    </span>
                    <div className="flex gap-2">
                      {c.author_id === state.user?.id ? (
                        <>
                          <button
                            type="button"
                            className="text-[10px] text-slate-400 hover:text-slate-600"
                            onClick={() => {
                              if (editingId === c.id) {
                                setEditingId(null);
                              } else {
                                setEditingId(c.id);
                                setEditBody(c.body);
                              }
                            }}
                          >
                            {editingId === c.id ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="text-[10px] text-red-400 hover:text-red-600"
                            onClick={() => handleDelete(c.id)}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="text-[10px] text-slate-300 hover:text-slate-500"
                          onClick={() =>
                            setReportTarget({
                              contentType: 'task_comment',
                              contentId: c.id,
                              reportedUserId: c.author_id,
                            })
                          }
                        >
                          Report
                        </button>
                      )}
                    </div>
                  </div>
                  {editingId === c.id ? (
                    <div className="space-y-1">
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={2}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(c.id)}
                        className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-white"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-slate-800">{c.body}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        {canInternal ? (
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
            {['public', 'internal'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                  visibility === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              canInternal && visibility === 'internal'
                ? 'Internal note — use @name or @email to mention teammates…'
                : 'Comment on this task — @name or @email to mention… (⌘ Enter)'
            }
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm leading-relaxed placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {sending ? '…' : 'Add'}
          </button>
        </div>
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
