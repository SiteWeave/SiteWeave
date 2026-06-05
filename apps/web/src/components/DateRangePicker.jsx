import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Single trigger + popover calendar for selecting a start/end range (YYYY-MM-DD).
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
}) {
  const [open, setOpen] = useState(false);
  const [numberOfMonths, setNumberOfMonths] = useState(1);
  const rootRef = useRef(null);

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

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
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
    '--rdp-accent-color': '#2563eb',
    '--rdp-accent-background-color': '#dbeafe',
  };

  const sm = size === 'sm';

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

      {open && (
        <div
          className={`absolute top-full z-30 overflow-visible border border-gray-200 bg-white shadow-xl ${
            sm
              ? 'left-0 mt-1.5 w-full min-w-[240px] max-w-[min(100vw-1rem,320px)] rounded-lg p-2'
              : compact
                ? 'left-0 mt-2 w-full min-w-0 rounded-xl p-2.5'
                : 'left-0 mt-2 max-w-[calc(100vw-2rem)] rounded-xl p-3'
          }`}
          role="dialog"
          aria-label="Choose date range"
          style={pickerStyle}
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
      )}
    </div>
  );
}

export default DateRangePicker;
