import React from 'react';
import { useTranslation } from 'react-i18next';
import { isSmsNotificationsEnabled } from '@siteweave/core-logic';
import Icon from './Icon';

/**
 * Modal to ping one or more project members about a task.
 * Assignee contact is pre-selected when present.
 */
export default function TaskPingModal({
  open,
  task,
  projectContacts = [],
  onClose,
  onConfirm,
  busy = false,
}) {
  const { t } = useTranslation();
  const smsEnabled = isSmsNotificationsEnabled();

  const assigneeId = task?.assignee_id ? String(task.assignee_id) : null;
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [channels, setChannels] = React.useState({ email: true, sms: false, app: false });

  React.useEffect(() => {
    if (!open) return;
    const initial = assigneeId ? [assigneeId] : [];
    setSelectedIds(initial);
    const assignee = projectContacts.find((c) => String(c.id) === assigneeId);
    const hasEmail = Boolean(assignee?.email && String(assignee.email).includes('@'));
    const hasPhone = Boolean(assignee?.phone && String(assignee.phone).trim());
    setChannels({
      email: hasEmail || !hasPhone,
      sms: smsEnabled && hasPhone && !hasEmail,
      app: false,
    });
  }, [open, assigneeId, projectContacts, smsEnabled]);

  if (!open || !task) return null;

  const members = (projectContacts || []).filter(
    (c) => c?.email || c?.phone || c?.name,
  );

  const toggle = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectedRecipients = members.filter((c) => selectedIds.includes(String(c.id)));

  const deliveryChannels = [];
  if (channels.email) deliveryChannels.push('email');
  if (smsEnabled && channels.sms) deliveryChannels.push('sms');
  if (channels.app) deliveryChannels.push('app');

  const canSubmit = selectedRecipients.length > 0 && deliveryChannels.length > 0 && !busy;

  const handleConfirm = () => {
    onConfirm?.({
      recipients: selectedRecipients.map((c) => ({
        contactId: c.id,
        userId: c.profile_id || (String(c.id || '').startsWith('profile:') ? String(c.id).slice(8) : null),
        email: c.email || null,
        phone: c.phone || null,
        name: c.name || null,
      })),
      deliveryChannels,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/20 py-8 backdrop-blur-sm p-4">
      <div className="app-card w-full max-w-md shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="task-ping-title">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 id="task-ping-title" className="font-bold text-slate-900">
            {t('tasks.ping_modal_title')}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common.close')}>
            <Icon path="M6 18L18 6M6 6l12 12" className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-slate-600 truncate" title={task.text}>
            {task.text || t('tasks.unknown_task')}
          </p>

          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {t('tasks.ping_recipients')}
            </label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-0.5">
              {members.length === 0 ? (
                <p className="px-1 py-2 text-xs text-slate-500">{t('tasks.ping_no_members')}</p>
              ) : (
                members.map((c) => {
                  const id = String(c.id);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(id)}
                        onChange={() => toggle(id)}
                        className="rounded border-slate-300"
                      />
                      <span className="truncate">{c.name || c.email || id}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {t('tasks.ping_channels')}
            </label>
            <div className="flex flex-wrap gap-3 text-xs text-slate-700">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={channels.email}
                  onChange={() => setChannels((p) => ({ ...p, email: !p.email }))}
                  className="rounded border-slate-300"
                />
                {t('fieldIssues.ping_channel_email')}
              </label>
              {smsEnabled ? (
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={channels.sms}
                    onChange={() => setChannels((p) => ({ ...p, sms: !p.sms }))}
                    className="rounded border-slate-300"
                  />
                  {t('fieldIssues.ping_channel_sms')}
                </label>
              ) : null}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? t('fieldIssues.ping_sending') : t('tasks.ping_send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
