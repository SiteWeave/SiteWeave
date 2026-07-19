import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTE_PATHS } from '../config/routes';

export default function NotFoundView() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">SiteWeave</p>
        <p className="mt-4 text-6xl font-bold tabular-nums text-slate-300" aria-hidden="true">
          404
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">{t('not_found.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('not_found.body')}</p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to={ROUTE_PATHS.home}
            className="app-action-primary inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            {t('not_found.go_home')}
          </Link>
          <Link
            to={ROUTE_PATHS.login}
            className="app-action-secondary inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 sm:w-auto"
          >
            {t('not_found.go_login')}
          </Link>
        </div>
      </div>
    </div>
  );
}
