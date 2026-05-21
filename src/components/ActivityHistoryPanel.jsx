import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import Avatar from './Avatar';
import { formatActivityLine } from '../utils/formatActivityLine';
import { fetchActivityHistoryPage, DEFAULT_PAGE_SIZE } from '../utils/activityHistoryService';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import UpgradeRequiredModal from './UpgradeRequiredModal';

const ENTITY_OPTIONS = [
  { value: '', key: 'all' },
  { value: 'task', key: 'task' },
  { value: 'project', key: 'project' },
  { value: 'contact', key: 'contact' },
  { value: 'file', key: 'file' },
  { value: 'project_phase', key: 'project_phase' },
  { value: 'branding', key: 'branding' },
  { value: 'organization', key: 'organization' },
];

function formatTimeAgo(dateString) {
  const now = new Date();
  const activityDate = new Date(dateString);
  const diffInMinutes = Math.floor((now - activityDate) / (1000 * 60));
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }
  if (diffInMinutes < 1440) {
    return `${Math.floor(diffInMinutes / 60)}h ago`;
  }
  return `${Math.floor(diffInMinutes / 1440)}d ago`;
}

function csvEscape(s) {
  const str = s == null ? '' : String(s);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @param {'project'|'organization'} props.mode
 * @param {string} props.organizationId
 * @param {string} [props.projectId] - required when mode is project
 * @param {string} [props.title] - optional heading override
 */
function ActivityHistoryPanel({ mode, organizationId, projectId = null, title }) {
  const { t, i18n } = useTranslation();
  const { state } = useAppContext();
  const { canExport } = useWorkspaceTier();
  const [showExportUpgrade, setShowExportUpgrade] = useState(false);

  const [entityType, setEntityType] = useState('');
  const [rows, setRows] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const projectNamesById = useMemo(() => {
    const m = {};
    (state.projects || []).forEach((p) => {
      m[p.id] = p.name;
    });
    return m;
  }, [state.projects]);

  const loadPage = useCallback(
    async (nextOffset, append) => {
      if (!organizationId) {
        setLoading(false);
        setError(new Error('No organization'));
        return;
      }
      if (mode === 'project' && !projectId) {
        setLoading(false);
        setError(new Error('No project'));
        return;
      }
      const isFirst = !append;
      if (isFirst) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      const { rows: data, error: err } = await fetchActivityHistoryPage({
        supabase: supabaseClient,
        organizationId,
        projectId: mode === 'project' ? projectId : null,
        entityType: entityType || null,
        offset: nextOffset,
        pageSize: DEFAULT_PAGE_SIZE,
      });
      if (err) {
        setError(err);
        if (isFirst) setRows([]);
        setHasMore(false);
      } else {
        const batch = data || [];
        setHasMore(batch.length === DEFAULT_PAGE_SIZE);
        setOffset(nextOffset + batch.length);
        if (append) {
          setRows((prev) => [...prev, ...batch]);
        } else {
          setRows(batch);
        }
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [organizationId, projectId, mode, entityType],
  );

  useEffect(() => {
    setOffset(0);
    setRows([]);
    setHasMore(true);
    loadPage(0, false);
  }, [loadPage]);

  const handleLoadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    loadPage(offset, true);
  };

  const handleExportCsv = () => {
    if (!canExport) {
      setShowExportUpgrade(true);
      return;
    }
    if (!rows.length) return;
    const headers = ['created_at', 'user_name', 'entity_type', 'action', 'description', 'project_id'];
    const lines = [headers.join(',')];
    rows.forEach((row) => {
      const description = formatActivityLine(row, t, { projectNamesById });
      lines.push(
        [
          csvEscape(row.created_at),
          csvEscape(row.user_name),
          csvEscape(row.entity_type),
          csvEscape(row.action),
          csvEscape(description),
          csvEscape(row.project_id),
        ].join(','),
      );
    });
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const part =
      mode === 'project' && projectId
        ? `project-activity-${projectId}`
        : `organization-activity-${organizationId}`;
    a.download = `${part}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const heading =
    title ||
    (mode === 'project'
      ? t('activityHistory.projectTitle')
      : t('activityHistory.organizationTitle'));

  if (!organizationId) {
    return (
      <p className="text-sm text-gray-500">{t('activityHistory.noOrganization')}</p>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-xs">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{heading}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('activityHistory.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span>{t('activityHistory.filterType')}</span>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.key ? t(`activityHistory.entity.${opt.key}`) : t('activityHistory.entity.all')}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!rows.length}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('activityHistory.exportCsv')}
          </button>
        </div>
      </div>

      <div className="max-h-[min(70vh,560px)] overflow-y-auto px-6 py-4">
        {loading && (
          <p className="py-8 text-center text-sm text-gray-500">{t('activityHistory.loading')}</p>
        )}
        {error && !loading && (
          <p className="py-4 text-sm text-red-600">{error.message || t('activityHistory.error')}</p>
        )}
        {!loading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">{t('activityHistory.empty')}</p>
        )}
        {!loading && rows.length > 0 && (
          <ul className="space-y-4">
            {rows.map((activity) => (
              <li
                key={activity.id}
                className="flex gap-3 border-b border-gray-100 pb-4 last:border-0 last:pb-0"
              >
                {activity.user_avatar ? (
                  <img
                    src={activity.user_avatar}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="shrink-0">
                    <Avatar name={activity.user_name || '?'} size="md" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-semibold">{activity.user_name}</span>{' '}
                    {formatActivityLine(activity, t, { projectNamesById })}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span>{formatTimeAgo(activity.created_at)}</span>
                    <span>
                      {new Date(activity.created_at).toLocaleString(i18n.language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                    {activity.entity_type && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
                        {activity.entity_type}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && hasMore && rows.length > 0 && (
        <div className="border-t border-gray-200 px-6 py-3">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-50"
          >
            {loadingMore ? t('activityHistory.loading') : t('activityHistory.loadMore')}
          </button>
        </div>
      )}
      <UpgradeRequiredModal
        isOpen={showExportUpgrade}
        onClose={() => setShowExportUpgrade(false)}
        feature="exports"
      />
    </div>
  );
}

export default ActivityHistoryPanel;
