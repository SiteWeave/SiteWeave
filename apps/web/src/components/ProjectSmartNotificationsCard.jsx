import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  resolveProjectSmartNotificationSettings,
  formatLeadDaysList,
} from '@siteweave/core-logic';

/**
 * Compact smart task notification status on project details.
 */
export default function ProjectSmartNotificationsCard({
  project,
  organization,
  canEdit = false,
  onConfigure,
  variant = 'block',
}) {
  const { t } = useTranslation();
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

  return (
    <div
      className={`flex items-center gap-2 text-sm ${
        isInline
          ? // Keep title + status + CTA on one row; only reveal the long description once
            // the viewport is wide enough that wrap is unlikely (see desc span below).
            'mb-0 w-full shrink-0 flex-nowrap rounded-lg border px-2.5 py-1.5 sm:ml-auto sm:w-auto'
          : 'mb-4 flex-wrap justify-between rounded-lg border px-3 py-2'
      } ${
        isOn ? 'border-blue-200 bg-blue-50/60' : 'border-amber-200 bg-amber-50/80'
      }`}
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
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
            isOn ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {isOn ? t('projectDetail.smart_notifications_on') : t('projectDetail.smart_notifications_off')}
        </span>
        <span
          className={`text-gray-600 ${
            // Inline banner sits beside tabs — hide the sentence until ~xl so title, badge,
            // description, and CTA can share a single line.
            isInline ? 'hidden whitespace-nowrap xl:inline' : ''
          }`}
        >
          {description}
        </span>
      </div>
      {canEdit && onConfigure && (
        <button
          type="button"
          onClick={() => onConfigure({ activate: !isOn })}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
            isOn
              ? 'border border-blue-300 bg-white text-blue-800 hover:bg-blue-50'
              : 'bg-amber-600 text-white hover:bg-amber-700'
          }`}
        >
          {isOn
            ? t('projectDetail.smart_notifications_configure')
            : t('projectDetail.smart_notifications_turn_on')}
        </button>
      )}
    </div>
  );
}
