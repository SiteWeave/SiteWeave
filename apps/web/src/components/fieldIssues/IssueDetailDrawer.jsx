import React from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedPriority } from '@siteweave/i18n';
import {
  updateProjectIssue,
  deleteProjectIssue,
  uploadIssueFile,
  fetchProjectIssueById,
  resolveIssueAssigneePatch,
} from '@siteweave/core-logic';
import { supabaseClient } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import Icon from '../Icon';
import { getFieldIssueDisplayStatus } from '../../utils/fieldIssueStatus';
import { logFieldIssueUpdated, logFieldIssueClosed } from '../../utils/activityLogger';
import IssueCommentsPanel from './IssueCommentsPanel';
import IssuePingPanel from './IssuePingPanel';
import { useWorkspaceTier } from '../../hooks/useWorkspaceTier';

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export default function IssueDetailDrawer({
  issue,
  project,
  assigneeOptions,
  projectTasks,
  currentUser,
  onClose,
  onUpdated,
  onDeleted,
  onUpgradeRequired,
}) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { canPing } = useWorkspaceTier();
  const [detail, setDetail] = React.useState(issue);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [pinging, setPinging] = React.useState(false);
  const [form, setForm] = React.useState({
    title: issue?.title || '',
    description: issue?.description || '',
    location: issue?.location || '',
    priority: issue?.priority || 'Medium',
    dueDate: issue?.due_date || '',
    assigned_to_contact_id: issue?.assigned_to_contact_id || '',
    related_task_ids: issue?.related_task_ids || [],
  });

  React.useEffect(() => {
    setDetail(issue);
    setForm({
      title: issue?.title || '',
      description: issue?.description || '',
      location: issue?.location || '',
      priority: issue?.priority || 'Medium',
      dueDate: issue?.due_date || '',
      assigned_to_contact_id: issue?.assigned_to_contact_id || '',
      related_task_ids: Array.isArray(issue?.related_task_ids) ? issue.related_task_ids : [],
    });
  }, [issue]);

  React.useEffect(() => {
    if (!issue?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await fetchProjectIssueById(supabaseClient, issue.id);
        if (!cancelled) setDetail(fresh);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [issue?.id]);

  const displayStatus = getFieldIssueDisplayStatus(detail);

  const handleSave = async () => {
    if (!form.title.trim()) {
      addToast(t('fieldIssues.title_required_short'), 'error');
      return;
    }
    setSaving(true);
    try {
      const assigneePatch = resolveIssueAssigneePatch(
        form.assigned_to_contact_id,
        assigneeOptions,
      );
      const updated = await updateProjectIssue(
        supabaseClient,
        detail.id,
        {
          title: form.title.trim(),
          description: form.description,
          location: form.location.trim() || null,
          priority: form.priority,
          due_date: form.dueDate || null,
          assigned_to_contact_id: assigneePatch.assigned_to_contact_id,
          assigned_to_user_id: assigneePatch.assigned_to_user_id,
          related_task_ids: form.related_task_ids,
        },
        { previousStatus: detail.status },
      );
      setDetail(updated);
      onUpdated?.(updated);
      await logFieldIssueUpdated(updated, currentUser, project.id);
      addToast(t('fieldIssues.saved'), 'success');
    } catch (e) {
      addToast(e.message || t('fieldIssues.save_error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSetStatus = async (next) => {
    if (displayStatus === next) return;
    setSaving(true);
    try {
      const updated = await updateProjectIssue(
        supabaseClient,
        detail.id,
        { status: next },
        { previousStatus: detail.status, bridgeToStream: true },
      );
      setDetail(updated);
      onUpdated?.(updated);
      if (next === 'closed') {
        await logFieldIssueClosed(updated, currentUser, project.id);
      }
      addToast(next === 'closed' ? t('fieldIssues.closed') : t('fieldIssues.reopened'), 'success');
    } catch (e) {
      addToast(e.message || t('fieldIssues.status_error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('fieldIssues.delete_confirm'))) return;
    try {
      await deleteProjectIssue(supabaseClient, detail.id);
      onDeleted?.(detail.id);
      addToast(t('fieldIssues.deleted'), 'success');
      onClose?.();
    } catch (e) {
      addToast(e.message || t('fieldIssues.delete_error'), 'error');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.id) return;
    setUploading(true);
    try {
      await uploadIssueFile(
        supabaseClient,
        detail.id,
        file,
        currentUser.id,
        project.organization_id,
      );
      const fresh = await fetchProjectIssueById(supabaseClient, detail.id);
      setDetail(fresh);
      onUpdated?.(fresh);
      addToast(t('fieldIssues.file_attached'), 'success');
    } catch (err) {
      addToast(err.message || t('fieldIssues.upload_failed'), 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const toggleTaskLink = (taskId) => {
    setForm((prev) => {
      const ids = [...(prev.related_task_ids || [])];
      const idx = ids.indexOf(taskId);
      if (idx >= 0) ids.splice(idx, 1);
      else ids.push(taskId);
      return { ...prev, related_task_ids: ids };
    });
  };

  const handleIssuePing = async ({
    recipients,
    recipientUserIds,
    delayHours,
    deliveryChannels,
    message,
  }) => {
    if (!canPing) {
      onUpgradeRequired?.('pings');
      return;
    }
    const recipientPayload = Array.isArray(recipients)
      ? recipients.filter((r) => r && (r.userId || r.email || r.phone))
      : [];
    if (!recipientPayload.length && !recipientUserIds?.length) {
      addToast(t('fieldIssues.ping_select_recipients'), 'warning');
      return;
    }
    if (!deliveryChannels?.length) {
      addToast(t('fieldIssues.ping_select_channels'), 'warning');
      return;
    }
    setPinging(true);
    try {
      const senderName =
        currentUser?.user_metadata?.full_name || currentUser?.email || 'SiteWeave user';
      const { data, error } = await supabaseClient.functions.invoke('dispatch-notification', {
        body: {
          action: 'manual_issue_reminder',
          entityType: 'issue',
          entityId: String(detail.id),
          issueId: detail.id,
          entityTitle: form.title || detail.title,
          priority: form.priority || detail.priority,
          recipients: recipientPayload,
          recipientUserIds: recipientUserIds || [],
          deliveryChannels,
          delayHours,
          message,
          projectId: project.id,
          projectName: project.name,
          projectAddress: project.address || null,
          organizationId: project.organization_id,
          senderName,
        },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || t('fieldIssues.ping_failed'));
      }
      if (data.scheduled) {
        addToast(t('fieldIssues.ping_scheduled', { hours: delayHours }), 'success');
      } else {
        addToast(t('fieldIssues.ping_sent'), 'success');
      }
    } catch (e) {
      addToast(e.message || t('fieldIssues.ping_failed'), 'error');
    } finally {
      setPinging(false);
    }
  };

  if (!detail) return null;

  return (
    <div className="flex flex-col h-full min-h-0 border-l border-slate-200 bg-slate-50/40">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex items-start gap-2">
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t('fieldIssues.issue_title')}
            className="min-w-0 flex-1 rounded-md border-0 bg-transparent px-1 py-0.5 text-base font-semibold text-slate-900 placeholder:text-slate-400 ring-1 ring-transparent focus:bg-white focus:ring-blue-500"
            aria-label={t('fieldIssues.issue_title')}
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('common.close')}
          >
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={t('fieldIssues.status_label')}
              className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
            >
              <button
                type="button"
                onClick={() => handleSetStatus('open')}
                disabled={saving}
                aria-pressed={displayStatus === 'open'}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  displayStatus === 'open'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('fieldIssues.status_open')}
              </button>
              <button
                type="button"
                onClick={() => handleSetStatus('closed')}
                disabled={saving}
                aria-pressed={displayStatus === 'closed'}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  displayStatus === 'closed'
                    ? 'bg-white text-slate-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('fieldIssues.status_closed')}
              </button>
            </div>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-label={t('fieldIssues.priority_label')}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {getLocalizedPriority(p, t)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleDelete}
              className="ml-auto text-[11px] font-medium text-red-600 hover:text-red-800"
            >
              {t('common.delete')}
            </button>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {t('fieldIssues.due_date')}
            </label>
            <input
              type="date"
              value={form.dueDate || ''}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
        <div>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder={t('fieldIssues.description_optional')}
            className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {t('punchList.location_label')}
          </label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder={t('punchList.location_placeholder')}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {t('fieldIssues.assignee_label')}
          </label>
          <select
            value={form.assigned_to_contact_id}
            onChange={(e) => setForm({ ...form, assigned_to_contact_id: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">{t('tasks.unassigned')}</option>
            {assigneeOptions.map((opt) => (
              <option key={opt.contactId} value={opt.contactId}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
          <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {t('fieldIssues.ping_section')}
          </label>
          <IssuePingPanel
            assigneeOptions={assigneeOptions || []}
            defaultAssigneeContactId={
              form.assigned_to_contact_id ||
              detail.assigned_to_contact_id ||
              ''
            }
            onSend={handleIssuePing}
            busy={pinging}
            onUpgradeRequired={onUpgradeRequired}
          />
        </div>

        {projectTasks?.length > 0 ? (
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {t('fieldIssues.related_tasks')}
            </label>
            <div className="max-h-24 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-0.5">
              {projectTasks.slice(0, 30).map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={(form.related_task_ids || []).includes(t.id)}
                    onChange={() => toggleTaskLink(t.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="truncate">{t.text}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {t('fieldIssues.attachments')}
          </label>
          {(detail.issue_files || []).length > 0 ? (
            <ul className="mb-2 space-y-1 rounded-lg border border-slate-200 bg-white p-2">
              {detail.issue_files.map((f) => (
                <li key={f.id}>
                  <a
                    href={f.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {f.file_name}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
            <input type="file" className="hidden" onChange={handleFile} disabled={uploading} />
            {uploading ? t('fieldIssues.uploading') : t('fieldIssues.add_file')}
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
          <IssueCommentsPanel issue={detail} organizationId={project.organization_id} />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? t('fieldIssues.saving') : t('fieldIssues.save_changes')}
        </button>
      </div>
    </div>
  );
}
