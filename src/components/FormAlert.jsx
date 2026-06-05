import React from 'react';

const BANNER_VARIANT_STYLES = {
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
};

/** Input classes when a field has a validation/API error (red border, no heavy fill). */
export function fieldInputClassName(hasError, baseClassName = '') {
  const base =
    baseClassName ||
    'block w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2';
  return [
    base,
    hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/20',
  ].join(' ');
}

/** Compact error under a field — red border on input + icon + short text (see auth forms). */
export function FieldError({ message, className = '' }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className={`mt-1.5 flex items-start gap-1.5 text-sm leading-snug text-red-600 ${className}`}
    >
      <span
        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-600 text-white"
        aria-hidden
      >
        <span className="text-[10px] font-bold leading-none">!</span>
      </span>
      <span>{message}</span>
    </p>
  );
}

/**
 * Section/modal banner (tab-level errors). For field-level errors use FieldError.
 */
function FormAlert({ message, variant = 'error', className = '' }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`rounded-lg border p-3 text-sm ${BANNER_VARIANT_STYLES[variant] || BANNER_VARIANT_STYLES.error} ${className}`}
    >
      {message}
    </div>
  );
}

export default FormAlert;
