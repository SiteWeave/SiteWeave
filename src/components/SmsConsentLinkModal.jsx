import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import LoadingSpinner from './LoadingSpinner';
import ModalOverlay from './ModalOverlay';

export default function SmsConsentLinkModal({
  open,
  onClose,
  consentUrl,
  maskedPhone,
  expiresAt,
  loading = false,
  error = null,
}) {
  const { t } = useTranslation();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !consentUrl) {
      setQrDataUrl('');
      return undefined;
    }
    let cancelled = false;
    QRCode.toDataURL(consentUrl, { margin: 2, width: 220 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => { cancelled = true; };
  }, [open, consentUrl]);

  const expiryLabel = useMemo(() => {
    if (!expiresAt) return null;
    try {
      return new Date(expiresAt).toLocaleString();
    } catch {
      return null;
    }
  }, [expiresAt]);

  const handleCopy = async () => {
    if (!consentUrl || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(consentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay
      onClose={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sms-consent-link-title"
    >
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 id="sms-consent-link-title" className="text-lg font-semibold text-slate-900">
          {t('sms.web_consent.link_modal_title')}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t('sms.web_consent.link_modal_subtitle')}</p>

        {loading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : (
          <>
            {maskedPhone ? (
              <p className="mt-4 text-sm text-slate-600">
                {t('sms.web_consent.link_modal_phone', { phone: maskedPhone })}
              </p>
            ) : null}

            {qrDataUrl ? (
              <div className="mt-4 flex justify-center">
                <img src={qrDataUrl} alt={t('sms.web_consent.qr_alt')} className="rounded-lg border border-slate-200" />
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="break-all text-xs text-slate-700">{consentUrl}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="app-action-secondary rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
              >
                {copied ? t('sms.web_consent.copied') : t('sms.web_consent.copy_link')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {t('common.close')}
              </button>
            </div>

            {expiryLabel ? (
              <p className="mt-3 text-xs text-slate-500">
                {t('sms.web_consent.link_expires', { date: expiryLabel })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </ModalOverlay>
  );
}
