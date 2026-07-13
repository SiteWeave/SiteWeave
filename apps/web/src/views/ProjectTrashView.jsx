import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  fetchTrashedProjects,
  purgeProjectPermanently,
  restoreProject,
  PROJECT_TRASH_RETENTION_DAYS,
} from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from '../components/LoadingSpinner';
import PermanentDeleteProjectDialog from '../components/PermanentDeleteProjectDialog';
import { ROUTE_PATHS } from '../config/routes';
import { formatLocalDateOnly } from '@siteweave/core-logic';

function ProjectTrashView() {
  const { t, i18n } = useTranslation();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [restoringId, setRestoringId] = useState(null);
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [purging, setPurging] = useState(false);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchTrashedProjects(supabaseClient);
      setProjects(rows);
    } catch (error) {
      addToast(t('projectTrash.load_error', { message: error.message }), 'error');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [projects, search]);

  const handleRestore = async (project) => {
    setRestoringId(project.id);
    try {
      const restored = await restoreProject(supabaseClient, project.id);
      dispatch({ type: 'ADD_PROJECT', payload: restored });
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      addToast(t('projectTrash.restored', { name: project.name }), 'success');
    } catch (error) {
      addToast(t('projectTrash.restore_error', { message: error.message }), 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePurgeConfirm = async (confirmName) => {
    if (!purgeTarget) return;
    setPurging(true);
    try {
      await purgeProjectPermanently(supabaseClient, {
        projectId: purgeTarget.id,
        confirmName,
      });
      setProjects((prev) => prev.filter((p) => p.id !== purgeTarget.id));
      dispatch({ type: 'DELETE_PROJECT', payload: purgeTarget.id });
      addToast(t('projectTrash.purged', { name: purgeTarget.name }), 'success');
      setPurgeTarget(null);
    } catch (error) {
      addToast(t('projectTrash.purge_error', { message: error.message }), 'error');
    } finally {
      setPurging(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return formatLocalDateOnly(iso, i18n.language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="view-fade-in max-w-5xl mx-auto">
      <header className="mb-6 app-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <Link
              to={ROUTE_PATHS.projects}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 mb-2 inline-block"
            >
              ← {t('projectTrash.back_to_projects')}
            </Link>
            <h1 className="app-section-title text-2xl mb-1">{t('projectTrash.title')}</h1>
            <p className="app-section-subtitle text-sm">
              {t('projectTrash.subtitle', { days: PROJECT_TRASH_RETENTION_DAYS })}
            </p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('projectTrash.search_placeholder')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full sm:w-64"
          />
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" text={t('common.loading')} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="app-card p-10 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('projectTrash.empty_title')}</h2>
          <p className="text-sm text-gray-500 mb-6">{t('projectTrash.empty_description')}</p>
          <Link to={ROUTE_PATHS.projects} className="app-action-primary inline-flex rounded-lg px-4 py-2 text-sm font-semibold">
            {t('projectTrash.back_to_projects')}
          </Link>
        </div>
      ) : (
        <div className="app-card overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {filtered.map((project) => (
              <li key={project.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{project.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('projectTrash.deleted_on', { date: formatDate(project.trashed_at) })}
                    {project.trashed_by_name
                      ? ` ${t('projectTrash.deleted_by', { name: project.trashed_by_name })}`
                      : ''}
                    {' · '}
                    {t('projectTrash.purge_on', { date: formatDate(project.purge_after) })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestore(project)}
                    disabled={restoringId === project.id}
                    className="app-action-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {restoringId === project.id ? t('common.restoring') : t('projectTrash.restore')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurgeTarget(project)}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-700 border border-red-200 hover:bg-red-50"
                  >
                    {t('projectTrash.delete_permanently')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PermanentDeleteProjectDialog
        isOpen={Boolean(purgeTarget)}
        projectName={purgeTarget?.name}
        isLoading={purging}
        onClose={() => setPurgeTarget(null)}
        onConfirm={handlePurgeConfirm}
      />
    </div>
  );
}

export default ProjectTrashView;
