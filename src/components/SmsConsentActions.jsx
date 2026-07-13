import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeAssigneePhone } from '@siteweave/core-logic';
import { createSmsConsentLink } from '../utils/smsWebConsent';
import SmsConsentLinkModal from './SmsConsentLinkModal';

/** Mask E.164 for display, e.g. +1 (***) ***-1234 */
export function maskPhoneE164(e164) {
  const digits = String(e164 || '').replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const last4 = digits.slice(-4);
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (***) ***-${last4}`;
  }
  const cc = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : '';
  return `${cc}(***) ***-${last4}`;
}

function consentStatusLabel(status, t) {
  if (status === 'confirmed') return t('sms.web_consent.status_confirmed');
  if (status === 'pending') return t('sms.web_consent.status_pending');
  if (status === 'opted_out') return t('sms.web_consent.status_opted_out');
  return t('sms.web_consent.status_none');
}

function consentStatusClass(status) {
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (status === 'pending') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (status === 'opted_out') return 'bg-rose-50 text-rose-800 border-rose-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export function SmsConsentStatusBadge({ status }) {
  const { t } = useTranslation();
  if (!status) return null;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${consentStatusClass(status)}`}
    >
      {consentStatusLabel(status, t)}
    </span>
  );
}

export default function SmsConsentActions({
  supabaseClient,
  organizationId,
  phone,
  contactId = null,
  smsConsentStatus = null,
  compact = false,
  onConsentStatusChange,
}) {
  const { t } = useTranslation();
  const [pmAttestation, setPmAttestation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [consentUrl, setConsentUrl] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [error, setError] = useState(null);

  const normalized = normalizeAssigneePhone(phone, { defaultRegion: 'US' });
  const phoneOk = normalized.isValid;

  if (!phoneOk || !organizationId) return null;

  const handleGenerateLink = async () => {
    if (!compact && !pmAttestation) {
      setError(t('sms.web_consent.attestation_required'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await createSmsConsentLink({
        supabaseClient,
        organizationId,
        recipientPhone: phone,
        contactId,
        pmAttestation: true,
      });
      if (data?.reason === 'already_confirmed') {
        onConsentStatusChange?.('confirmed');
        setError(t('sms.already_confirmed'));
        return;
      }
      if (data?.reason === 'opted_out') {
        onConsentStatusChange?.('opted_out');
        setError(t('sms.opted_out'));
        return;
      }
      if (!data?.url) {
        setError(t('sms.web_consent.link_failed'));
        return;
      }
      setConsentUrl(data.url);
      setMaskedPhone(maskPhoneE164(data.phoneE164 || normalized.e164));
      setExpiresAt(data.expiresAt || null);
      onConsentStatusChange?.('pending');
      setModalOpen(true);
    } catch (e) {
      setError(e?.message || t('sms.web_consent.link_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={compact ? '' : 'mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3'}>
      {!compact ? (
        <div className="flex flex-wrap items-center gap-2">
          {smsConsentStatus ? <SmsConsentStatusBadge status={smsConsentStatus} /> : null}
          <p className="text-xs text-slate-600">{t('sms.web_consent.pm_section_hint')}</p>
        </div>
      ) : null}

      {smsConsentStatus !== 'confirmed' && smsConsentStatus !== 'opted_out' ? (
        compact ? (
          <button
            type="button"
            onClick={handleGenerateLink}
            disabled={loading}
            className="app-action-secondary rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 disabled:opacity-50"
          >
            {loading ? t('sms.web_consent.generating_link') : t('sms.web_consent.get_consent_link')}
          </button>
        ) : (
          <>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                checked={pmAttestation}
                onChange={(e) => setPmAttestation(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span className="text-xs text-slate-700">{t('sms.web_consent.pm_attestation')}</span>
            </label>
            <button
              type="button"
              onClick={handleGenerateLink}
              disabled={loading || !pmAttestation}
              className="app-action-secondary mt-2 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 disabled:opacity-50"
            >
              {loading ? t('sms.web_consent.generating_link') : t('sms.web_consent.get_consent_link')}
            </button>
          </>
        )
      ) : null}

      {error ? <p className={`text-xs text-rose-700 ${compact ? 'mt-1.5' : 'mt-2'}`}>{error}</p> : null}

      <SmsConsentLinkModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        consentUrl={consentUrl}
        maskedPhone={maskedPhone}
        expiresAt={expiresAt}
      />
    </div>
  );
}
