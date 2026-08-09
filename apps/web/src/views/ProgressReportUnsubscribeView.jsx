import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { ROUTE_PATHS } from '../config/routes';

/**
 * Public one-click unsubscribe for progress report emails.
 */
function ProgressReportUnsubscribeView() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [status, setStatus] = useState('loading'); // loading | success | already | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('progressReports.unsubscribe_missing_token', {
        defaultValue: 'This unsubscribe link is missing a token.',
      }));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('unsubscribe-progress-report', {
          body: { token },
        });
        if (cancelled) return;
        if (error) throw error;
        if (!data?.success) {
          setStatus('error');
          setMessage(data?.error || t('progressReports.unsubscribe_failed', {
            defaultValue: 'Could not unsubscribe. The link may be invalid.',
          }));
          return;
        }
        if (data.already_unsubscribed) {
          setStatus('already');
        } else {
          setStatus('success');
        }
        setMessage(
          data.message ||
            t('progressReports.unsubscribe_success', {
              defaultValue: 'You have been unsubscribed from this progress report.',
            }),
        );
      } catch (err) {
        if (cancelled) return;
        console.error('unsubscribe:', err);
        setStatus('error');
        setMessage(
          err?.message ||
            t('progressReports.unsubscribe_failed', {
              defaultValue: 'Could not unsubscribe. The link may be invalid.',
            }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 sm:p-8 text-center">
        {status === 'loading' ? (
          <LoadingSpinner size="lg" text={t('common.loading', { defaultValue: 'Loading…' })} />
        ) : (
          <>
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                status === 'error' ? 'bg-red-100' : 'bg-green-100'
              }`}
            >
              {status === 'error' ? (
                <span className="text-2xl text-red-600" aria-hidden>
                  !
                </span>
              ) : (
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {status === 'error'
                ? t('progressReports.unsubscribe_error_title', { defaultValue: 'Unsubscribe failed' })
                : t('progressReports.unsubscribe_title', { defaultValue: 'Unsubscribed' })}
            </h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <Link to={ROUTE_PATHS.login} className="text-sm font-medium text-blue-600 hover:text-blue-700">
              {t('progressReports.unsubscribe_go_login', { defaultValue: 'Go to SiteWeave' })}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default ProgressReportUnsubscribeView;
