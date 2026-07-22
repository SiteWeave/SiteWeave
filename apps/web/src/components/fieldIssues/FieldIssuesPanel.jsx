import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchProjectIssues,
  createProjectIssue,
  createWalkthroughIssue,
  subscribeProjectIssues,
  groupIssuesByLocation,
  isProjectCloseoutReady,
  createProjectCloseoutReviewLink,
  exportPunchListPdf,
} from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { useWorkspaceTier } from '../../hooks/useWorkspaceTier';
import Icon from '../Icon';
import DateDropdown from '../DateDropdown';
import UpgradeRequiredModal from '../UpgradeRequiredModal';
import { logFieldIssueCreated } from '../../utils/activityLogger';
import { markIssuesRead } from '../../utils/issuesReadState';
import { savePunchListPdf } from '../../utils/savePunchListPdf';
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
  const { canExport } = useWorkspaceTier();
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');
  const [viewMode, setViewMode] = useState('list');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [closeoutBannerDismissed, setCloseoutBannerDismissed] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [newIssue, setNewIssue] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    dueDate: '',
    assigned_to_user_id: '',
    location: '',
  });
  const [walkthroughIssue, setWalkthroughIssue] = useState({
    location: '',
    description: '',
    photoFile: null,
  });

  const hasLocations = useMemo(
    () => issues.some((issue) => String(issue.location || '').trim()),
    [issues],
  );

  const closeoutReady = useMemo(
    () => isProjectCloseoutReady(projectTasks),
    [projectTasks],
  );

  const groupedIssues = useMemo(() => groupIssuesByLocation(issues), [issues]);

  const projectTeamContacts = useMemo(
    () => {
      const onProject = state.contacts.filter((contact) => {
        const hasProjectAccess = contact.project_contacts?.some(
          (pc) =>
            pc.project_id === projectId ||
            pc.project_id === String(projectId) ||
            String(pc.project_id) === String(projectId),
        );
        return hasProjectAccess;
      });
      if (onProject.length > 0) return onProject;

      // Fallback: org team contacts (profiles) when project_contacts aren't hydrated
      const orgId = project?.organization_id || state.currentOrganization?.id;
      return state.contacts.filter((contact) => {
        if (orgId && contact.organization_id && String(contact.organization_id) !== String(orgId)) {
          return false;
        }
        const type = String(contact.type || '').toLowerCase();
        return !type || type === 'team' || type === 'internal' || type === 'user';
      });
    },
    [state.contacts, projectId, project?.organization_id, state.currentOrganization?.id],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const orgId = project?.organization_id || state.currentOrganization?.id;
      const contactIds = projectTeamContacts.map((c) => c.id).filter(Boolean);

      let profileQuery = supabaseClient
        .from('profiles')
        .select('id, contact_id, contacts:contact_id(name)');

      if (contactIds.length > 0) {
        profileQuery = profileQuery.in('contact_id', contactIds);
      } else if (orgId) {
        profileQuery = profileQuery.eq('organization_id', orgId);
      } else {
        if (!cancelled) setAssigneeOptions([]);
        return;
      }

      const { data: profiles } = await profileQuery;
      if (cancelled) return;
      const opts = (profiles || [])
        .map((p) => ({
          userId: p.id,
          label: p.contacts?.name || t('fieldIssues.team_member'),
        }))
        .filter((o) => o.userId);
      setAssigneeOptions(opts);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectTeamContacts, project?.organization_id, state.currentOrganization?.id, t]);

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
        location: newIssue.location?.trim() || null,
      });
      await logFieldIssueCreated(created, state.user, projectId);
      setShowCreate(false);
      setNewIssue({
        title: '',
        description: '',
        priority: 'Medium',
        dueDate: '',
        assigned_to_user_id: '',
        location: '',
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

  const handleShareReviewLink = async () => {
    if (!canExport) {
      setShowUpgrade(true);
      return;
    }
    try {
      const { url } = await createProjectCloseoutReviewLink(supabaseClient, {
        projectId,
        organizationId: project.organization_id,
      });
      await navigator.clipboard.writeText(url);
      addToast(t('punchList.share_review_link'), 'success');
    } catch (e) {
      addToast(e.message || t('punchList.share_error'), 'error');
    }
  };

  const handleExportPdf = async () => {
    if (!canExport) {
      setShowUpgrade(true);
      return;
    }
    setExportBusy(true);
    try {
      const result = await exportPunchListPdf(supabaseClient, projectId);
      const saveResult = await savePunchListPdf(result.html, {
        defaultFilename: result.filename || `${project?.name || 'project'}_punch_list.pdf`,
      });
      if (!saveResult.ok && !saveResult.canceled) {
        throw new Error(saveResult.error || t('punchList.export_error'));
      }
      if (saveResult.ok && !saveResult.canceled) {
        addToast(t('punchList.export_success'), 'success');
      }
    } catch (e) {
      addToast(e.message || t('punchList.export_error'), 'error');
    } finally {
      setExportBusy(false);
    }
  };

  const handleWalkthroughCreate = async () => {
    if (!walkthroughIssue.location.trim()) {
      addToast(t('punchList.location_required'), 'error');
      return;
    }
    if (!walkthroughIssue.photoFile) {
      addToast(t('punchList.photo_required'), 'error');
      return;
    }
    if (!project?.organization_id) {
      addToast(t('fieldIssues.org_missing'), 'error');
      return;
    }
    setIsCreating(true);
    try {
      const created = await createWalkthroughIssue(supabaseClient, {
        project_id: projectId,
        organization_id: project.organization_id,
        location: walkthroughIssue.location.trim(),
        description: walkthroughIssue.description.trim() || null,
        created_by_user_id: state.user?.id,
      });
      if (created?.id && walkthroughIssue.photoFile) {
        const safeName = walkthroughIssue.photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `field-issues/${created.id}/before_${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabaseClient.storage
          .from('message_files')
          .upload(path, walkthroughIssue.photoFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: walkthroughIssue.photoFile.type || 'image/jpeg',
          });
        if (uploadError) throw uploadError;
        const { error: updatePhotoError } = await supabaseClient
          .from('project_issues')
          .update({ before_photo_path: path })
          .eq('id', created.id);
        if (updatePhotoError) throw updatePhotoError;
      }
      setWalkthroughIssue({ location: '', description: '', photoFile: null });
      setShowWalkthrough(false);
      await load();
      addToast(t('punchList.item_saved_next'), 'success');
    } catch (e) {
      addToast(e.message || t('punchList.save_error'), 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const renderIssueList = () => {
    if (viewMode === 'location' && hasLocations) {
      return groupedIssues.map((group) => (
        <div key={group.location || 'general'} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">
            {group.location || t('punchList.unlocated_section')}
          </h3>
          {group.items.map((issue) => (
            <FieldIssueCard
              key={issue.id}
              issue={issue}
              selected={selectedIssue?.id === issue.id}
              onSelect={setSelectedIssue}
            />
          ))}
        </div>
      ));
    }
    return issues.map((issue) => (
      <FieldIssueCard
        key={issue.id}
        issue={issue}
        selected={selectedIssue?.id === issue.id}
        onSelect={setSelectedIssue}
      />
    ));
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
          {hasLocations ? (
            <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'}`}
              >
                {t('punchList.view_list')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('location')}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${viewMode === 'location' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'}`}
              >
                {t('punchList.view_location')}
              </button>
            </div>
          ) : null}
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowWalkthrough(true)}
            className="app-action-secondary px-3 py-1.5 text-xs font-semibold rounded-lg"
          >
            {t('punchList.start_walkthrough')}
          </button>
          {issues.length > 0 ? (
            <>
              <button
                type="button"
                onClick={handleShareReviewLink}
                className="app-action-secondary px-3 py-1.5 text-xs font-semibold rounded-lg"
              >
                {t('punchList.share_review_link')}
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exportBusy}
                className="app-action-secondary px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                {exportBusy ? t('common.loading') : t('punchList.export_pdf')}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="app-action-primary px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0"
          >
            {t('fieldIssues.new_issue_button')}
          </button>
        </div>
      </div>

      {closeoutReady && !closeoutBannerDismissed ? (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{t('punchList.closeout_banner_title')}</p>
            <p className="text-xs text-slate-600">{t('punchList.closeout_banner_body')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowWalkthrough(true)}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              {t('punchList.start_walkthrough')}
            </button>
            <button type="button" onClick={() => setCloseoutBannerDismissed(true)} className="text-slate-400 hover:text-slate-600">
              <Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}

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
              {renderIssueList()}
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
        <div className="fixed inset-0 backdrop-blur-sm bg-slate-900/20 flex items-start justify-center overflow-y-auto py-8 z-50 p-4">
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
              <input
                type="text"
                placeholder={t('punchList.location_placeholder')}
                value={newIssue.location}
                onChange={(e) => setNewIssue({ ...newIssue, location: e.target.value })}
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

      {showWalkthrough ? (
        <div className="fixed inset-0 backdrop-blur-sm bg-slate-900/20 flex items-start justify-center overflow-y-auto py-8 z-50 p-4">
          <div className="app-card max-w-xl w-full shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">{t('punchList.walkthrough_title')}</h3>
              <button type="button" onClick={() => setShowWalkthrough(false)} className="text-slate-400">
                <Icon path="M6 18L18 6M6 6l12 12" className="w-6 h-6" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-600">{t('punchList.walkthrough_hint')}</p>
              <label
                htmlFor="walkthrough-photo-file"
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 text-base"
              >
                <span className="font-semibold text-blue-600 hover:text-blue-700">
                  {t('punchList.choose_image')}
                </span>
                <span className="min-w-0 truncate text-right text-sm text-slate-500">
                  {walkthroughIssue.photoFile?.name || t('punchList.no_file_selected')}
                </span>
              </label>
              <input
                id="walkthrough-photo-file"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setWalkthroughIssue({ ...walkthroughIssue, photoFile: e.target.files?.[0] || null })}
                className="sr-only"
              />
              <input
                type="text"
                placeholder={t('punchList.location_placeholder')}
                value={walkthroughIssue.location}
                onChange={(e) => setWalkthroughIssue({ ...walkthroughIssue, location: e.target.value })}
                className="w-full text-base px-4 py-3 border border-slate-200 rounded-xl"
              />
              <textarea
                placeholder={t('punchList.note_placeholder')}
                value={walkthroughIssue.description}
                onChange={(e) => setWalkthroughIssue({ ...walkthroughIssue, description: e.target.value })}
                rows={3}
                className="w-full text-base px-4 py-3 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="px-6 py-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowWalkthrough(false)}
                className="px-4 py-2.5 text-base text-slate-600 bg-slate-100 rounded-xl"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleWalkthroughCreate}
                disabled={isCreating}
                className="px-4 py-2.5 text-base font-semibold bg-blue-600 text-white rounded-xl disabled:opacity-50"
              >
                {isCreating ? t('fieldIssues.creating') : t('punchList.save_and_next')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <UpgradeRequiredModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="punch_list_export"
      />
    </div>
  );
}
