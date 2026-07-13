import React from 'react';
import { useTranslation } from 'react-i18next';
import SmsConsentActions from './SmsConsentActions';

export default function SmsConsentLinkPrompt({
  open,
  onClose,
  supabaseClient,
  organizationId,
  phone,
  contactId = null,
  smsConsentStatus = null,
  onConsentStatusChange,
}) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">{t('sms.web_consent.link_modal_title')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('sms.web_consent.link_modal_subtitle')}</p>
        <SmsConsentActions
          supabaseClient={supabaseClient}
          organizationId={organizationId}
          phone={phone}
          contactId={contactId}
          smsConsentStatus={smsConsentStatus}
          onConsentStatusChange={onConsentStatusChange}
        />
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
