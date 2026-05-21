import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchProjectIssues,
  createProjectIssue,
  subscribeProjectIssues,
} from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import Icon from '../Icon';
import DateDropdown from '../DateDropdown';
import { getFieldIssueDisplayStatus } from '../../utils/fieldIssueStatus';
import { logFieldIssueCreated } from '../../utils/activityLogger';
import { markIssuesRead } from '../../utils/issuesReadState';
import FieldIssueCard from './FieldIssueCard';
import IssueDetailDrawer from './IssueDetailDrawer';

const STATUS_FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];

export default function FieldIssuesPanel({ projectId, project, projectTasks = [], embedded = false }) {
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [newIssue, setNewIssue] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    dueDate: '',
    assigned_to_user_id: '',
  });

  const projectTeamContacts = useMemo(
    () =>
      state.contacts.filter((contact) => {
        const hasProjectAccess = contact.project_contacts?.some(
          (pc) =>
            pc.project_id === projectId ||
            pc.project_id === String(projectId) ||
            String(pc.project_id) === String(projectId),
        );
        return hasProjectAccess && contact.type === 'Team';
      }),
    [state.contacts, projectId],
  );

  useEffect(() => {
    if (!projectTeamContacts.length) {
      setAssigneeOptions([]);
      return;
    }
    const contactIds = projectTeamContacts.map((c) => c.id).filter(Boolean);
    (async () => {
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, contact_id, contacts:contact_id(name)')
        .in('contact_id', contactIds);
      const opts = (profiles || []).map((p) => ({
        userId: p.id,
        label: p.contacts?.name || 'Team member',
      }));
      setAssigneeOptions(opts);
    })();
  }, [projectTeamContacts]);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setIsLoading(true);
      const rows = await fetchProjectIssues(supabaseClient, projectId, { statusFilter });
      setIssues(rows);
      setSelectedIssue((sel) => {
        if (!sel) return sel;
        return rows.find((r) => r.id === sel.id) || sel;
      });
    } catch (e) {
      console.error(e);
      addToast('Error loading field issues', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, statusFilter, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!projectId) return;
    markIssuesRead(projectId);
    return subscribeProjectIssues(supabaseClient, projectId, load);
  }, [projectId, load]);

  const handleCreate = async () => {
    if (!newIssue.title.trim()) {
      addToast('Please enter an issue title', 'error');
      return;
    }
    if (!project?.organization_id) {
      addToast('Project organization missing', 'error');
      return;
    }

    setIsCreating(true);
    try {
      const created = await createProjectIssue(supabaseClient, {
        project_id: projectId,
        organization_id: project.organization_id,
        title: newIssue.title,
        description: newIssue.description,
        priority: newIssue.priority,
        due_date: newIssue.dueDate || null,
        created_by_user_id: state.user?.id,
        assigned_to_user_id: newIssue.assigned_to_user_id || null,
      });
      await logFieldIssueCreated(created, state.user, projectId);
      setShowCreate(false);
      setNewIssue({
        title: '',
        description: '',
        priority: 'Medium',
        dueDate: '',
        assigned_to_user_id: '',
      });
      setSelectedIssue(created);
      await load();
      addToast('Issue created.', 'success');
    } catch (e) {
      addToast(e.message || 'Error creating issue', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleIssueUpdated = (updated) => {
    setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setSelectedIssue(updated);
  };

  const handleIssueDeleted = (issueId) => {
    setIssues((prev) => prev.filter((i) => i.id !== issueId));
    setSelectedIssue(null);
  };

  return (
    <div className={`flex flex-col min-h-0 h-full ${embedded ? '' : 'p-6 app-card'}`}>
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div>
            <h2 className={embedded ? 'text-base font-semibold text-slate-900' : 'text-xl font-bold text-slate-900'}>
              Field issues
            </h2>
          </div>
          <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-1">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setStatusFilter(option.key);
                  setSelectedIssue(null);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  statusFilter === option.key
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                aria-pressed={statusFilter === option.key}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="app-action-primary px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0"
        >
          + New issue
        </button>
      </div>

      <div className="flex flex-1 min-h-0 gap-0">
        <div className={`flex flex-col min-h-0 ${selectedIssue ? 'w-2/5 lg:w-1/2' : 'w-full'}`}>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : issues.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-2">
              <p className="text-sm font-medium text-slate-700">No issues</p>
              <p className="text-xs text-slate-500 mt-1">Log site problems for triage and follow-up.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-3 text-xs font-medium text-blue-600 hover:underline"
              >
                Create first issue
              </button>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {issues.map((issue) => (
                <FieldIssueCard
                  key={issue.id}
                  issue={issue}
                  selected={selectedIssue?.id === issue.id}
                  onSelect={setSelectedIssue}
                />
              ))}
            </div>
          )}
        </div>

        {selectedIssue ? (
          <div className="flex-1 min-w-0 min-h-0">
            <IssueDetailDrawer
              issue={selectedIssue}
              project={project}
              assigneeOptions={assigneeOptions}
              projectTasks={projectTasks}
              currentUser={state.user}
              onClose={() => setSelectedIssue(null)}
              onUpdated={handleIssueUpdated}
              onDeleted={handleIssueDeleted}
            />
          </div>
        ) : null}
      </div>

      {showCreate ? (
        <div className="fixed inset-0 backdrop-blur-sm bg-slate-900/20 flex items-center justify-center z-50 p-4">
          <div className="app-card max-w-md w-full shadow-2xl">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">New field issue</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400">
                <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input
                type="text"
                placeholder="Title *"
                value={newIssue.title}
                onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg"
              />
              <textarea
                placeholder="What happened on site?"
                value={newIssue.description}
                onChange={(e) => setNewIssue({ ...newIssue, description: e.target.value })}
                rows={3}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg"
              />
              <select
                value={newIssue.priority}
                onChange={(e) => setNewIssue({ ...newIssue, priority: e.target.value })}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
              <DateDropdown
                value={newIssue.dueDate}
                onChange={(v) => setNewIssue({ ...newIssue, dueDate: v })}
                label="Due date"
              />
              <select
                value={newIssue.assigned_to_user_id}
                onChange={(e) => setNewIssue({ ...newIssue, assigned_to_user_id: e.target.value })}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="">Assign to…</option>
                {assigneeOptions.map((opt) => (
                  <option key={opt.userId} value={opt.userId}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-50"
              >
                {isCreating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
