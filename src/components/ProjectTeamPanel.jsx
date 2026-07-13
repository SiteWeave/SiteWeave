import React from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from './Avatar';
import { SmsConsentStatusBadge } from './SmsConsentActions';
import { resolveContactSmsConsent } from '../utils/smsWebConsent';

function hasEmailableAddress(email) {
  return Boolean(email && String(email).trim().includes('@'));
}

function ContactRow({ contact, showDeployment = false, smsConsentMap = null }) {
  const { t } = useTranslation();
  const emailOk = hasEmailableAddress(contact.email);
  const phoneOk = Boolean(contact.phone && String(contact.phone).replace(/\D/g, '').length >= 7);
  const smsConsentStatus = smsConsentMap ? resolveContactSmsConsent(contact, smsConsentMap) : null;
  const isTradePartner = contact.type === 'Subcontractor';

  const primaryLine = isTradePartner && contact.company ? contact.company : contact.name;
  const secondaryLine = isTradePartner
    ? [contact.trade, contact.name !== contact.company ? contact.name : null].filter(Boolean).join(' · ')
    : (contact.role || contact.workContext?.assignedProjectNames?.join(', ') || '');

  return (
    <div className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      {contact.avatar_url ? (
        <img src={contact.avatar_url} alt={primaryLine} className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <Avatar name={primaryLine} size="md" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{primaryLine}</p>
        <p className="truncate text-xs text-gray-500">{secondaryLine || 'Project member'}</p>
        {showDeployment && contact.workContext?.tasksDueToday > 0 && (
          <p className="truncate text-xs text-blue-600">
            {t('team.tasks_due_today', { count: contact.workContext.tasksDueToday })}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5" aria-label="Notification readiness">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs ${
            emailOk ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-300'
          }`}
          title={emailOk ? 'Will receive task reminder emails' : 'No email on file'}
          aria-label={emailOk ? 'Email on file for reminders' : 'Missing email for reminders'}
        >
          @
        </span>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs ${
            phoneOk ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-gray-200 bg-white text-gray-300'
          }`}
          title={phoneOk ? 'Phone on file' : 'No phone on file'}
          aria-label={phoneOk ? 'Phone on file' : 'No phone on file'}
        >
          ☎
        </span>
        {smsConsentStatus ? <SmsConsentStatusBadge status={smsConsentStatus} /> : null}
      </div>
    </div>
  );
}

function ProjectTeamPanel({ project, contacts, onOpenDirectory, smsConsentMap = null }) {
  const { t } = useTranslation();
  const projectContacts = (contacts || []).filter(
    (contact) =>
      Array.isArray(contact.project_contacts) &&
      contact.project_contacts.some((pc) => String(pc.project_id) === String(project?.id)),
  );

  const teamMembers = projectContacts.filter((contact) => contact.type === 'Team');
  const subcontractors = projectContacts.filter((contact) => contact.type === 'Subcontractor');

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-gray-50">
      <div className="w-full shrink-0 border-b border-gray-200 px-5 py-4">
        <div className="flex w-full min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-900">{t('project_team.people_on_project')}</h3>
            <p className="mt-1 truncate text-sm text-gray-500">
              {project ? project.name : t('project_team.select_channel')}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenDirectory}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {t('navigation.trade_partners')}
          </button>
        </div>
      </div>

      <div className="w-full min-w-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {projectContacts.length === 0 ? (
          <div className="w-full rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
            {t('project_team.no_one_assigned')}
          </div>
        ) : (
          <>
            <section className="w-full min-w-0">
              <div className="mb-3 flex w-full items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('project_team.our_crew')}
                </h4>
                <span className="text-xs text-gray-400">{teamMembers.length}</span>
              </div>
              <div className="w-full space-y-2">
                {teamMembers.length > 0 ? (
                  teamMembers.map((contact) => (
                    <ContactRow key={contact.id} contact={contact} showDeployment smsConsentMap={smsConsentMap} />
                  ))
                ) : (
                  <p className="text-sm text-gray-500">{t('project_team.no_crew')}</p>
                )}
              </div>
            </section>

            <section className="w-full min-w-0">
              <div className="mb-3 flex w-full items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('navigation.trade_partners')}
                </h4>
                <span className="text-xs text-gray-400">{subcontractors.length}</span>
              </div>
              <div className="w-full space-y-2">
                {subcontractors.length > 0 ? (
                  subcontractors.map((contact) => (
                    <ContactRow key={contact.id} contact={contact} showDeployment={false} smsConsentMap={smsConsentMap} />
                  ))
                ) : (
                  <p className="text-sm text-gray-500">{t('project_team.no_trade_partners')}</p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default ProjectTeamPanel;
