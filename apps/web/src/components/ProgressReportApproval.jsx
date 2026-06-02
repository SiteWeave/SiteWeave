import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ProgressReportPreview from './ProgressReportPreview';
import LoadingSpinner from './LoadingSpinner';
import {
  getProgressReportSchedules,
  approveReport,
  rejectReport
} from '@siteweave/core-logic';

/**
 * Progress Report Approval Component
 * Review and approve client-facing reports
 */
function ProgressReportApproval({ onBack, onApprove }) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [pendingReports, setPendingReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const audienceLabels = useMemo(
    () => ({
      client: t('progressReports.audience_client'),
      internal: t('progressReports.audience_internal'),
      executive: t('progressReports.audience_executive'),
    }),
    [t]
  );

  useEffect(() => {
    if (state.currentOrganization?.id) {
      loadPendingReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentOrganization?.id]);

  const loadPendingReports = async () => {
    setIsLoading(true);
    try {
      const orgId = state.currentOrganization?.id;
      if (!orgId) return;

      const allSchedules = await getProgressReportSchedules(supabaseClient, orgId, null);
      const pending = allSchedules.filter(s => 
        s.requires_approval && s.approval_status === 'pending_review'
      );
      setPendingReports(pending);
      
      if (pending.length > 0 && !selectedReport) {
        setSelectedReport(pending[0]);
      }
    } catch (error) {
      addToast(t('progressReports.approval.load_error', { message: error.message }), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (scheduleId) => {
    if (!confirm(t('progressReports.approval.approve_confirm'))) return;

    setIsProcessing(true);
    try {
      await approveReport(supabaseClient, scheduleId, state.user.id);
      addToast(t('progressReports.approval.approved'), 'success');
      loadPendingReports();
      if (onApprove) onApprove();
    } catch (error) {
      addToast(t('progressReports.approval.approve_error', { message: error.message }), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (scheduleId) => {
    if (!rejectionReason.trim()) {
      addToast(t('progressReports.approval.rejection_reason_required'), 'error');
      return;
    }

    if (!confirm(t('progressReports.approval.reject_confirm'))) return;

    setIsProcessing(true);
    try {
      await rejectReport(supabaseClient, scheduleId, rejectionReason);
      addToast(t('progressReports.approval.rejected'), 'success');
      setRejectionReason('');
      loadPendingReports();
    } catch (error) {
      addToast(t('progressReports.approval.reject_error', { message: error.message }), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatAudience = (audienceType) =>
    audienceLabels[audienceType] || audienceType;

  if (isLoading) {
    return <LoadingSpinner text={`${t('common.loading')}...`} />;
  }

  if (pendingReports.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">{t('progressReports.approval.no_pending')}</p>
        {onBack && (
          <button type="button"
            onClick={onBack}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            {t('progressReports.approval.back')}
          </button>
        )}
      </div>
    );
  }

  const currentReport = selectedReport || pendingReports[0];
  const recipientEmails =
    currentReport.progress_report_recipients?.map((r) => r.email).join(', ') || '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('progressReports.approval.title')}</h2>
          <p className="text-gray-600 mt-1">
            {pendingReports.length} {t('progressReports.status_pending')}
          </p>
        </div>
        {onBack && (
          <button type="button"
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ← {t('common.back')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">{t('progressReports.approval.title')}</h3>
            <div className="space-y-2">
              {pendingReports.map((report) => (
                <button type="button"
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  className={`w-full text-left p-3 rounded-lg border ${
                    selectedReport?.id === report.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-sm text-gray-900">{report.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatAudience(report.report_audience_type)} •{' '}
                    {t('progressReports.recipients_count', {
                      count: report.progress_report_recipients?.length || 0,
                    })}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Report Preview */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">{currentReport.name}</h3>
            
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>{t('progressReports.builder.recipients')}:</strong> {recipientEmails}
              </p>
              <p className="text-sm text-yellow-800 mt-1">
                {formatAudience(currentReport.report_audience_type)} •{' '}
                {t('progressReports.recipients_count', {
                  count: currentReport.progress_report_recipients?.length || 0,
                })}
              </p>
            </div>

            <ProgressReportPreview
              formData={currentReport}
              recipients={currentReport.progress_report_recipients || []}
              scheduleId={currentReport.id}
            />

            {/* Approval Actions */}
            <div className="mt-6 pt-6 border-t border-gray-200 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('progressReports.approval.rejection_reason')}
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  placeholder={t('progressReports.builder.message_placeholder')}
                />
              </div>

              <div className="flex gap-3">
                <button type="button"
                  onClick={() => handleApprove(currentReport.id)}
                  disabled={isProcessing}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {isProcessing
                    ? `${t('common.loading')}...`
                    : `✓ ${t('progressReports.approval.approve')}`}
                </button>
                <button type="button"
                  onClick={() => handleReject(currentReport.id)}
                  disabled={isProcessing || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {isProcessing
                    ? `${t('common.loading')}...`
                    : `✗ ${t('progressReports.approval.reject')}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProgressReportApproval;
