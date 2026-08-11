import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient } from '../context/AppContext';
import {
  getLatestPmActions,
  parseLocalDateOnly,
  pmActionsRowHasContent,
  pmActionsTodayIso,
} from '@siteweave/core-logic';

const FIELDS = [
  { key: 'rfi_notes', labelKey: 'rfi' },
  { key: 'submittals_notes', labelKey: 'submittals' },
  { key: 'long_lead_time_notes', labelKey: 'long_lead_time' },
  { key: 'change_orders_notes', labelKey: 'change_orders' },
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
    return FIELDS.map(({ key, labelKey }) => {
      const text = String(row[key] || '').trim();
      return text ? { key, labelKey, text } : null;
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
      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-sky-950/90">{preview}</p>
    </button>
  );
}

export default PmActionsBanner;
