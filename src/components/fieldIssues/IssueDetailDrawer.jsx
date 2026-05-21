import React from 'react';
import {
  updateProjectIssue,
  deleteProjectIssue,
  uploadIssueFile,
  fetchProjectIssueById,
} from '@siteweave/core-logic';
import { supabaseClient } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import Icon from '../Icon';
import { getFieldIssueDisplayStatus } from '../../utils/fieldIssueStatus';
import { logFieldIssueUpdated, logFieldIssueClosed } from '../../utils/activityLogger';
import IssueCommentsPanel from './IssueCommentsPanel';

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
}) {
  const { addToast } = useToast();
  const [detail, setDetail] = React.useState(issue);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [form, setForm] = React.useState({
    title: issue?.title || '',
    description: issue?.description || '',
    priority: issue?.priority || 'Medium',
    dueDate: issue?.due_date || '',
    assigned_to_user_id: issue?.assigned_to_user_id || '',
    related_task_ids: issue?.related_task_ids || [],
  });

  React.useEffect(() => {
    setDetail(issue);
    setForm({
      title: issue?.title || '',
      description: issue?.description || '',
      priority: issue?.priority || 'Medium',
      dueDate: issue?.due_date || '',
      assigned_to_user_id: issue?.assigned_to_user_id || '',
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
      addToast('Title is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProjectIssue(
        supabaseClient,
        detail.id,
        {
          title: form.title.trim(),
          description: form.description,
          priority: form.priority,
          due_date: form.dueDate || null,
          assigned_to_user_id: form.assigned_to_user_id || null,
          related_task_ids: form.related_task_ids,
        },
        { previousStatus: detail.status },
      );
      setDetail(updated);
      onUpdated?.(updated);
      await logFieldIssueUpdated(updated, currentUser, project.id);
      addToast('Issue saved.', 'success');
    } catch (e) {
      addToast(e.message || 'Could not save issue.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const next = displayStatus === 'open' ? 'closed' : 'open';
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
      addToast(next === 'closed' ? 'Issue closed.' : 'Issue reopened.', 'success');
    } catch (e) {
      addToast(e.message || 'Could not update status.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this issue permanently?')) return;
    try {
      await deleteProjectIssue(supabaseClient, detail.id);
      onDeleted?.(detail.id);
      addToast('Issue deleted.', 'success');
      onClose?.();
    } catch (e) {
      addToast(e.message || 'Could not delete issue.', 'error');
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
      addToast('File attached.', 'success');
    } catch (err) {
      addToast(err.message || 'Upload failed.', 'error');
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

  if (!detail) return null;

  return (
    <div className="flex flex-col h-full min-h-0 border-l border-slate-200 bg-slate-50/40">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3">
        <div className="flex items-start gap-2">
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Issue title"
            className="min-w-0 flex-1 rounded-md border-0 bg-transparent px-1 py-0.5 text-base font-semibold text-slate-900 placeholder:text-slate-400 ring-1 ring-transparent focus:bg-white focus:ring-blue-500"
            aria-label="Issue title"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={saving}
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                displayStatus === 'open'
                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
              title={displayStatus === 'open' ? 'Mark closed' : 'Reopen'}
            >
              {displayStatus === 'open' ? 'Open' : 'Closed'}
            </button>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-label="Priority"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleDelete}
              className="ml-auto text-[11px] font-medium text-red-600 hover:text-red-800"
            >
              Delete
            </button>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Due date
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
            placeholder="Description (optional)"
            className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Assignee
          </label>
          <select
            value={form.assigned_to_user_id}
            onChange={(e) => setForm({ ...form, assigned_to_user_id: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Unassigned</option>
            {assigneeOptions.map((opt) => (
              <option key={opt.userId} value={opt.userId}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {projectTasks?.length > 0 ? (
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Related tasks
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
            Attachments
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
            {uploading ? 'Uploading…' : '+ Add file'}
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
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
