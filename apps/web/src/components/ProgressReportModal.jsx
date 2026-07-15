import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ProgressReportBuilder from './ProgressReportBuilder';
import BrandingSettings from './BrandingSettings';
import LoadingSpinner from './LoadingSpinner';
import {
  getProjectProgressReportSchedules,
  getOrganizationProgressReportSchedules,
  getProgressReportHistory,
  sendManualReport,
  exportReportToPDF,
  formatScheduleNextSendAt,
} from '@siteweave/core-logic';
import { getLocalizedFrequencyLabel } from '@siteweave/i18n';
import { saveProgressReportPdf } from '../utils/saveProgressReportPdf';
import { defaultProgressReportPdfFilename } from '../utils/progressReportPdfFilename';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import UpgradeRequiredModal from './UpgradeRequiredModal';
import { isExportFeatureLockedError } from '@siteweave/core-logic';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

/**
 * Progress Report Modal Component
 * Project-level report management modal
 */
function ProgressReportModal({ projectId, onClose }) {
  const { t, i18n } = useTranslation();
  const { state } = useAppContext();
  const { addToast } = useToast();
  const { canExport } = useWorkspaceTier();
  const [showExportUpgrade, setShowExportUpgrade] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [historyScheduleId, setHistoryScheduleId] = useState(null);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showBranding, setShowBranding] = useState(false);

  useEffect(() => {
    if (state.currentOrganization?.id) {
      loadSchedules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, state.currentOrganization?.id]);

  const loadSchedules = async () => {
    setIsLoading(true);
    try {
      const orgId = state.currentOrganization?.id;
      if (!orgId) return;

      const schedules = projectId
        ? await getProjectProgressReportSchedules(supabaseClient, orgId, projectId)
        : await getOrganizationProgressReportSchedules(supabaseClient, orgId);
      setSchedules(schedules);
    } catch (error) {
      addToast(t('progressReports.load_schedules_error', { message: error.message }), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingScheduleId(null);
    setShowBuilder(true);
  };

  const handleEdit = (scheduleId) => {
    setEditingScheduleId(scheduleId);
    setShowBuilder(true);
  };

  const openHistory = async (scheduleId) => {
    setHistoryScheduleId(scheduleId);
    setHistoryLoading(true);
    setHistoryRecords([]);
    try {
      const records = await getProgressReportHistory(supabaseClient, scheduleId, 30);
      setHistoryRecords(records);
    } catch (e) {
      addToast(t('progressReports.load_history_error', { message: e.message }), 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDelete = async (scheduleId) => {
    if (!confirm(t('progressReports.delete_confirm'))) return;

    try {
      const { error } = await supabaseClient
        .from('progress_report_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
      addToast(t('progressReports.schedule_deleted'), 'success');
      loadSchedules();
    } catch (error) {
      addToast(t('progressReports.delete_error', { message: error.message }), 'error');
    }
  };

  const handleSendNow = async (scheduleId) => {
    try {
      const result = await sendManualReport(supabaseClient, scheduleId);
      addToast(t('progressReports.sent_success'), 'success');
      if (result?.report_export_error) {
        addToast(t('progressReports.export_link_warning', { message: result.report_export_error }), 'warning');
      } else if (result?.report_export_url) {
        addToast(t('progressReports.export_link_included'), 'success');
      }
      loadSchedules();
    } catch (error) {
      addToast(t('progressReports.send_error', { message: error.message }), 'error');
    }
  };

  const handleExportPDF = async (scheduleId) => {
    if (!canExport) {
      setShowExportUpgrade(true);
      return;
    }
    try {
      const result = await exportReportToPDF(supabaseClient, scheduleId);
      if (!result?.html) {
        addToast(t('progressReports.export_no_document'), 'error');
        return;
      }
      const saveResult = await saveProgressReportPdf(result.html, {
        defaultFilename: defaultProgressReportPdfFilename(
          result.report_name ?? '',
          result.subject ?? '',
        ),
      });
      if (!saveResult.ok) {
        addToast(saveResult.error || t('progressReports.pdf_save_error'), 'error');
        return;
      }
      if (saveResult.canceled) return;
      if (saveResult.method === 'electron' && saveResult.path) {
        addToast(t('progressReports.pdf_saved_path', { path: saveResult.path }), 'success');
      } else {
        addToast(t('progressReports.pdf_downloaded'), 'success');
      }
    } catch (error) {
      if (isExportFeatureLockedError(error)) {
        setShowExportUpgrade(true);
        return;
      }
      addToast(t('progressReports.export_error', { message: error.message }), 'error');
    }
  };

  if (showBuilder) {
    return (
      <ModalOverlay
        onClose={() => {
          setShowBuilder(false);
          setEditingScheduleId(null);
          loadSchedules();
        }}
      >
        <div className={`bg-white rounded-xl shadow-2xl w-full max-w-[min(1440px,96vw)] ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              {editingScheduleId
                ? t('progressReports.edit_title')
                : projectId
                  ? t('progressReports.create_project_title')
                  : t('progressReports.create_org_title')}
            </h2>
            <button type="button"
              onClick={() => {
                setShowBuilder(false);
                setEditingScheduleId(null);
                loadSchedules();
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-6">
            <ProgressReportBuilder
              scheduleId={editingScheduleId}
              projectId={projectId}
              organizationId={state.currentOrganization?.id}
              onSave={() => {
                setShowBuilder(false);
                setEditingScheduleId(null);
                loadSchedules();
              }}
              onCancel={() => {
                setShowBuilder(false);
                setEditingScheduleId(null);
              }}
            />
          </div>
        </div>
      </ModalOverlay>
    );
  }

  return (
    <>
    <ModalOverlay onClose={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full max-w-[min(1440px,96vw)] ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {projectId ? t('progressReports.project_heading') : t('progressReports.org_heading')}
          </h2>
          <button type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <p className="text-gray-600">
              {projectId
                ? t('progressReports.project_scope_desc')
                : t('progressReports.org_scope_desc')}
            </p>
            <button type="button"
              onClick={handleCreateNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t('progressReports.create_new')}
            </button>
          </div>

          {isLoading ? (
            <LoadingSpinner text={t('progressReports.loading_schedules')} />
          ) : schedules.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">{t('progressReports.no_schedules')}</p>
              <button type="button"
                onClick={handleCreateNew}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {t('progressReports.create_new')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule) => {
                const audienceLabel = {
                  client: t('progressReports.audience_client'),
                  internal: t('progressReports.audience_internal'),
                  executive: t('progressReports.audience_executive'),
                }[schedule.report_audience_type] || schedule.report_audience_type;
                return (
                  <div key={schedule.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-sm">{schedule.name}</h3>
                          {schedule.is_active
                            ? <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded font-medium">{t('progressReports.status_active')}</span>
                            : <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded font-medium">{t('progressReports.status_draft')}</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {audienceLabel}
                          {' · '}
                          {getLocalizedFrequencyLabel(schedule.frequency, schedule.frequency_value, t)}
                          {schedule.next_send_at && (
                            <span>
                              {' · '}
                              {t('progressReports.next_send', {
                                date: formatScheduleNextSendAt(
                                  schedule.next_send_at,
                                  i18n.language,
                                  schedule.send_timezone || 'America/New_York'
                                ),
                              })}
                            </span>
                          )}
                          {schedule.last_sent_at && (
                            <span className="ml-1 text-gray-400">· {t('progressReports.sent_on', { date: new Date(schedule.last_sent_at).toLocaleDateString(i18n.language) })}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t('progressReports.recipients_count', { count: schedule.progress_report_recipients?.length || 0 })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        <button type="button"
                          onClick={() => handleSendNow(schedule.id)}
                          className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                        >
                          {t('progressReports.send_now')}
                        </button>
                        <button type="button"
                          onClick={() => handleExportPDF(schedule.id)}
                          className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 font-medium"
                          title={t('progressReports.export_pdf')}
                        >
                          {t('progressReports.export_pdf')}
                        </button>
                        <button type="button"
                          onClick={() => openHistory(schedule.id)}
                          className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 font-medium"
                        >
                          {t('progressReports.history')}
                        </button>
                        <button type="button"
                          onClick={() => handleEdit(schedule.id)}
                          className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 font-medium"
                        >
                          {t('progressReports.edit')}
                        </button>
                        <button type="button"
                          onClick={() => handleDelete(schedule.id)}
                          className="px-2.5 py-1 text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          {t('progressReports.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Email Appearance accordion */}
          {schedules.length > 0 && (
            <div className="mt-6 rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowBranding((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <span>{t('progressReports.email_branding')}</span>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${showBranding ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showBranding && (
                <div className="border-t border-gray-100 bg-white px-4 py-4">
                  <p className="text-xs text-gray-500 mb-4">{t('progressReports.branding_hint')}</p>
                  <BrandingSettings compact />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
          {historyScheduleId && (
            <ModalOverlay
              zIndexClass="z-[60]"
              onClose={() => setHistoryScheduleId(null)}
              role="dialog"
              aria-modal="true"
            >
              <div className={`relative bg-white rounded-xl shadow-2xl max-w-md w-full ${MODAL_PANEL_MAX_H} flex flex-col overflow-hidden`}>
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{t('progressReports.report_history')}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {schedules.find(s => s.id === historyScheduleId)?.name}
                      </p>
                    </div>
                    <button type="button" onClick={() => setHistoryScheduleId(null)} className="text-gray-400 hover:text-gray-600 p-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1">
                    {historyLoading ? (
                      <LoadingSpinner text={t('progressReports.loading_history')} />
                    ) : historyRecords.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">{t('progressReports.no_history')}</p>
                    ) : (
                      <ul className="space-y-2">
                        {historyRecords.map((record) => (
                          <li key={record.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg text-sm">
                            <div>
                              <p className="font-medium text-gray-900">
                                {new Date(record.sent_at).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {t('progressReports.recipients_count', { count: Array.isArray(record.recipient_emails) ? record.recipient_emails.length : 0 })}
                                {record.was_manual_send && ` · ${t('progressReports.manual_send')}`}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => { handleSendNow(record.schedule_id); setHistoryScheduleId(null); }}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              {t('progressReports.resend')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
              </div>
            </ModalOverlay>
          )}
    <UpgradeRequiredModal
      isOpen={showExportUpgrade}
      onClose={() => setShowExportUpgrade(false)}
      feature="exports"
    />
    </>
  );
}

export default ProgressReportModal;
