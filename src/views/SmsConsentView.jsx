import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../components/LoadingSpinner';
import { confirmSmsWebConsent, fetchSmsConsentRequest } from '../utils/smsWebConsent';

const TERMS_URL = 'https://www.siteweave.org/legal/terms-of-service';
const PRIVACY_URL = 'https://www.siteweave.org/legal/privacy-policy';

/** Sample values for the public registration / review page at /sms-opt-in */
const DEMO_ORG = 'Example Construction Co.';
const DEMO_MASKED_PHONE = '+1 (***) ***-1234';

function StatusMessage({ title, body, variant = 'neutral' }) {
  const tones = {
    neutral: 'border-gray-200 bg-white text-gray-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    error: 'border-rose-200 bg-rose-50 text-rose-950',
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
  };
  return (
    <div className={`rounded-2xl border px-5 py-6 text-center shadow-sm ${tones[variant] || tones.neutral}`}>
      <h1 className="text-lg font-semibold">{title}</h1>
      {body ? <p className="mt-2 text-sm leading-relaxed opacity-90">{body}</p> : null}
    </div>
  );
}

export default function SmsConsentView({ demo = false }) {
  const { token } = useParams();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(!demo);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [request, setRequest] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (demo) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      if (!token) {
        setLoadError('not_found');
        setLoading(false);
        return;
      }
      try {
        const data = await fetchSmsConsentRequest(token);
        if (!cancelled) {
          setRequest(data);
          if (data.status === 'confirmed') setConfirmed(true);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.code || 'request_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, demo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreed || submitting || confirmed) return;

    if (demo) {
      setConfirmed(true);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await confirmSmsWebConsent(token);
      setConfirmed(true);
    } catch (err) {
      setSubmitError(err.code || 'confirm_failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <LoadingSpinner />
      </div>
    );
  }

  if (!demo && loadError === 'not_found') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md">
          <StatusMessage
            variant="error"
            title={t('sms.web_consent.not_found_title')}
            body={t('sms.web_consent.not_found_body')}
          />
        </div>
      </div>
    );
  }

  if (!demo && request?.status === 'opted_out') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md">
          <StatusMessage
            variant="warning"
            title={t('sms.web_consent.opted_out_title')}
            body={t('sms.web_consent.opted_out_body')}
          />
        </div>
      </div>
    );
  }

  if (!demo && request?.status === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md">
          <StatusMessage
            variant="warning"
            title={t('sms.web_consent.expired_title')}
            body={t('sms.web_consent.expired_body')}
          />
        </div>
      </div>
    );
  }

  if (confirmed || (!demo && request?.status === 'confirmed')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md">
          <StatusMessage
            variant="success"
            title={demo ? t('sms.web_consent.demo_success_title') : t('sms.web_consent.success_title')}
            body={demo ? t('sms.web_consent.demo_success_body') : t('sms.web_consent.success_body')}
          />
        </div>
      </div>
    );
  }

  const orgName = demo ? DEMO_ORG : (request?.organizationName || t('sms.web_consent.default_org'));
  const maskedPhone = demo ? DEMO_MASKED_PHONE : (request?.maskedPhone || '***');

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">SiteWeave</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{t('sms.web_consent.page_title')}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {t('sms.web_consent.page_subtitle', { org: orgName })}
          </p>
          {demo ? (
            <p className="mt-3 text-xs font-medium text-slate-500">
              {t('sms.web_consent.demo_badge')}
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-4 text-sm leading-relaxed text-slate-700">
            <p>{t('sms.web_consent.disclosure_intro')}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{t('sms.web_consent.disclosure_types')}</li>
              <li>{t('sms.web_consent.disclosure_frequency')}</li>
              <li>{t('sms.web_consent.disclosure_rates')}</li>
              <li>{t('sms.web_consent.disclosure_help_stop')}</li>
            </ul>
            <p>
              {t('sms.web_consent.disclosure_legal')}{' '}
              <a href={TERMS_URL} className="font-medium text-blue-600 underline" target="_blank" rel="noreferrer">
                {t('sms.web_consent.terms_link')}
              </a>
              {' · '}
              <a href={PRIVACY_URL} className="font-medium text-blue-600 underline" target="_blank" rel="noreferrer">
                {t('sms.web_consent.privacy_link')}
              </a>
            </p>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('sms.web_consent.phone_label')}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">{maskedPhone}</p>
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-800">
              {t('sms.web_consent.checkbox_label', { org: orgName })}
            </span>
          </label>

          {submitError ? (
            <p className="mt-3 text-sm text-rose-700">
              {submitError === 'opted_out'
                ? t('sms.web_consent.opted_out_body')
                : t('sms.web_consent.submit_failed')}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!agreed || submitting}
            className="app-action-primary mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t('sms.web_consent.submitting') : t('sms.web_consent.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
