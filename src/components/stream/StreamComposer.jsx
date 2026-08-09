import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  STREAM_POST_TYPES,
  buildSiteDaySections,
  todayIso,
  wasCompletedToday,
  weatherImpactIsToday,
  listWeatherImpactsForProject,
  fetchProjectIssues,
} from '@siteweave/core-logic';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const DAILY_LOG_FALLBACK_BODY = 'Daily log';

const POST_TYPE_I18N = {
  general: 'stream.post_type_general',
  daily_log: 'stream.post_type_daily_log',
  milestone: 'stream.post_type_milestone',
};

function emptySections() {
  return buildSiteDaySections({});
}

function hasAutoSectionContent(sections) {
  return (
    withContent(sections?.work_completed, (row) => row.title).length > 0 ||
    withContent(
      sections?.weather,
      (row) => row.summary || (row.days_lost != null ? String(row.days_lost) : ''),
    ).length > 0 ||
    withContent(sections?.blockers, (row) => row.title).length > 0
  );
}

function withContent(items, getLabel) {
  return (items || []).filter((item) => String(getLabel(item) || '').trim().length > 0);
}

function PreviewSection({ title, items, renderItem }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-slate-600">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs leading-relaxed text-slate-700">
            • {renderItem(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StreamComposer({
  onSubmit,
  canPost = true,
  project = null,
  supabaseClient = null,
  tasks = [],
}) {
  const { t } = useTranslation();
  const [postType, setPostType] = React.useState('general');
  const [body, setBody] = React.useState('');
  const [milestoneTitle, setMilestoneTitle] = React.useState('');
  const [file, setFile] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [draftSections, setDraftSections] = React.useState(emptySections);
  const [drafting, setDrafting] = React.useState(false);
  const fileInputRef = React.useRef(null);

  const projectId = project?.id || null;
  const organizationId = project?.organization_id || null;

  React.useEffect(() => {
    if (postType !== 'daily_log' || !projectId || !supabaseClient) {
      setDraftSections(emptySections());
      setDrafting(false);
      return undefined;
    }

    let cancelled = false;
    const loadDraft = async () => {
      setDrafting(true);
      try {
        const projectTasks = (tasks || []).filter((task) => task.project_id === projectId);
        const completedToday = projectTasks.filter(wasCompletedToday);

        const [weatherImpacts, issuesResult] = await Promise.all([
          listWeatherImpactsForProject(supabaseClient, projectId, organizationId).catch(() => []),
          fetchProjectIssues(supabaseClient, projectId, { statusFilter: 'open', limit: 10 }).catch(
            () => ({ issues: [] }),
          ),
        ]);

        const todayWeather = (weatherImpacts || []).filter(weatherImpactIsToday);
        const built = buildSiteDaySections({
          completedTasks: completedToday,
          weatherImpacts: todayWeather,
          openIssues: issuesResult.issues || [],
        });

        if (!cancelled) setDraftSections(built);
      } finally {
        if (!cancelled) setDrafting(false);
      }
    };

    loadDraft();
    return () => {
      cancelled = true;
    };
  }, [postType, projectId, organizationId, supabaseClient, tasks]);

  const hasAutoSections = hasAutoSectionContent(draftSections);
  const canSubmit =
    canPost &&
    !submitting &&
    (body.trim().length > 0 || file || (postType === 'daily_log' && hasAutoSections));

  if (!canPost) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-4 text-sm text-slate-600">
        {t('stream.composer_blocked')}
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const note = body.trim();
      if (postType === 'daily_log') {
        const sections = {
          ...draftSections,
          work_completed: withContent(draftSections.work_completed, (row) => row.title),
          weather: withContent(
            draftSections.weather,
            (row) => row.summary || (row.days_lost != null ? String(row.days_lost) : ''),
          ),
          blockers: withContent(draftSections.blockers, (row) => row.title),
          notes: note,
        };
        await onSubmit({
          post_type: postType,
          title: null,
          body: note || (file ? `Attached: ${file.name}` : DAILY_LOG_FALLBACK_BODY),
          file,
          payload: {
            log_date: todayIso(),
            sections,
            photos: [],
          },
        });
      } else if (postType === 'milestone') {
        await onSubmit({
          post_type: postType,
          title: milestoneTitle.trim() || null,
          body: note || (file ? `Attached: ${file.name}` : ''),
          file,
          payload: { approval_status: 'pending' },
        });
      } else {
        await onSubmit({
          post_type: postType,
          title: null,
          body: note || (file ? `Attached: ${file.name}` : ''),
          file,
        });
      }
      setBody('');
      setMilestoneTitle('');
      setPostType('general');
      setFile(null);
      setDraftSections(emptySections());
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

      {postType === 'milestone' ? (
        <input
          type="text"
          value={milestoneTitle}
          onChange={(e) => setMilestoneTitle(e.target.value)}
          placeholder={t('stream.milestone_title_placeholder')}
          className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      ) : null}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        placeholder={
          postType === 'daily_log'
            ? t('mobile.site_day_placeholder')
            : t(`stream.placeholder_${postType}`)
        }
        className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />

      {postType === 'daily_log' ? (
        drafting || hasAutoSections ? (
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t('mobile.site_day_preview')}
            </p>
            {drafting ? (
              <p className="text-xs text-slate-400">{t('mobile.site_day_drafting')}</p>
            ) : (
              <div className="space-y-3">
                <PreviewSection
                  title={t('mobile.site_day_completed')}
                  items={withContent(draftSections.work_completed, (row) => row.title)}
                  renderItem={(row) => row.title}
                />
                <PreviewSection
                  title={t('mobile.site_day_weather')}
                  items={withContent(
                    draftSections.weather,
                    (row) => row.summary || (row.days_lost != null ? String(row.days_lost) : ''),
                  )}
                  renderItem={(row) =>
                    `${row.summary || t('mobile.weather_reason_other')}${row.days_lost ? ` (${row.days_lost}d)` : ''}`
                  }
                />
                <PreviewSection
                  title={t('mobile.site_day_blockers')}
                  items={withContent(draftSections.blockers, (row) => row.title)}
                  renderItem={(row) => row.title}
                />
              </div>
            )}
          </div>
        ) : null
      ) : null}

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
          <p className="text-[11px] text-slate-400 select-none">{t('stream.visibility_hint')}</p>
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
