import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  resolveProjectSmartNotificationSettings,
  formatLeadDaysList,
} from '@siteweave/core-logic';

/** Soft emerald — less neon than the old #3CEB7A lime. */
const ON_GREEN = '#34C78B';
const ON_GREEN_SOFT = '#e9f8f0';

function CheckRow({ checked, label, disabled = false, onToggle }) {
  const interactive = typeof onToggle === 'function' && !disabled;
  const className = `flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-sm transition-colors ${
    checked ? 'text-gray-900' : 'bg-gray-50 text-gray-600'
  } ${interactive ? 'hover:brightness-[0.98] active:scale-[0.99]' : ''} ${
    disabled ? 'opacity-60' : ''
  }`;
  const style = checked ? { backgroundColor: ON_GREEN_SOFT } : undefined;

  const content = (
    <>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] ${
          checked ? 'text-white' : 'border border-gray-300 bg-white'
        }`}
        style={checked ? { backgroundColor: ON_GREEN } : undefined}
        aria-hidden
      >
        {checked ? (
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0 leading-snug">{label}</span>
    </>
  );

  if (!interactive) {
    return (
      <div className={className} style={style}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={className}
      style={style}
    >
      {content}
    </button>
  );
}

/**
 * Start reminders — toggle + configure. Use variant="rail" on the Tasks side column.
 */
export default function ProjectSmartNotificationsCard({
  project,
  organization,
  canEdit = false,
  onConfigure,
  onToggleEnabled,
  onToggleDependency,
  variant = 'block',
  className = '',
}) {
  const { t } = useTranslation();
  const [toggling, setToggling] = useState(false);
  const [togglingRow, setTogglingRow] = useState(null);
  const settings = useMemo(
    () => resolveProjectSmartNotificationSettings(project, organization),
    [project, organization],
  );

  const leadDaysLabel = formatLeadDaysList(settings.leadDays);
  const isOn = settings.enabled;
  const isRail = variant === 'rail';
  const isInline = variant === 'inline';
  const busy = toggling || togglingRow != null;

  const description = isOn
    ? t('projectDetail.smart_notifications_on_summary', {
        defaultValue: 'Reminders are sending automatically.',
      })
    : t('projectDetail.smart_notifications_off_summary', {
        defaultValue: "Off — crews won't get start or unlock emails.",
      });

  const runToggle = async (key, fn) => {
    if (!canEdit || !fn || busy) return;
    setTogglingRow(key);
    if (key === 'master') setToggling(true);
    try {
      await fn();
    } finally {
      setToggling(false);
      setTogglingRow(null);
    }
  };

  const handleToggle = () => {
    if (!onToggleEnabled) return;
    runToggle('master', () => onToggleEnabled(!isOn));
  };

  const handleToggleStart = (next) => {
    if (!onToggleEnabled) return;
    runToggle('start', () => onToggleEnabled(next));
  };

  const handleToggleUnlock = (next) => {
    if (!onToggleDependency) return;
    runToggle('unlock', () => onToggleDependency(next));
  };

  const toggle = canEdit && onToggleEnabled ? (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={t('projectDetail.smart_notifications_toggle_aria')}
      disabled={busy}
      onClick={handleToggle}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60 ${
        isOn ? '' : 'bg-gray-300'
      }`}
      style={isOn ? { backgroundColor: ON_GREEN } : undefined}
    >
      <span
        className={`inline-block h-[22px] w-[22px] transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          isOn ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  ) : null;

  if (isRail) {
    return (
      <div
        className={`rounded-2xl border border-gray-200 bg-white p-3.5 shadow-xs ${className}`.trim()}
        data-testid="project-smart-notifications-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {t('projectDetail.smart_notifications_title')}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-gray-500">{description}</p>
          </div>
          {toggle}
        </div>

        {isOn ? (
          <div className="mt-3 space-y-1.5">
            <CheckRow
              checked={settings.enabled}
              disabled={busy || !canEdit}
              onToggle={canEdit && onToggleEnabled ? handleToggleStart : undefined}
              label={t('projectDetail.smart_notifications_row_start', {
                days: leadDaysLabel,
              })}
            />
            <CheckRow
              checked={settings.dependencyEnabled}
              disabled={busy || !canEdit}
              onToggle={canEdit && onToggleDependency ? handleToggleUnlock : undefined}
              label={t('projectDetail.smart_notifications_row_unlock')}
            />
            {canEdit && onConfigure ? (
              <button
                type="button"
                onClick={() => onConfigure({ activate: false })}
                className="mt-1 w-full rounded-full border border-gray-200 bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('projectDetail.smart_notifications_configure')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 text-sm ${
        isInline
          ? 'mb-0 w-full shrink-0 flex-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 sm:ml-auto sm:w-auto'
          : 'mb-0 flex-wrap justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2.5'
      } ${className}`.trim()}
      data-testid="project-smart-notifications-card"
    >
      <div
        className={`flex min-w-0 items-center gap-x-2 ${
          isInline ? 'flex-nowrap' : 'flex-1 flex-wrap gap-y-1'
        }`}
      >
        <span className="shrink-0 font-medium text-gray-900">
          {t('projectDetail.smart_notifications_title')}
        </span>
        <span
          className={`text-gray-600 ${
            isInline ? 'hidden whitespace-nowrap xl:inline' : ''
          }`}
        >
          {isOn
            ? t('projectDetail.smart_notifications_on_desc', { days: leadDaysLabel })
            : t('projectDetail.smart_notifications_off_desc')}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {toggle}
        {canEdit && onConfigure && (
          <button
            type="button"
            onClick={() => onConfigure({ activate: false })}
            className="shrink-0 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('projectDetail.smart_notifications_configure')}
          </button>
        )}
      </div>
    </div>
  );
}
