import React from 'react';
import { useTranslation } from 'react-i18next';
import { getFieldIssueDisplayStatus } from '../../utils/fieldIssueStatus';

const PRIORITY_STYLES = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMins = Math.floor((now - d) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function descriptionLocationLine(issue, t) {
  const description = String(issue.description || '').trim();
  const location = String(issue.location || '').trim();
  if (description && location) {
    return t('fieldIssues.description_in_location', { description, location });
  }
  return description || location || '';
}

export default function FieldIssueCard({ issue, selected, onSelect }) {
  const { t } = useTranslation();
  const displayStatus = getFieldIssueDisplayStatus(issue);
  const priorityKey = (issue.priority || 'medium').toLowerCase();
  const priorityClass = PRIORITY_STYLES[priorityKey] || PRIORITY_STYLES.medium;
  const assigneeName = issue.assignee?.name || issue.assignee?.email || null;
  const detailLine = descriptionLocationLine(issue, t);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(issue)}
      className={`w-full text-left rounded-xl border p-3 transition-colors ${
        selected
          ? 'border-blue-400 bg-blue-50/80 ring-1 ring-blue-200'
          : displayStatus === 'closed'
            ? 'border-slate-200 bg-slate-50/80 opacity-90 hover:border-slate-300'
            : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span
              className={`text-sm font-semibold truncate ${
                displayStatus === 'closed' ? 'text-slate-500 line-through' : 'text-slate-900'
              }`}
            >
              {issue.title}
            </span>
            <span
              className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-full border ${priorityClass}`}
            >
              {t(`fieldIssues.priority_${priorityKey}`) || issue.priority || t('fieldIssues.priority_medium')}
            </span>
          </div>
          {detailLine ? (
            <p className="text-xs text-slate-600 line-clamp-2 mb-1.5">
              {issue.description?.trim() && issue.location?.trim() ? (
                <>
                  <span>{String(issue.description).trim()}</span>
                  <span className="text-slate-400"> {t('fieldIssues.in_connector')} </span>
                  <span className="font-semibold text-blue-700">{String(issue.location).trim()}</span>
                </>
              ) : issue.location?.trim() && !issue.description?.trim() ? (
                <span className="font-semibold text-blue-700">{detailLine}</span>
              ) : (
                detailLine
              )}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span
              className={`px-1.5 py-0.5 rounded-full font-medium ${
                displayStatus === 'open'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {displayStatus === 'open' ? t('fieldIssues.status_open') : t('fieldIssues.status_closed')}
            </span>
            <span>{formatWhen(issue.updated_at || issue.created_at)}</span>
            {assigneeName ? <span>· {assigneeName}</span> : null}
            {(issue.comment_count || 0) > 0 ? (
              <span>· {issue.comment_count} comment{(issue.comment_count || 0) === 1 ? '' : 's'}</span>
            ) : null}
          </div>
        </div>
        {issue.assignee?.avatar_url ? (
          <img
            src={issue.assignee.avatar_url}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full object-cover"
          />
        ) : assigneeName ? (
          <span className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
            {initials(assigneeName)}
          </span>
        ) : null}
      </div>
    </button>
  );
}
