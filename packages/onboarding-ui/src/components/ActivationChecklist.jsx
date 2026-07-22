import React, { useMemo } from 'react';
import TourIcon from './TourIcon';
import { ACTIVATION_ITEMS, getActivationProgress } from '../activationChecklist';

const ITEM_COPY = {
  workspace: {
    title: 'Workspace created',
    hint: 'Your office is ready',
  },
  project: {
    title: 'Create your first project',
    hint: 'From scratch or a starter template',
  },
  schedule: {
    title: 'Build your schedule',
    hint: 'Add phases and open the Gantt',
  },
  team: {
    title: 'Invite your team',
    hint: 'PMs, supers, and trade partners',
  },
  report: {
    title: 'Send a progress report',
    hint: 'Branded PDF for clients & architects',
  },
};

export default function ActivationChecklist({
  completed = {},
  onDismiss,
  onItemAction,
  primaryColor = '#3B82F6',
  title = 'Get your office set up',
  dismissLabel = 'Hide',
  progressLabel,
  formatProgress,
  itemCopy,
  className = '',
}) {
  const { done, total } = useMemo(() => getActivationProgress(completed), [completed]);

  const defaultProgressLabel = formatProgress
    ? formatProgress(done, total)
    : `${done} of ${total} complete`;
  const copyMap = itemCopy || ITEM_COPY;

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-xs ${className}`} data-testid="activation-checklist">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 [text-wrap:balance]">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-500 tabular-nums">{progressLabel || defaultProgressLabel}</p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg px-2 py-1 text-sm font-medium text-gray-500 transition-[transform,color] duration-150 hover:text-gray-700 active:scale-[0.96]"
          >
            {dismissLabel}
          </button>
        ) : null}
      </div>

      <div className="mb-4 h-2 w-full rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full transition-all duration-300"
          style={{ width: `${(done / total) * 100}%`, backgroundColor: primaryColor }}
        />
      </div>

      <ul className="space-y-2">
        {ACTIVATION_ITEMS.map((item) => {
          const isDone = Boolean(completed[item.id]);
          const copy = copyMap[item.id] || ITEM_COPY[item.id] || { title: item.id, hint: '' };
          const actionable = !isDone && !item.alwaysDone && onItemAction;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={actionable ? () => onItemAction(item.id) : undefined}
                disabled={!actionable}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-[transform,background-color,border-color] duration-150 ${
                  isDone
                    ? 'border-emerald-100 bg-emerald-50/60'
                    : actionable
                      ? 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40 active:scale-[0.99]'
                      : 'border-gray-100 bg-gray-50/50'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    isDone ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isDone ? <TourIcon name="check" className="h-4 w-4" /> : null}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${isDone ? 'text-emerald-900' : 'text-gray-900'}`}>
                    {copy.title}
                  </span>
                  <span className="block text-xs text-gray-500">{copy.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
