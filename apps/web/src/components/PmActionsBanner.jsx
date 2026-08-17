import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient } from '../context/AppContext';
import Icon from './Icon';
import {
  getLatestPmActions,
  parseLocalDateOnly,
  pmActionsRowHasContent,
  pmActionsTodayIso,
} from '@siteweave/core-logic';

const FIELDS = [
  { key: 'rfi_notes', labelKey: 'rfi', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'submittals_notes', labelKey: 'submittals', icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5' },
  { key: 'long_lead_time_notes', labelKey: 'long_lead_time', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'change_orders_notes', labelKey: 'change_orders', icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99' },
];

const STALE_DAYS = 14;

/**
 * Tiny right-rail banner: only renders when the project has PM Actions notes.
 */
function PmActionsBanner({ projectId, refreshKey = 0, onOpen }) {
  const { t } = useTranslation();
  const pk = (suffix) => `projectDetail.pm_actions.${suffix}`;
  const [row, setRow] = useState(null);

  useEffect(() => {
    if (!projectId) {
      setRow(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getLatestPmActions(supabaseClient, projectId);
        if (!cancelled) setRow(data);
      } catch {
        if (!cancelled) setRow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  const filled = useMemo(() => {
    if (!row || !pmActionsRowHasContent(row)) return [];
    return FIELDS.map(({ key, labelKey, icon }) => {
      const text = String(row[key] || '').trim();
      return text ? { key, labelKey, text, icon } : null;
    }).filter(Boolean);
  }, [row]);

  const isStale = useMemo(() => {
    if (!row?.as_of_date) return false;
    const asOf = parseLocalDateOnly(row.as_of_date);
    const today = parseLocalDateOnly(pmActionsTodayIso());
    if (!asOf || !today) return false;
    const diffMs = today.getTime() - asOf.getTime();
    return diffMs > STALE_DAYS * 24 * 60 * 60 * 1000;
  }, [row?.as_of_date]);

  if (!filled.length) return null;

  const preview = filled
    .map((f) => `${t(pk(f.labelKey))}: ${f.text}`)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left shadow-xs hover:bg-sky-100/80 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
      title={preview}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900">
          {t(pk('menu'))}
        </p>
        <span className="flex shrink-0 items-center gap-1.5">
          {isStale ? (
            <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
              {t(pk('stale'))}
            </span>
          ) : null}
          {row?.as_of_date ? (
            <span className="text-[10px] tabular-nums text-sky-800/70">{row.as_of_date}</span>
          ) : null}
        </span>
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {filled.map((f) => (
          <li key={f.key} className="flex items-start gap-2">
            <Icon path={f.icon} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-800/70" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">
                {t(pk(f.labelKey))}
              </p>
              <p className="line-clamp-1 text-xs leading-snug text-sky-950/90">{f.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </button>
  );
}

export default PmActionsBanner;
