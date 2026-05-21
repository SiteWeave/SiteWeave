import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Gantt from 'frappe-gantt';
import 'frappe-gantt/dist/frappe-gantt.css';
import { toFrappeGanttTasks } from '../utils/ganttAdapter';
import Avatar from './Avatar';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import UpgradeRequiredModal from './UpgradeRequiredModal';

const ROW_HEIGHT = 40;
const LEFT_PANEL_DEFAULT = 340;
const LEFT_PANEL_MIN = 260;
const LEFT_PANEL_MAX = 720;
/** Must match frappe-gantt: upper + lower + 10 (see update_view_scale in library). */
const UPPER_HEADER_HEIGHT = 22;
const LOWER_HEADER_HEIGHT = 18;
const VIEW_MODES = ['Day', 'Week', 'Month', 'Year'];

/** Pick a zoom level so the full schedule is easier to scan at a glance. */
function pickViewModeForScheduleSpan(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const times = [];
  for (const t of list) {
    if (t.start_date) times.push(new Date(`${t.start_date}T12:00:00`).getTime());
    if (t.due_date) times.push(new Date(`${t.due_date}T12:00:00`).getTime());
  }
  if (times.length < 2) return 'Week';
  const spanDays = (Math.max(...times) - Math.min(...times)) / 86400000;
  if (spanDays <= 21) return 'Day';
  if (spanDays <= 120) return 'Week';
  if (spanDays <= 800) return 'Month';
  return 'Year';
}

function formatGanttDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function StatusBadge({ completed }) {
  if (completed) {
    return (
      <span className="inline-flex whitespace-nowrap items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex whitespace-nowrap items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </svg>
      To do
    </span>
  );
}

/**
 * Renders a Gantt chart with split pane: left task table + right timeline.
 * Tasks should be pre-ordered (e.g. via orderTasksForGantt) so rows align.
 */
export default function GanttChart({
  tasks = [],
  dependencies = [],
  criticalPathIds = [],
  showCriticalPath = true,
  onToggleCriticalPath,
}) {
  const chartContainerRef = useRef(null);
  const ganttInstanceRef = useRef(null);
  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const isSyncingScroll = useRef(false);
  const viewModeRef = useRef('Week');
  const [viewMode, setViewMode] = useState('Week');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(LEFT_PANEL_DEFAULT);
  const [isCompactWindow, setIsCompactWindow] = useState(false);
  const [showExportUpgrade, setShowExportUpgrade] = useState(false);
  const { canExport } = useWorkspaceTier();
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(LEFT_PANEL_DEFAULT);
  const leftPanelMin = isCompactWindow ? 220 : LEFT_PANEL_MIN;

  useEffect(() => {
    const syncCompactMode = () => {
      setIsCompactWindow(window.innerWidth < 1500);
    };
    syncCompactMode();
    window.addEventListener('resize', syncCompactMode);
    return () => window.removeEventListener('resize', syncCompactMode);
  }, []);

  useEffect(() => {
    setLeftPanelWidth((current) => Math.max(leftPanelMin, current));
  }, [leftPanelMin]);

  const handleResizeMove = useCallback((e) => {
    const delta = e.clientX - resizeStartX.current;
    const next = Math.min(LEFT_PANEL_MAX, Math.max(leftPanelMin, resizeStartWidth.current + delta));
    setLeftPanelWidth(next);
  }, [leftPanelMin]);

  const handleResizeEnd = useCallback(() => {
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [handleResizeMove]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = leftPanelWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [leftPanelWidth, handleResizeMove, handleResizeEnd]);

  useEffect(() => {
    const leftEl = leftScrollRef.current;
    const rightEl = rightScrollRef.current;
    if (!leftEl || !rightEl) return;
    function onRightScroll() {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      leftEl.scrollTop = rightEl.scrollTop;
      isSyncingScroll.current = false;
    }
    function onLeftScroll() {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      rightEl.scrollTop = leftEl.scrollTop;
      isSyncingScroll.current = false;
    }
    rightEl.addEventListener('scroll', onRightScroll);
    leftEl.addEventListener('scroll', onLeftScroll);
    return () => {
      rightEl.removeEventListener('scroll', onRightScroll);
      leftEl.removeEventListener('scroll', onLeftScroll);
    };
  }, []);

  const ganttTasks = useMemo(() => {
    const criticalIds = showCriticalPath ? (criticalPathIds || []) : [];
    return toFrappeGanttTasks(
      Array.isArray(tasks) ? tasks : [],
      Array.isArray(dependencies) ? dependencies : [],
      criticalIds
    );
  }, [tasks, dependencies, criticalPathIds, showCriticalPath]);

  const tasksWithDates = useMemo(() => {
    const taskById = new Map((Array.isArray(tasks) ? tasks : []).map((t) => [t.id, t]));
    return ganttTasks.map((gt) => taskById.get(gt.id)).filter(Boolean);
  }, [tasks, ganttTasks]);
  const criticalCount = useMemo(
    () => (Array.isArray(criticalPathIds) ? criticalPathIds.length : 0),
    [criticalPathIds]
  );

  /** Mouse drag on the chart pane pans the scroll area (document-level move so pan works past the edge). */
  useEffect(() => {
    const el = rightScrollRef.current;
    if (!el || tasksWithDates.length === 0) return;

    let active = false;
    let pointerId = 0;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;

    const moveOpts = { passive: false };

    const endPan = () => {
      if (!active) return;
      active = false;
      el.classList.remove('gantt-panning');
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', onPointerMove, moveOpts);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!active || e.pointerId !== pointerId) return;
      e.preventDefault();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.scrollLeft = startScrollLeft - dx;
      el.scrollTop = startScrollTop - dy;
    };

    const onPointerUp = (e) => {
      if (!active || e.pointerId !== pointerId) return;
      endPan();
    };

    const onPointerDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const t = e.target;
      if (t && typeof t.closest === 'function' && t.closest('a, button, select, input, textarea, [role="button"]')) return;
      active = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = el.scrollLeft;
      startScrollTop = el.scrollTop;
      el.classList.add('gantt-panning');
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', onPointerMove, moveOpts);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    };

    el.addEventListener('pointerdown', onPointerDown);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      endPan();
      document.body.style.userSelect = '';
    };
  }, [tasksWithDates.length]);

  const handleChangeViewMode = useCallback((mode) => {
    setViewMode(mode);
    viewModeRef.current = mode;
    try { ganttInstanceRef.current?.change_view_mode?.(mode, true); } catch (_) { /* noop */ }
  }, []);

  const handleFitTimeline = useCallback(() => {
    const mode = pickViewModeForScheduleSpan(tasks);
    setViewMode(mode);
    viewModeRef.current = mode;
    try {
      const inst = ganttInstanceRef.current;
      if (inst?.change_view_mode) {
        inst.change_view_mode(mode, false);
        requestAnimationFrame(() => {
          try {
            inst.set_scroll_position?.('start');
          } catch (_) { /* noop */ }
        });
      }
    } catch (_) { /* noop */ }
  }, [tasks]);

  const handleExportCSV = useCallback(() => {
    if (!canExport) {
      setShowExportUpgrade(true);
      return;
    }
    const headers = ['Name', 'Start', 'Due', 'Status', 'Assignee'];
    const rows = tasksWithDates.map((t) => [
      (t.text || '').replace(/"/g, '""'),
      t.start_date || '',
      t.due_date || '',
      t.completed ? 'Complete' : 'To do',
      t.contacts?.name || ''
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'gantt-tasks.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }, [tasksWithDates, canExport]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    if (ganttTasks.length === 0) {
      container.innerHTML = '';
      ganttInstanceRef.current = null;
      return;
    }
    container.innerHTML = '';
    try {
      const instance = new Gantt(container, ganttTasks, {
        view_mode: viewModeRef.current,
        readonly: true,
        readonly_progress: true,
        readonly_dates: true,
        view_mode_select: false,
        date_format: 'YYYY-MM-DD',
        scroll_to: 'today',
        today_button: false,
        bar_height: 28,
        padding: 12,
        container_height: 'auto',
        upper_header_height: UPPER_HEADER_HEIGHT,
        lower_header_height: LOWER_HEADER_HEIGHT,
        infinite_padding: false,
        lines: 'both',
        popup_on: 'hover',
        move_dependencies: false,
      });
      ganttInstanceRef.current = instance;
    } catch (err) {
      console.error('Gantt render error', err);
      container.innerHTML = '<div class="p-4 text-red-600 text-sm">Could not render chart.</div>';
    }
    // viewModeRef intentionally excluded — view changes go through the API
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ganttTasks]);

  if (tasksWithDates.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 p-10 text-center text-gray-600 text-sm rounded-lg bg-slate-50 border border-slate-200"
        style={{ minHeight: 220 }}
      >
        <div className="w-12 h-12 rounded-full bg-slate-200/80 flex items-center justify-center" aria-hidden>
          <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="font-medium text-gray-800">No dated tasks yet</p>
        <p className="max-w-sm text-gray-500">
          Add a start date or due date on at least one task. The chart lines up with your task list on the left.
        </p>
      </div>
    );
  }

  return (
    <div className="gantt-split-root flex flex-col flex-1 min-h-0 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 py-2.5 px-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900 pr-2">Gantt</h2>
          <select
            value={viewMode}
            onChange={(e) => handleChangeViewMode(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-md text-sm bg-white shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="View mode"
          >
            {VIEW_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleFitTimeline}
            className="px-3 py-1.5 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
            title="Zoom to fit the full date range of scheduled work"
          >
            Fit timeline
          </button>
          <span className="text-xs text-slate-500 hidden sm:inline" title="Use the mouse on the chart area">
            Drag chart to pan
          </span>
          <div className="flex-1 min-w-[8px]" />
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Export CSV
          </button>
          <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 border border-slate-300 rounded-md bg-white">
            <input
              type="checkbox"
              checked={showCriticalPath}
              onChange={(e) => onToggleCriticalPath?.(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Show critical path
              <span className="ml-1 text-xs text-gray-500">
                ({criticalCount} task{criticalCount === 1 ? '' : 's'})
              </span>
            </span>
          </label>
        </div>
        {showCriticalPath && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 pl-0.5">
            <span className="font-medium text-slate-500 uppercase tracking-wide">Bar colors</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-600 ring-1 ring-red-800/30" aria-hidden />
              Critical path
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-slate-400 ring-1 ring-slate-500/30" aria-hidden />
              Scheduled
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-600 ring-1 ring-emerald-800/30" aria-hidden />
              Complete
            </span>
            <span className="flex-1 min-w-3" />
            <span className="text-xs text-slate-600 bg-red-50 border border-red-100 rounded-md px-2 py-1 ml-auto">
              Critical tasks drive finish date.
            </span>
          </div>
        )}
        {!showCriticalPath && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 pl-0.5">
            <span className="font-medium text-slate-500 uppercase tracking-wide">Bar colors</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-slate-400 ring-1 ring-slate-500/30" aria-hidden />
              Open
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-600 ring-1 ring-emerald-800/30" aria-hidden />
              Complete
            </span>
            <span className="flex-1 min-w-3" />
            <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-md px-2 py-1 ml-auto">
              Turn on critical path to highlight schedule-driving tasks.
            </span>
          </div>
        )}
      </div>

      {/* Split pane: shared vertical scroll */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: task table (no horizontal scroll) */}
        <div className="flex-shrink-0 flex flex-col bg-white overflow-hidden" style={{ width: leftPanelWidth }}>
          {/* Left table header — fixed height to match chart header */}
          <div
            className="flex-shrink-0 bg-slate-50 border-b border-slate-200 flex items-end"
            style={{ height: UPPER_HEADER_HEIGHT + LOWER_HEADER_HEIGHT + 10 }}
          >
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2 px-3 w-[32%] ${isCompactWindow ? 'gantt-compact-label' : ''}`}>Name</th>
                  <th className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2 px-2 w-[16%] ${isCompactWindow ? 'gantt-compact-label' : ''}`}>Start</th>
                  <th className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2 px-2 w-[14%] ${isCompactWindow ? 'gantt-compact-label' : ''}`}>Due</th>
                  <th className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2 px-2 w-[22%] ${isCompactWindow ? 'gantt-compact-label' : ''}`}>Status</th>
                  <th className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2 px-2 w-[16%] ${isCompactWindow ? 'gantt-compact-label' : ''}`}>Assignee</th>
                </tr>
              </thead>
            </table>
          </div>
          {/* Left table body — scrolls with chart */}
          <div ref={leftScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden gantt-left-scroll">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <tbody>
                {tasksWithDates.map((task) => {
                  const isChild = !!task.parent_task_id;
                  const isSelected = selectedTaskId === task.id;
                  const contact = task.contacts;
                  return (
                    <tr
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTaskId(task.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTaskId(task.id); } }}
                      className={`border-b border-gray-100 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'} focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 focus:outline-none`}
                      style={{ height: ROW_HEIGHT }}
                    >
                      <td className={`py-1 px-3 text-sm text-gray-900 truncate w-[32%] ${isCompactWindow ? 'gantt-compact-label' : ''}`} style={{ paddingLeft: isChild ? 28 : 12 }}>
                        <span className={isChild ? 'text-gray-700' : 'font-semibold'}>
                          {task.text || 'Task'}
                        </span>
                      </td>
                      <td className={`py-1 px-2 text-xs text-gray-500 w-[16%] ${isCompactWindow ? 'gantt-compact-label' : ''}`}>{formatGanttDate(task.start_date)}</td>
                      <td className={`py-1 px-2 text-xs text-gray-500 w-[14%] ${isCompactWindow ? 'gantt-compact-label' : ''}`}>{formatGanttDate(task.due_date)}</td>
                      <td className="py-1 px-2 w-[22%]">
                        <StatusBadge completed={task.completed} />
                      </td>
                      <td className="py-1 px-2 w-[16%] align-middle">
                        <div className="flex justify-center">
                          {contact ? (
                            contact.avatar_url ? (
                              <img
                                src={contact.avatar_url}
                                alt=""
                                title={contact.name || 'Assignee'}
                                className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-slate-200/80"
                              />
                            ) : (
                              <span title={contact.name || 'Assignee'}>
                                <Avatar name={contact.name} size="sm" />
                              </span>
                            )
                          ) : (
                            <span className="inline-flex w-7 h-7 items-center justify-center text-slate-300 text-xs" title="Unassigned">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resize handle — drag to show more task list or more chart */}
        <div
          role="separator"
          aria-label="Resize task list"
          tabIndex={0}
          onMouseDown={handleResizeStart}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); setLeftPanelWidth((w) => Math.max(leftPanelMin, w - 20)); }
            if (e.key === 'ArrowRight') { e.preventDefault(); setLeftPanelWidth((w) => Math.min(LEFT_PANEL_MAX, w + 20)); }
          }}
          className="gantt-resize-handle flex-shrink-0 w-2 flex flex-col items-center justify-center cursor-col-resize bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors select-none border-l border-r border-gray-200"
          style={{ minWidth: 8 }}
        >
          <div className="w-1 h-16 rounded-full bg-gray-400 opacity-70" />
        </div>

        {/* Right: chart (horizontal scroll here, vertical synced with left) */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Chart header area is inside the chart SVG, so no separate element needed */}
          <div
            ref={rightScrollRef}
            className="gantt-right-scroll flex-1 min-h-0 cursor-grab overflow-x-auto overflow-y-auto active:cursor-grabbing"
          >
            <div
              ref={chartContainerRef}
              className="gantt-chart-wrapper"
            />
          </div>
        </div>
      </div>

      <style>{`
        .gantt-chart-wrapper {
          --g-arrow-color: #64748b;
          --g-tick-color: #e2e8f0;
          --g-tick-color-thick: #cbd5e1;
          --g-row-color: #fafafa;
          --g-row-border-color: #e2e8f0;
          --g-border-color: #e2e8f0;
          --g-text-muted: #64748b;
          --g-text-dark: #0f172a;
          --g-header-background: #f8fafc;
          --g-weekend-highlight-color: #f1f5f9;
        }

        /* Prevent frappe-gantt from adding its own scrollbars */
        .gantt-chart-wrapper .gantt-container {
          overflow: visible !important;
          height: auto !important;
        }
        .gantt-chart-wrapper .gantt {
          overflow: visible !important;
        }

        /* Hide frappe-gantt's built-in view mode select (we use our toolbar) */
        .gantt-chart-wrapper .view-mode-select,
        .gantt-chart-wrapper .viewmode-select,
        .gantt-chart-wrapper .today-button {
          display: none !important;
        }

        /* Today marker (frappe uses current-highlight) */
        .gantt-chart-wrapper .current-highlight,
        .gantt-chart-wrapper .current-ball-highlight,
        .gantt-chart-wrapper .today-highlight {
          display: none !important;
        }

        /* Status-based bar colors */
        .gantt-critical .bar { fill: #dc2626 !important; stroke: #b91c1c !important; }
        .gantt-critical .bar-progress { fill: #f87171 !important; }
        .gantt-complete .bar { fill: #059669 !important; stroke: #047857 !important; }
        .gantt-complete .bar-progress { fill: #34d399 !important; }
        .gantt-todo .bar { fill: #94a3b8 !important; stroke: #64748b !important; }
        .gantt-todo .bar-progress { fill: #cbd5e1 !important; }

        /* Milestone: thin diamond-like bar (standalone or combined) */
        .gantt-milestone .bar,
        .gantt-todo-milestone .bar,
        .gantt-complete-milestone .bar,
        .gantt-critical-milestone .bar {
          rx: 2 !important;
          ry: 2 !important;
        }
        .gantt-milestone .bar-wrapper .bar,
        .gantt-todo-milestone .bar-wrapper .bar,
        .gantt-complete-milestone .bar-wrapper .bar,
        .gantt-critical-milestone .bar-wrapper .bar {
          width: 12px !important;
        }
        .gantt-todo-milestone .bar { fill: #94a3b8 !important; stroke: #64748b !important; }
        .gantt-complete-milestone .bar { fill: #059669 !important; stroke: #047857 !important; }
        .gantt-critical-milestone .bar { fill: #dc2626 !important; stroke: #b91c1c !important; }

        /* Sync vertical scroll between left table and chart */
        .gantt-left-scroll, .gantt-right-scroll {
          scrollbar-width: thin;
          scrollbar-color: #d1d5db transparent;
        }
        .gantt-left-scroll::-webkit-scrollbar,
        .gantt-right-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .gantt-left-scroll::-webkit-scrollbar-thumb,
        .gantt-right-scroll::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }
        .gantt-left-scroll::-webkit-scrollbar-track,
        .gantt-right-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        /* Left pane scrolls for sync but hides its scrollbar so only one is visible */
        .gantt-left-scroll {
          overflow-y: scroll !important;
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        .gantt-left-scroll::-webkit-scrollbar {
          display: none !important;
        }

        .gantt-right-scroll.gantt-panning {
          cursor: grabbing !important;
        }
      `}</style>
      <UpgradeRequiredModal
        isOpen={showExportUpgrade}
        onClose={() => setShowExportUpgrade(false)}
        feature="exports"
      />
    </div>
  );
}
