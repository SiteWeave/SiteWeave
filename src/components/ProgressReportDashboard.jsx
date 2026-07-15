import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ProgressReportBuilder from './ProgressReportBuilder';
import LoadingSpinner from './LoadingSpinner';
import {
  getOrganizationProgressReportSchedules,
  getProgressReportHistory,
  sendManualReport,
} from '@siteweave/core-logic';
import { getLocalizedFrequencyLabel } from '@siteweave/i18n';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

/**
 * Progress Report Dashboard Component
 * Organization-wide report management
 */
function ProgressReportDashboard() {
  const { t, i18n } = useTranslation();
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [schedules, setSchedules] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [historyScheduleId, setHistoryScheduleId] = useState(null);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (state.currentOrganization?.id) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentOrganization?.id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const orgId = state.currentOrganization.id;
      const orgSchedules = await getOrganizationProgressReportSchedules(supabaseClient, orgId);
      setSchedules(orgSchedules);

      // Load recent history
      if (orgSchedules.length > 0) {
        const recentHistory = [];
        for (const schedule of orgSchedules.slice(0, 5)) {
          const scheduleHistory = await getProgressReportHistory(supabaseClient, schedule.id, 2);
          recentHistory.push(...scheduleHistory);
        }
        setHistory(recentHistory.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)).slice(0, 10));
      }
    } catch (error) {
      addToast(t('progressReports.dashboard.load_data_error', { message: error.message }), 'error');
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

  const handleSendNow = async (scheduleId) => {
    try {
      await sendManualReport(supabaseClient, scheduleId);
      addToast(t('progressReports.sent_success'), 'success');
      loadData();
    } catch (error) {
      addToast(t('progressReports.send_error', { message: error.message }), 'error');
    }
  };

  const reportsThisMonth = history.filter(h => {
    const sentDate = new Date(h.sent_at);
    const now = new Date();
    return sentDate.getMonth() === now.getMonth() && sentDate.getFullYear() === now.getFullYear();
  }).length;

  if (showBuilder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {editingScheduleId ? t('progressReports.edit_title') : t('progressReports.create_org_title')}
          </h2>
          <button type="button"
            onClick={() => {
              setShowBuilder(false);
              setEditingScheduleId(null);
              loadData();
            }}
            className="text-gray-600 hover:text-gray-800"
          >
            {t('progressReports.dashboard.back_to_dashboard')}
          </button>
        </div>
        <ProgressReportBuilder
          scheduleId={editingScheduleId}
          organizationId={state.currentOrganization?.id}
          onSave={() => {
            setShowBuilder(false);
            setEditingScheduleId(null);
            loadData();
          }}
          onCancel={() => {
            setShowBuilder(false);
            setEditingScheduleId(null);
          }}
        />
      </div>
    );
  }

  const openViewHistory = async (scheduleId) => {
    setHistoryScheduleId(scheduleId);
    setHistoryLoading(true);
    try {
      const records = await getProgressReportHistory(supabaseClient, scheduleId, 50);
      setHistoryRecords(records);
    } catch (e) {
      addToast(t('progressReports.load_history_error', { message: e.message }), 'error');
      setHistoryRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner text={t('progressReports.dashboard.loading')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('progressReports.dashboard.title')}</h2>
          <p className="text-gray-600 mt-1">{t('progressReports.dashboard.subtitle')}</p>
        </div>
        <button type="button"
          onClick={handleCreateNew}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {t('progressReports.dashboard.create_new')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">{t('progressReports.dashboard.schedules')}</p>
          <p className="text-2xl font-bold text-gray-900">{schedules.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">{t('progressReports.dashboard.reports_sent_month')}</p>
          <p className="text-2xl font-bold text-gray-900">{reportsThisMonth}</p>
        </div>
      </div>

      {/* Reports list: Report Name, Frequency, Next Send Date, Status; actions: Edit, Send Now, View History */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{t('progressReports.dashboard.reports')}</h3>
        </div>
        {schedules.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{t('progressReports.dashboard.no_reports_yet')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('progressReports.dashboard.report_name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('progressReports.dashboard.frequency')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('progressReports.dashboard.next_send_date')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('progressReports.dashboard.status')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {schedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{schedule.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {getLocalizedFrequencyLabel(schedule.frequency, schedule.frequency_value, t)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {schedule.next_send_at
                        ? new Date(schedule.next_send_at).toLocaleDateString(i18n.language)
                        : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          schedule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {schedule.is_active
                          ? t('progressReports.status_active')
                          : t('progressReports.status_draft')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button type="button"
                        onClick={() => handleEdit(schedule.id)}
                        className="text-blue-600 hover:text-blue-700 mr-3"
                      >
                        {t('progressReports.edit')}
                      </button>
                      <button type="button"
                        onClick={() => handleSendNow(schedule.id)}
                        className="text-blue-600 hover:text-blue-700 mr-3"
                      >
                        {t('progressReports.send_now')}
                      </button>
                      <button type="button"
                        onClick={() => openViewHistory(schedule.id)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        {t('progressReports.dashboard.view_history')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View History modal/panel */}
      {historyScheduleId && (
        <ModalOverlay
          onClose={() => setHistoryScheduleId(null)}
          role="dialog"
          aria-modal="true"
        >
            <div className={`relative bg-white rounded-lg shadow-xl max-w-lg w-full ${MODAL_PANEL_MAX_H} flex flex-col overflow-hidden`}>
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{t('progressReports.dashboard.send_history')}</h3>
                <button
                  type="button"
                  onClick={() => setHistoryScheduleId(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={t('common.close')}
                >
                  ×
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {historyLoading ? (
                  <p className="text-gray-500">{t('common.loading')}...</p>
                ) : historyRecords.length === 0 ? (
                  <p className="text-gray-500">{t('progressReports.no_history')}</p>
                ) : (
                  <ul className="space-y-2">
                    {historyRecords.map((record) => (
                      <li
                        key={record.id}
                        className="flex justify-between items-center p-3 border border-gray-200 rounded-lg"
                      >
                        <div>
                          <p className="text-sm text-gray-900">
                            {new Date(record.sent_at).toLocaleString(i18n.language)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t('progressReports.recipients_count', {
                              count: Array.isArray(record.recipient_emails) ? record.recipient_emails.length : 0,
                            })}
                            {record.was_manual_send && ` • ${t('progressReports.dashboard.manual_send')}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleSendNow(record.schedule_id);
                            setHistoryScheduleId(null);
                          }}
                          className="text-sm text-blue-600 hover:text-blue-700"
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

      {/* Recent Reports */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('progressReports.dashboard.recent_reports')}</h3>
        {history.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{t('progressReports.no_history')}</p>
        ) : (
          <div className="space-y-2">
            {history.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {report.report_type === 'organization'
                      ? t('progressReports.dashboard.org_report')
                      : t('progressReports.dashboard.project_report')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t('progressReports.sent_at', {
                      date: new Date(report.sent_at).toLocaleString(i18n.language),
                    })}{' '}
                    •{' '}
                    {t('progressReports.recipients_count', {
                      count: report.recipient_emails.length,
                    })}
                  </p>
                </div>
                <button type="button"
                  onClick={() => handleSendNow(report.schedule_id)}
                  className="px-3 py-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  {t('progressReports.resend')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProgressReportDashboard;
