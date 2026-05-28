import React from 'react';
import { useTranslation } from 'react-i18next';
import { STREAM_POST_TYPES } from '@siteweave/core-logic';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const POST_TYPE_I18N = {
  general: 'stream.post_type_general',
  daily_log: 'stream.post_type_daily_log',
  announcement: 'stream.post_type_announcement',
  milestone: 'stream.post_type_milestone',
};

export default function StreamComposer({ onSubmit }) {
  const { t } = useTranslation();
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
      alert(t('stream.file_too_large'));
      e.target.value = '';
      return;
    }
    setFile(picked);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200/80 bg-white px-6 py-5 shadow-xs">
      <div className="mb-4 flex flex-wrap gap-2">
        {STREAM_POST_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => setPostType(type.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              postType === type.value
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t(POST_TYPE_I18N[type.value] || type.label)}
          </button>
        ))}
      </div>

      {showTitle ? (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={postType === 'milestone' ? t('stream.milestone_title_placeholder') : t('stream.announcement_title_placeholder')}
          className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      ) : null}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        placeholder={t(`stream.placeholder_${postType}`)}
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
            {t('stream.remove_file')}
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
            {t('stream.attach_file')}
          </button>
          <p className="text-[11px] text-slate-400 select-none">{t('stream.post_hint')}</p>
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {submitting ? t('stream.posting') : t('stream.post_to_stream')}
        </button>
      </div>
    </form>
  );
}
