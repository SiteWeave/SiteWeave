import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  { key: 'open', labelKey: 'fieldIssues.filter_open' },
  { key: 'closed', labelKey: 'fieldIssues.filter_closed' },
  { key: 'all', labelKey: 'fieldIssues.filter_all' },
];

export default function FieldIssuesPanel({ projectId, project, projectTasks = [], embedded = false }) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
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
        label: p.contacts?.name || t('fieldIssues.team_member'),
      }));
      setAssigneeOptions(opts);
    })();
  }, [projectTeamContacts]);

  const load = useCallback(async ({ append = false, beforeCreatedAt = null } = {}) => {
    if (!projectId) return;
    try {
      if (append) {
        setLoadingOlder(true);
      } else {
        setIsLoading(true);
      }
      const { issues: rows, hasMore: more } = await fetchProjectIssues(supabaseClient, projectId, {
        statusFilter,
        beforeCreatedAt,
      });
      setIssues((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(more);
      if (!append) {
        setSelectedIssue((sel) => {
          if (!sel) return sel;
          return rows.find((r) => r.id === sel.id) || sel;
        });
      }
    } catch (e) {
      console.error(e);
      addToast(t('fieldIssues.load_error'), 'error');
    } finally {
      setIsLoading(false);
      setLoadingOlder(false);
    }
  }, [projectId, statusFilter, addToast, t]);

  const loadOlder = useCallback(() => {
    const oldest = issues[issues.length - 1];
    if (!oldest?.created_at || loadingOlder) return;
    load({ append: true, beforeCreatedAt: oldest.created_at });
  }, [issues, loadingOlder, load]);

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
      addToast(t('fieldIssues.title_required'), 'error');
      return;
    }
    if (!project?.organization_id) {
      addToast(t('fieldIssues.org_missing'), 'error');
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
      addToast(t('fieldIssues.created'), 'success');
    } catch (e) {
      addToast(e.message || t('fieldIssues.create_error'), 'error');
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
              {t('collaboration.field_issues')}
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
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="app-action-primary px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0"
        >
          {t('fieldIssues.new_issue_button')}
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
              <p className="text-sm font-medium text-slate-700">{t('fieldIssues.no_issues')}</p>
              <p className="text-xs text-slate-500 mt-1">{t('fieldIssues.no_issues_hint')}</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-3 text-xs font-medium text-blue-600 hover:underline"
              >
                {t('fieldIssues.create_first')}
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
              {hasMore ? (
                <div className="flex justify-center pt-2 pb-1">
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                  >
                    {loadingOlder ? t('common.loading') : t('fieldIssues.load_older')}
                  </button>
                </div>
              ) : null}
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
              <h3 className="font-bold text-slate-900">{t('fieldIssues.new_issue')}</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400">
                <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input
                type="text"
                placeholder={t('fieldIssues.title_placeholder')}
                value={newIssue.title}
                onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg"
              />
              <textarea
                placeholder={t('fieldIssues.description_placeholder')}
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
                <option value="Low">{t('fieldIssues.priority_low')}</option>
                <option value="Medium">{t('fieldIssues.priority_medium')}</option>
                <option value="High">{t('fieldIssues.priority_high')}</option>
                <option value="Critical">{t('fieldIssues.priority_critical')}</option>
              </select>
              <DateDropdown
                value={newIssue.dueDate}
                onChange={(v) => setNewIssue({ ...newIssue, dueDate: v })}
                label={t('fieldIssues.due_date')}
              />
              <select
                value={newIssue.assigned_to_user_id}
                onChange={(e) => setNewIssue({ ...newIssue, assigned_to_user_id: e.target.value })}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="">{t('fieldIssues.assign_to')}</option>
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
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-50"
              >
                {isCreating ? t('fieldIssues.creating') : t('fieldIssues.create')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
