import React from 'react';
import { useTranslation } from 'react-i18next';
import { isSmsNotificationsEnabled } from '@siteweave/core-logic';
import { useWorkspaceTier } from '../../hooks/useWorkspaceTier';

const DELAY_OPTIONS = [
  { hours: 0, labelKey: 'fieldIssues.ping_delay_now' },
  { hours: 12, labelKey: 'fieldIssues.ping_delay_12h' },
  { hours: 24, labelKey: 'fieldIssues.ping_delay_24h' },
  { hours: 36, labelKey: 'fieldIssues.ping_delay_36h' },
  { hours: 48, labelKey: 'fieldIssues.ping_delay_48h' },
];

/**
 * Multi-recipient issue ping controls: recipients, delay, channels.
 */
export default function IssuePingPanel({
  assigneeOptions = [],
  defaultAssigneeUserId = '',
  onSend,
  busy = false,
  onUpgradeRequired,
}) {
  const { t } = useTranslation();
  const { canPing } = useWorkspaceTier();
  const smsEnabled = isSmsNotificationsEnabled();

  const [selectedIds, setSelectedIds] = React.useState(() =>
    defaultAssigneeUserId ? [defaultAssigneeUserId] : [],
  );
  const [delayHours, setDelayHours] = React.useState(0);
  const [channels, setChannels] = React.useState(() => ({
    email: true,
    sms: false,
    app: true,
  }));
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    if (defaultAssigneeUserId) {
      setSelectedIds((prev) =>
        prev.includes(defaultAssigneeUserId) ? prev : [defaultAssigneeUserId, ...prev],
      );
    }
  }, [defaultAssigneeUserId]);

  const toggleRecipient = (userId) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const toggleChannel = (key) => {
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSend = () => {
    if (!canPing) {
      onUpgradeRequired?.('pings');
      return;
    }
    const deliveryChannels = [];
    if (channels.email) deliveryChannels.push('email');
    if (smsEnabled && channels.sms) deliveryChannels.push('sms');
    if (channels.app) deliveryChannels.push('app');
    onSend?.({
      recipientUserIds: selectedIds,
      delayHours,
      deliveryChannels,
      message: message.trim() || null,
    });
  };

  if (!assigneeOptions.length) {
    return (
      <p className="text-xs text-slate-500">{t('fieldIssues.no_project_assignees')}</p>
    );
  }

  const canSubmit =
    selectedIds.length > 0 &&
    (channels.email || channels.app || (smsEnabled && channels.sms)) &&
    !busy;

  return (
    <div className="space-y-3" data-testid="issue-ping-panel">
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {t('fieldIssues.ping_recipients')}
        </label>
        <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-0.5">
          {assigneeOptions.map((opt) => (
            <label
              key={opt.userId}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(opt.userId)}
                onChange={() => toggleRecipient(opt.userId)}
                className="rounded border-slate-300"
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {t('fieldIssues.ping_delay')}
        </label>
        <div className="flex flex-wrap gap-1">
          {DELAY_OPTIONS.map((opt) => (
            <button
              key={opt.hours}
              type="button"
              onClick={() => setDelayHours(opt.hours)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                delayHours === opt.hours
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {t('fieldIssues.ping_channels')}
        </label>
        <div className="flex flex-wrap gap-3 text-xs text-slate-700">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={channels.email}
              onChange={() => toggleChannel('email')}
              className="rounded border-slate-300"
            />
            {t('fieldIssues.ping_channel_email')}
          </label>
          {smsEnabled ? (
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={channels.sms}
                onChange={() => toggleChannel('sms')}
                className="rounded border-slate-300"
              />
              {t('fieldIssues.ping_channel_sms')}
            </label>
          ) : null}
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={channels.app}
              onChange={() => toggleChannel('app')}
              className="rounded border-slate-300"
            />
            {t('fieldIssues.ping_channel_app')}
          </label>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {t('fieldIssues.ping_message_optional')}
        </label>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={200}
          placeholder={t('fieldIssues.ping_message_placeholder')}
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!canSubmit}
        className="w-full rounded-lg border border-blue-200 bg-blue-50 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? t('fieldIssues.ping_sending')
          : delayHours === 0
            ? t('fieldIssues.ping_send_now')
            : t('fieldIssues.ping_schedule', { hours: delayHours })}
      </button>
    </div>
  );
}
