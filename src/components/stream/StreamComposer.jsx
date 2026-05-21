import React from 'react';
import { STREAM_POST_TYPES } from '@siteweave/core-logic';

const PLACEHOLDERS = {
  general: 'Share a project update…',
  daily_log: "Summarize today's site progress, crew on-site, and any blockers…",
  announcement: 'What does the whole team need to know?',
  milestone: 'Describe the milestone and what it means for the project…',
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export default function StreamComposer({ onSubmit }) {
  const [postType, setPostType] = React.useState('general');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [file, setFile] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const fileInputRef = React.useRef(null);

  const showTitle = postType === 'announcement' || postType === 'milestone';
  const canSubmit = (body.trim().length > 0 || file) && !submitting;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        post_type: postType,
        title: showTitle ? title.trim() || null : null,
        body: body.trim() || (file ? `Attached: ${file.name}` : ''),
        file,
      });
      setBody('');
      setTitle('');
      setPostType('general');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSubmit();
    }
  };

  const onPickFile = (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (picked.size > MAX_FILE_BYTES) {
      alert('File must be under 15 MB.');
      e.target.value = '';
      return;
    }
    setFile(picked);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200/80 bg-white px-6 py-5 shadow-xs">
      <div className="mb-4 flex flex-wrap gap-2">
        {STREAM_POST_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setPostType(t.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              postType === t.value
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showTitle ? (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={postType === 'milestone' ? 'Milestone title' : 'Announcement headline'}
          className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      ) : null}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        placeholder={PLACEHOLDERS[postType]}
        className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />

      {file ? (
        <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-800"
            onClick={() => {
              setFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          >
            Remove
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={onPickFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Attach file
          </button>
          <p className="text-[11px] text-slate-400 select-none">⌘ Enter to post</p>
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {submitting ? 'Posting…' : 'Post to stream'}
        </button>
      </div>
    </form>
  );
}
