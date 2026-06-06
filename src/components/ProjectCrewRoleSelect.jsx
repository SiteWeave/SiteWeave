import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PROJECT_CREW_ROLES } from '@siteweave/core-logic';

const ROLE_I18N_KEYS = {
  PM: 'share.project_role_pm',
  Team: 'share.project_role_team',
  Subcontractor: 'share.project_role_sub',
  Client: 'share.project_role_client',
};

/**
 * @param {import('react-i18next').TFunction} t
 * @returns {{ value: string; label: string }[]}
 */
export function useProjectCrewRoleOptions(t) {
  return useMemo(
    () => PROJECT_CREW_ROLES.map((value) => ({
      value,
      label: t(ROLE_I18N_KEYS[value] || value),
    })),
    [t],
  );
}

/**
 * @param {import('react-i18next').TFunction} t
 * @param {string | null | undefined} value
 */
export function projectCrewRoleLabel(t, value) {
  const key = ROLE_I18N_KEYS[value];
  return key ? t(key) : (value || t('share.project_role_team'));
}

function ProjectCrewRoleSelect({
  value,
  onChange,
  companyAccessName = null,
  collapsed = false,
  onExpand,
  showHelper = true,
  disabled = false,
  id,
  compact = false,
}) {
  const { t } = useTranslation();
  const options = useProjectCrewRoleOptions(t);
  const roleLabel = projectCrewRoleLabel(t, value);

  if (collapsed) {
    return (
      <div className={compact ? 'flex flex-col items-end gap-1' : 'space-y-1'}>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700">
          {t('share.role_default_badge', { role: roleLabel })}
        </span>
        {companyAccessName && (
          <p className="text-xs text-slate-500">
            {t('share.company_access', { role: companyAccessName })}
          </p>
        )}
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            {t('share.change_role_on_project')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? 'min-w-[10rem]' : 'space-y-1.5'}>
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-slate-800"
      >
        {t('share.role_on_this_project')}
      </label>
      <select
        id={id}
        value={value || 'Team'}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {companyAccessName && (
        <p className="text-xs text-slate-500">
          {t('share.company_access', { role: companyAccessName })}
        </p>
      )}
      {showHelper && (
        <p className="text-xs leading-relaxed text-slate-500">
          {t('share.role_on_project_helper')}
        </p>
      )}
    </div>
  );
}

export default ProjectCrewRoleSelect;
