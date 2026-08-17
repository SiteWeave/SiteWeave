import React, { useCallback, useEffect, useMemo, useRef, useState, cloneElement, isValidElement } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { localDateIso } from '../utils/dateHelpers';

function isoToLocalDate(iso) {
  if (!iso || typeof iso !== 'string') return undefined;
  const parts = iso.split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return undefined;
  const [y, mo, d] = parts;
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

function formatRangeLabel(startIso, endIso, locale) {
  const from = isoToLocalDate(startIso);
  const to = isoToLocalDate(endIso);
  if (!from && !to) return '';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  if (from && to) {
    const a = from.toLocaleDateString(locale, opts);
    const b = to.toLocaleDateString(locale, opts);
    return a === b ? a : `${a} – ${b}`;
  }
  if (from) return `${from.toLocaleDateString(locale, opts)} – …`;
  return '';
}

const VIEWPORT_PADDING = 8;

/**
 * SiteWeave-owned schedule range picker (react-day-picker).
 * Preserve: start-then-end clicks; 2 months ≥768px; portal positioning;
 * local YYYY-MM-DD; presets/clear; compact/sm/elevated variants.
 * Use elevated inside modals (z-70) so the calendar sits above modal backdrops (z-50/z-60).
 * Do not replace with HeroUI DateRangePicker in this migration.
 */
function DateRangePicker({
  startValue,
  endValue,
  onChange,
  label = 'Date range',
  id,
  /** React node, or `({ goToMonth, goToToday }) => node` to control the visible month. */
  presets = null,
  className = '',
  compact = false,
  size = 'default',
  elevated = false,
  /** Custom trigger element (e.g. task date text). Opens the calendar on click. */
  trigger = null,
  /** Open the calendar as soon as this component mounts. */
  defaultOpen = false,
  onOpenChange = null,
  /** Close the popover once both start and end are selected. */
  closeOnComplete = false,
  /** When set, shows a Save button that commits the current draft range. */
  onSave = null,
  /** Called after Clear dates (in addition to onChange with empty values). */
  onClear = null,
  clearLabel = 'Clear dates',
  saveLabel = 'Save',
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [numberOfMonths, setNumberOfMonths] = useState(1);
  const [popoverStyle, setPopoverStyle] = useState({
    position: 'fixed',
    top: 0,
    left: 0,
    width: 'max-content',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  const [month, setMonth] = useState(() => new Date());
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const setPickerOpen = useCallback((next) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () =>
      setNumberOfMonths(compact || size === 'sm' ? 1 : mq.matches ? 2 : 1);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [compact, size]);

  const selected = useMemo(() => {
    const from = isoToLocalDate(startValue);
    const to = isoToLocalDate(endValue);
    if (!from && !to) return undefined;
    return { from: from || undefined, to: to || undefined };
  }, [startValue, endValue]);

  useEffect(() => {
    if (!open) return;
    setMonth(selected?.from || selected?.to || new Date());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- only reset month when opening

  const goToMonth = useCallback((date) => {
    const next = date instanceof Date ? date : new Date();
    setMonth(Number.isNaN(next.getTime()) ? new Date() : next);
  }, []);

  const presetContent =
    typeof presets === 'function'
      ? presets({ goToMonth, goToToday: () => goToMonth(new Date()) })
      : presets;

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const popoverEl = popoverRef.current;
    const popoverWidth = popoverEl?.offsetWidth ?? (compact || size === 'sm' ? 280 : 320);
    const popoverHeight = popoverEl?.offsetHeight ?? 360;
    const gap = 6;

    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const openAbove = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

    let top = openAbove ? rect.top - popoverHeight - gap : rect.bottom + gap;
    let left = rect.left;

    if (left + popoverWidth > window.innerWidth - VIEWPORT_PADDING) {
      left = window.innerWidth - popoverWidth - VIEWPORT_PADDING;
    }
    left = Math.max(VIEWPORT_PADDING, left);
    top = Math.max(
      VIEWPORT_PADDING,
      Math.min(top, window.innerHeight - popoverHeight - VIEWPORT_PADDING),
    );

    setPopoverStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: 'max-content',
      maxWidth: `${window.innerWidth - VIEWPORT_PADDING * 2}px`,
      zIndex: elevated ? 70 : 50,
      visibility: 'visible',
    });
  }, [elevated]);

  useEffect(() => {
    if (!open) return undefined;

    updatePopoverPosition();
    const raf = requestAnimationFrame(updatePopoverPosition);

    const onScrollOrResize = () => updatePopoverPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePopoverPosition, numberOfMonths]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setPickerOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setPickerOpen]);

  const handleSelect = (range) => {
    if (!range) {
      onChange({ start: '', end: '' });
      return;
    }
    if (range.from && !range.to) {
      onChange({ start: localDateIso(range.from), end: '' });
      return;
    }
    if (range.from && range.to) {
      onChange({
        start: localDateIso(range.from),
        end: localDateIso(range.to),
      });
      if (closeOnComplete) setPickerOpen(false);
    }
  };

  const summary = formatRangeLabel(startValue, endValue);
  const labelId = id || 'task-date-range';
  const year = new Date().getFullYear();
  const sm = size === 'sm';

  const pickerStyle = {
    '--rdp-accent-color': 'var(--sw-color-accent-dark, #2563eb)',
    '--rdp-accent-background-color': 'var(--sw-color-accent-soft-border, #dbeafe)',
    ...(sm
      ? {
          // Compact sizing without transform+clip (which hid weeks 5–6).
          '--rdp-day-height': '2rem',
          '--rdp-day-width': '2rem',
          '--rdp-day_button-height': '1.75rem',
          '--rdp-day_button-width': '1.75rem',
          '--rdp-nav_button-height': '1.75rem',
          '--rdp-nav_button-width': '1.75rem',
          '--rdp-nav-height': '2rem',
          '--rdp-weekday-padding': '0.25rem 0',
          '--rdp-months-gap': '0.5rem',
          fontSize: '12px',
        }
      : {}),
  };

  const popoverClassName = `w-max overflow-visible border border-gray-200 bg-white shadow-xl ${
    sm
      ? 'min-w-[240px] max-w-[min(100vw-1rem,320px)] rounded-lg p-2'
      : compact
        ? 'min-w-[280px] max-w-[min(100vw-1rem,22rem)] rounded-xl p-2.5'
        : 'max-w-[min(100vw-2rem,40rem)] rounded-xl p-3'
  }`;

  const popoverContent = open ? (
    <div
      ref={popoverRef}
      className={popoverClassName}
      role="dialog"
      aria-label="Choose date range"
      data-siteweave-date-range-popover
      style={{ ...pickerStyle, ...popoverStyle }}
    >
      {presetContent ? (
        <div
          className={
            sm
              ? 'mb-2 flex flex-wrap gap-1.5 border-b border-gray-100 pb-2'
              : 'mb-3 flex flex-wrap gap-2 border-b border-gray-100 pb-3'
          }
        >
          {presetContent}
        </div>
      ) : null}
      <div className={`relative z-0 w-max max-w-full ${sm ? '' : `overflow-x-auto ${compact ? 'pr-0.5' : ''}`}`}>
        <DayPicker
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          month={month}
          onMonthChange={setMonth}
          numberOfMonths={numberOfMonths}
          captionLayout="dropdown"
          fromYear={year - 3}
          toYear={year + 12}
        />
      </div>
      <div
        className={
          sm
            ? 'relative z-20 mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2'
            : 'relative z-20 mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3'
        }
        data-siteweave-date-range-actions
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onChange({ start: '', end: '' });
            onClear?.();
          }}
          className={
            sm
              ? 'relative z-20 min-h-8 px-1 text-[10px] font-medium text-gray-500 hover:text-gray-800'
              : 'relative z-20 min-h-9 px-1 text-xs font-medium text-gray-500 hover:text-gray-800'
          }
        >
          {clearLabel}
        </button>
        {typeof onSave === 'function' ? (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSave({ start: startValue || '', end: endValue || '' });
              setPickerOpen(false);
            }}
            disabled={Boolean(startValue) !== Boolean(endValue)}
            className={
              sm
                ? 'relative z-20 rounded-md bg-blue-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40'
                : 'relative z-20 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40'
            }
          >
            {saveLabel}
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  const setTriggerNode = useCallback((node) => {
    triggerRef.current = node;
  }, []);

  const defaultTrigger = (
    <button
      ref={setTriggerNode}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-labelledby={label ? labelId : undefined}
      onClick={() => setPickerOpen(!open)}
      className={
        sm
          ? 'flex w-full items-center justify-between gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left text-xs shadow-xs transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
          : 'flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm shadow-xs transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
      }
    >
      <span className={`min-w-0 truncate ${summary ? 'text-gray-900' : 'text-gray-400'}`}>
        {summary || 'Select start and end dates'}
      </span>
      <svg
        className={sm ? 'h-3 w-3 shrink-0 text-gray-400' : 'h-4 w-4 shrink-0 text-gray-400'}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </button>
  );

  const customTrigger =
    trigger && isValidElement(trigger)
      ? cloneElement(trigger, {
          ref: setTriggerNode,
          type: trigger.props.type || 'button',
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          onClick: (e) => {
            trigger.props.onClick?.(e);
            if (!e.defaultPrevented) setPickerOpen(!open);
          },
        })
      : null;

  return (
    <div className={`relative ${sm ? 'text-[11px]' : ''} ${className}`} ref={rootRef}>
      {label && !trigger ? (
        <label
          id={labelId}
          className={
            sm
              ? 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500'
              : 'mb-1.5 block text-xs font-medium text-gray-600'
          }
        >
          {label}
        </label>
      ) : null}
      {customTrigger || defaultTrigger}

      {typeof document !== 'undefined' && popoverContent
        ? createPortal(popoverContent, document.body)
        : null}
    </div>
  );
}

export default DateRangePicker;
