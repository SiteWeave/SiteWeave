import React from 'react';

export function SettingsSection({ title, description, children, className = '' }) {
  return (
    <section className={`py-8 border-b border-slate-200 last:border-b-0 last:pb-10 ${className}`}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
        <div className="lg:col-span-4 xl:col-span-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{description}</p>
          ) : null}
        </div>
        <div className="lg:col-span-8 xl:col-span-9 min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function SettingsField({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label ? (
        <label className="block text-sm font-medium text-slate-900 mb-1.5">{label}</label>
      ) : null}
      {children}
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function settingsInputClassName(extra = '') {
  return [
    'w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900',
    'placeholder:text-slate-400',
    'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export function SettingsPrimaryButton({ children, className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SettingsSecondaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SettingsDangerButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
