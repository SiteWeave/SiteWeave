import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  resolveProjectSmartNotificationSettings,
  formatLeadDaysList,
} from '@siteweave/core-logic';

/**
 * Compact smart task notification status on project details.
 * Calm banner + toggle; configure opens the settings modal.
 */
export default function ProjectSmartNotificationsCard({
  project,
  organization,
  canEdit = false,
  onConfigure,
  onToggleEnabled,
  variant = 'block',
}) {
  const { t } = useTranslation();
  const [toggling, setToggling] = useState(false);
  const settings = useMemo(
    () => resolveProjectSmartNotificationSettings(project, organization),
    [project, organization],
  );

  const leadDaysLabel = formatLeadDaysList(settings.leadDays);
  const isOn = settings.enabled;
  const isInline = variant === 'inline';

  const description = isOn
    ? t('projectDetail.smart_notifications_on_desc', { days: leadDaysLabel })
    : t('projectDetail.smart_notifications_off_desc');

  const handleToggle = async () => {
    if (!canEdit || !onToggleEnabled || toggling) return;
    setToggling(true);
    try {
      await onToggleEnabled(!isOn);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-2 text-sm ${
        isInline
          ? 'mb-0 w-full shrink-0 flex-nowrap rounded-lg border px-2.5 py-1.5 sm:ml-auto sm:w-auto'
          : 'mb-4 flex-wrap justify-between rounded-lg border px-3 py-2'
      } border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50/70`}
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
          {description}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canEdit && onToggleEnabled && (
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label={t('projectDetail.smart_notifications_toggle_aria')}
            disabled={toggling}
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60 ${
              isOn ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform duration-200 ${
                isOn ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        )}
        {canEdit && onConfigure && (
          <button
            type="button"
            onClick={() => onConfigure({ activate: false })}
            className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('projectDetail.smart_notifications_configure')}
          </button>
        )}
      </div>
    </div>
  );
}
