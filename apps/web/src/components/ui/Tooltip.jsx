import React, { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hover/focus tooltip. Use for:
 * - icon-only or collapsed-label controls
 * - truncated text
 * - extra context not in the visible label
 * - disabled reasons
 * Do not wrap labeled buttons whose visible text already says the same thing.
 */

const SHOW_DELAY_MS = 400;
const HIDE_DELAY_MS = 100;
const VIEWPORT_PAD = 8;
const GAP = 8;

let activeTooltip = null;

function assignRef(ref, value) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else ref.current = value;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function positionTooltip(anchorRect, bubbleRect, side = 'top') {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bw = bubbleRect?.width || 160;
  const bh = bubbleRect?.height || 32;
  const order = [side, 'top', 'bottom', 'right', 'left'].filter((s, i, arr) => arr.indexOf(s) === i);

  const place = (chosen) => {
    let top = 0;
    let left = 0;
    if (chosen === 'bottom') {
      top = anchorRect.bottom + GAP;
      left = anchorRect.left + anchorRect.width / 2 - bw / 2;
    } else if (chosen === 'left') {
      top = anchorRect.top + anchorRect.height / 2 - bh / 2;
      left = anchorRect.left - bw - GAP;
    } else if (chosen === 'right') {
      top = anchorRect.top + anchorRect.height / 2 - bh / 2;
      left = anchorRect.right + GAP;
    } else {
      top = anchorRect.top - bh - GAP;
      left = anchorRect.left + anchorRect.width / 2 - bw / 2;
    }
    left = Math.min(Math.max(left, VIEWPORT_PAD), vw - bw - VIEWPORT_PAD);
    top = Math.min(Math.max(top, VIEWPORT_PAD), vh - bh - VIEWPORT_PAD);
    return { top, left, side: chosen };
  };

  for (const candidate of order) {
    const next = place(candidate);
    const fitsY = next.top >= VIEWPORT_PAD && next.top + bh <= vh - VIEWPORT_PAD;
    const fitsX = next.left >= VIEWPORT_PAD && next.left + bw <= vw - VIEWPORT_PAD;
    if (fitsX && fitsY) return next;
  }
  return place(order[0]);
}

export default function Tooltip({
  content,
  side = 'top',
  delay = SHOW_DELAY_MS,
  children,
}) {
  const tooltipId = useId();
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const clearTimers = useCallback(() => {
    if (showTimer.current) window.clearTimeout(showTimer.current);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bubble = bubbleRef.current?.getBoundingClientRect();
    const next = positionTooltip(trigger.getBoundingClientRect(), bubble, side);
    setCoords({ top: next.top, left: next.left });
  }, [side]);

  const closerRef = useRef(null);
  closerRef.current = () => {
    clearTimers();
    setOpen(false);
    if (activeTooltip === closerRef.current) activeTooltip = null;
  };

  const show = useCallback(
    (immediate = false) => {
      clearTimers();
      const wait = immediate || prefersReducedMotion() ? 0 : delay;
      showTimer.current = window.setTimeout(() => {
        if (activeTooltip && activeTooltip !== closerRef.current) activeTooltip();
        activeTooltip = closerRef.current;
        setOpen(true);
      }, wait);
    },
    [clearTimers, delay],
  );

  const hide = useCallback((immediate = false) => {
    clearTimers();
    const wait = immediate || prefersReducedMotion() ? 0 : HIDE_DELAY_MS;
    hideTimer.current = window.setTimeout(() => {
      closerRef.current?.();
    }, wait);
  }, [clearTimers]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePosition, content]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') hide(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (content == null || content === false || content === '') {
    return children;
  }

  const trigger = isValidElement(children) ? children : <span>{children}</span>;
  const describedBy = [trigger.props['aria-describedby'], tooltipId].filter(Boolean).join(' ') || undefined;

  const merged = cloneElement(trigger, {
    ref: (node) => {
      triggerRef.current = node;
      assignRef(trigger.props.ref ?? trigger.ref, node);
    },
    'aria-describedby': describedBy,
    onMouseEnter: (event) => {
      trigger.props.onMouseEnter?.(event);
      show(false);
    },
    onMouseLeave: (event) => {
      trigger.props.onMouseLeave?.(event);
      hide(false);
    },
    onFocus: (event) => {
      trigger.props.onFocus?.(event);
      show(true);
    },
    onBlur: (event) => {
      trigger.props.onBlur?.(event);
      hide(true);
    },
  });

  return (
    <>
      {merged}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={bubbleRef}
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none max-w-[240px] rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-lg"
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                zIndex: 'var(--sw-z-tooltip)',
                opacity: 1,
                transform: 'translateZ(0)',
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function HelpTip({ content, label }) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700"
        aria-label={label || content}
        onClick={(event) => event.stopPropagation()}
      >
        ?
      </button>
    </Tooltip>
  );
}
