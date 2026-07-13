import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProjectPhotoRoll } from '@siteweave/core-logic';
import { supabaseClient } from '../context/AppContext';

const FILTERS = [
  { id: 'all', sources: null, labelKey: 'mobile.photo_roll_filter_all' },
  { id: 'tasks', sources: ['task'], labelKey: 'mobile.photo_roll_filter_tasks' },
  { id: 'site_day', sources: ['site_day'], labelKey: 'mobile.photo_roll_filter_site_day' },
  { id: 'issues', sources: ['issue'], labelKey: 'mobile.photo_roll_filter_issues' },
];

export default function ProjectPhotoRollPanel({ projectId, t }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchProjectPhotoRoll(supabaseClient, projectId, { limit: 120 });
      setItems(rows);
    } catch (err) {
      console.error('ProjectPhotoRollPanel:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const def = FILTERS.find((f) => f.id === filter);
    if (!def?.sources) return items;
    return items.filter((row) => def.sources.includes(row.source));
  }, [items, filter]);

  if (loading) {
    return <p className="text-sm text-gray-500">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-4" data-testid="project-photo-roll-panel">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold border ${
              filter === f.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>
      {visibleItems.length === 0 ? (
        <p className="text-sm text-gray-500">{t('mobile.photo_roll_empty')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
              onClick={() => setViewer(item)}
            >
              <img
                src={item.thumbnail_url || item.full_url}
                alt={item.caption || item.task_title || 'Project photo'}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {viewer ? (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6"
          onClick={() => setViewer(null)}
          role="presentation"
        >
          <img
            src={viewer.full_url || viewer.thumbnail_url}
            alt={viewer.caption || viewer.task_title || 'Project photo'}
            className="max-h-[90vh] max-w-full object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
