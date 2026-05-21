import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext, supabaseClient } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import {
  getContentReports,
  updateReportStatus,
  REASON_LABELS,
  REPORT_STATUS_COLORS,
} from '@siteweave/core-logic';
import LoadingSpinner from '../LoadingSpinner';

const FILTERS = ['all', 'pending', 'resolved', 'dismissed'];

export default function ContentReportsPanel() {
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);

  const loadReports = useCallback(async () => {
    if (!state.user?.id) {
      setReports([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const options = filter !== 'all' ? { status: filter } : {};
      const data = await getContentReports(supabaseClient, options);
      setReports(data || []);
    } catch (error) {
      console.error('Error loading reports:', error);
      addToast('Failed to load reports. You may not have admin access.', 'error');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [state.user?.id, filter, addToast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleUpdateStatus = async (reportId, newStatus) => {
    if (!state.user?.id) return;

    try {
      setUpdatingId(reportId);
      await updateReportStatus(supabaseClient, reportId, {
        status: newStatus,
        reviewedByUserId: state.user.id,
        resolutionNotes: null,
      });
      addToast(`Report marked as ${newStatus}.`, 'success');
      loadReports();
    } catch (error) {
      console.error('Error updating report:', error);
      addToast('Failed to update report status.', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const showStatusActions = (report) => {
    if (report.status === 'pending') {
      return (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            disabled={updatingId === report.id}
            onClick={() => handleUpdateStatus(report.id, 'reviewed')}
            className="px-3 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-50"
          >
            Mark reviewed
          </button>
          <button
            type="button"
            disabled={updatingId === report.id}
            onClick={() => handleUpdateStatus(report.id, 'resolved')}
            className="px-3 py-1 text-xs font-medium rounded bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
          >
            Resolve
          </button>
          <button
            type="button"
            disabled={updatingId === report.id}
            onClick={() => handleUpdateStatus(report.id, 'dismissed')}
            className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      );
    }
    if (report.status === 'reviewed') {
      return (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            disabled={updatingId === report.id}
            onClick={() => handleUpdateStatus(report.id, 'resolved')}
            className="px-3 py-1 text-xs font-medium rounded bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
          >
            Resolve
          </button>
          <button
            type="button"
            disabled={updatingId === report.id}
            onClick={() => handleUpdateStatus(report.id, 'dismissed')}
            className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg capitalize ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : reports.length === 0 ? (
        <p className="text-center py-8 text-gray-500">No reports found.</p>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => {
            const statusColor = REPORT_STATUS_COLORS[report.status] || '#6B7280';
            const reportedBy = report.reported_by?.email || 'Unknown';
            const reportedUser = report.reported_user?.email || 'Unknown';

            return (
              <li
                key={report.id}
                className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs font-semibold text-white px-2 py-0.5 rounded"
                      style={{ backgroundColor: statusColor }}
                    >
                      {report.status.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-500 capitalize">{report.content_type}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(report.created_at).toLocaleDateString()}
                  </span>
                </div>

                <dl className="grid gap-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">Reason:</dt>
                    <dd className="text-gray-900">{REASON_LABELS[report.reason] || report.reason}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">Reported by:</dt>
                    <dd className="text-gray-900">{reportedBy}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">Reported user:</dt>
                    <dd className="text-gray-900">{reportedUser}</dd>
                  </div>
                  {report.description && (
                    <div>
                      <dt className="text-gray-500">Description:</dt>
                      <dd className="text-gray-900 mt-0.5">{report.description}</dd>
                    </div>
                  )}
                </dl>

                {showStatusActions(report)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
