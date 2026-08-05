import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  presets = null,
  className = '',
  compact = false,
  size = 'default',
  elevated = false,
}) {
  const [open, setOpen] = useState(false);
  const [numberOfMonths, setNumberOfMonths] = useState(1);
  const [popoverStyle, setPopoverStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

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

  const defaultMonth = selected?.from || selected?.to || new Date();

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
      width: compact || size === 'sm' ? `${Math.min(popoverWidth, window.innerWidth - VIEWPORT_PADDING * 2)}px` : undefined,
      zIndex: elevated ? 70 : 50,
    });
  }, [compact, elevated, size]);

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
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
    }
  };

  const summary = formatRangeLabel(startValue, endValue);
  const labelId = id || 'task-date-range';
  const year = new Date().getFullYear();

  const pickerStyle = {
    '--rdp-accent-color': 'var(--sw-color-accent-dark, #2563eb)',
    '--rdp-accent-background-color': 'var(--sw-color-accent-soft-border, #dbeafe)',
  };

  const sm = size === 'sm';

  const popoverClassName = `overflow-visible border border-gray-200 bg-white shadow-xl ${
    sm
      ? 'min-w-[240px] max-w-[min(100vw-1rem,320px)] rounded-lg p-2'
      : compact
        ? 'min-w-[280px] rounded-xl p-2.5'
        : 'max-w-[calc(100vw-2rem)] rounded-xl p-3'
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
      {presets ? (
        <div
          className={
            sm
              ? 'mb-2 flex flex-wrap gap-1.5 border-b border-gray-100 pb-2'
              : 'mb-3 flex flex-wrap gap-2 border-b border-gray-100 pb-3'
          }
        >
          {presets}
        </div>
      ) : null}
      <div
        className={`overflow-visible ${compact && !sm ? 'overflow-x-auto pr-0.5' : ''} ${sm ? '' : 'overflow-x-auto'}`}
      >
        {sm ? (
          <div className="relative w-full" style={{ minHeight: '240px' }}>
            <div
              className="origin-top-left"
              style={{
                transform: 'scale(0.82)',
                width: '121.95%',
                marginBottom: '-12%',
              }}
            >
              <DayPicker
                mode="range"
                selected={selected}
                onSelect={handleSelect}
                defaultMonth={defaultMonth}
                numberOfMonths={numberOfMonths}
                captionLayout="dropdown"
                fromYear={year - 3}
                toYear={year + 12}
              />
            </div>
          </div>
        ) : (
          <DayPicker
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={defaultMonth}
            numberOfMonths={numberOfMonths}
            captionLayout="dropdown"
            fromYear={year - 3}
            toYear={year + 12}
          />
        )}
      </div>
      <div
        className={
          sm
            ? 'mt-2 flex justify-end border-t border-gray-100 pt-2'
            : 'mt-3 flex justify-end border-t border-gray-100 pt-3'
        }
      >
        <button
          type="button"
          onClick={() => {
            onChange({ start: '', end: '' });
            setOpen(false);
          }}
          className={
            sm
              ? 'text-[10px] font-medium text-gray-500 hover:text-gray-800'
              : 'text-xs font-medium text-gray-500 hover:text-gray-800'
          }
        >
          Clear dates
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative ${sm ? 'text-[11px]' : ''} ${className}`} ref={rootRef}>
      {label ? (
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
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={label ? labelId : undefined}
        onClick={() => setOpen((o) => !o)}
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

      {typeof document !== 'undefined' && popoverContent
        ? createPortal(popoverContent, document.body)
        : null}
    </div>
  );
}

export default DateRangePicker;
