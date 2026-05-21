import React from 'react';
import { updateStreamPost, deleteStreamPost, enrichStreamPost } from '@siteweave/core-logic';
import { useToast } from '../../context/ToastContext';
import StreamReplyThread from './StreamReplyThread';

const TYPE_LABELS = {
  general: 'Update',
  daily_log: 'Daily log',
  announcement: 'Announcement',
  milestone: 'Milestone',
};

const TYPE_STYLES = {
  general: 'bg-slate-100 text-slate-700',
  daily_log: 'bg-emerald-50 text-emerald-800',
  announcement: 'bg-amber-50 text-amber-900',
  milestone: 'bg-blue-50 text-blue-800',
};

const BODY_TRUNCATE_AT = 320;

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function Avatar({ name, avatarUrl, size = 'md' }) {
  const cls = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${cls} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${cls} inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600`}
    >
      {initials(name)}
    </span>
  );
}

export default function StreamPostCard({
  post,
  project,
  currentUserId,
  onReport,
  supabaseClient,
  onPostChange,
  onPostDelete,
  onReplyCountChange,
}) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = React.useState(false);
  const [bodyExpanded, setBodyExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editBody, setEditBody] = React.useState(post.body || '');
  const [editTitle, setEditTitle] = React.useState(post.title || '');
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const isAuthor = post.author_id === currentUserId;
  const authorName = post.author?.name || 'Team member';
  const isLongBody = post.body?.length > BODY_TRUNCATE_AT;
  const displayBody = isLongBody && !bodyExpanded
    ? `${post.body.slice(0, BODY_TRUNCATE_AT).trimEnd()}…`
    : post.body;
  const replyCount = post.reply_count || 0;
  const showTitleField = post.post_type === 'announcement' || post.post_type === 'milestone';

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const updated = await updateStreamPost(supabaseClient, post.id, {
        body: editBody,
        title: showTitleField ? editTitle.trim() || null : post.title,
      });
      const enriched = await enrichStreamPost(supabaseClient, updated, { reply_count: replyCount });
      onPostChange?.(enriched);
      setEditing(false);
      addToast('Post updated.', 'success');
    } catch (e) {
      console.error(e);
      addToast(e.message || 'Could not update post.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this post and all its replies?')) return;
    setDeleting(true);
    try {
      await deleteStreamPost(supabaseClient, post.id);
      onPostDelete?.(post.id);
      addToast('Post deleted.', 'success');
    } catch (e) {
      console.error(e);
      addToast('Could not delete post.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white px-6 py-5 shadow-xs transition-shadow hover:shadow-sm">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={authorName} avatarUrl={post.author?.avatar_url} />
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">{authorName}</span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TYPE_STYLES[post.post_type] || TYPE_STYLES.general}`}
              >
                {TYPE_LABELS[post.post_type] || TYPE_LABELS.general}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{formatWhen(post.created_at)}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isAuthor ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditBody(post.body || '');
                  setEditTitle(post.title || '');
                  setEditing((v) => !v);
                }}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-[11px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </>
          ) : null}
          {onReport && !isAuthor ? (
            <button
              type="button"
              onClick={() => onReport(post)}
              className="text-[11px] text-slate-400 hover:text-slate-600"
            >
              Report
            </button>
          ) : null}
        </div>
      </header>

      {editing ? (
        <div className="space-y-2">
          {showTitleField ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          ) : null}
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
          />
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={saving || !editBody.trim()}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : (
        <>
          {post.title ? (
            <h3 className="mb-2 text-base font-semibold text-slate-900">{post.title}</h3>
          ) : null}
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {displayBody}
          </div>
          {isLongBody ? (
            <button
              type="button"
              onClick={() => setBodyExpanded((v) => !v)}
              className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {bodyExpanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </>
      )}

      {post.file_url ? (
        <a
          href={post.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {post.file_name || 'Attachment'}
        </a>
      ) : null}

      <footer className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {expanded
            ? 'Hide replies'
            : replyCount === 0
            ? 'Reply'
            : `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
        </button>
      </footer>

      {expanded ? (
        <StreamReplyThread
          postId={post.id}
          project={project}
          currentUserId={currentUserId}
          supabaseClient={supabaseClient}
          onReplyPosted={() => onReplyCountChange?.(post.id, 1)}
        />
      ) : null}
    </article>
  );
}
