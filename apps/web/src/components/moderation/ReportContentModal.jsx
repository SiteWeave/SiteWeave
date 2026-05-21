import React, { useState } from 'react';
import Modal from '../Modal';
import { useAppContext, supabaseClient } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { reportContent, REPORT_REASONS } from '@siteweave/core-logic';

export default function ReportContentModal({
  show,
  onClose,
  contentType,
  contentId,
  reportedUserId,
  reportedUserName,
}) {
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [selectedReason, setSelectedReason] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedReason) {
      addToast('Please select a reason for reporting.', 'error');
      return;
    }
    if (!state.user?.id) return;

    try {
      setSubmitting(true);
      await reportContent(supabaseClient, {
        contentType,
        contentId,
        reportedUserId,
        reportedByUserId: state.user.id,
        reason: selectedReason,
        description: description.trim() || null,
      });
      addToast('Report submitted. We will review it and take appropriate action.', 'success');
      setSelectedReason(null);
      setDescription('');
      onClose();
    } catch (error) {
      console.error('Error reporting content:', error);
      addToast('Failed to submit report. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setSelectedReason(null);
      setDescription('');
      onClose();
    }
  };

  return (
    <Modal show={show} onClose={handleClose} title="Report Content" size="large">
      {reportedUserName && (
        <p className="text-sm text-gray-600 mb-4 bg-gray-50 rounded-lg p-3">
          Reporting content from: <span className="font-semibold text-gray-900">{reportedUserName}</span>
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="border-0 p-0 m-0">
          <legend className="text-sm font-semibold text-gray-900 mb-2">Reason for report</legend>
          <div className="space-y-2">
            {REPORT_REASONS.map((reason) => (
              <label
                key={reason.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                  selectedReason === reason.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <input
                  type="radio"
                  name="reportReason"
                  value={reason.value}
                  checked={selectedReason === reason.value}
                  onChange={() => setSelectedReason(reason.value)}
                  disabled={submitting}
                  className="text-blue-600"
                />
                <span className="text-sm text-gray-900">{reason.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Additional details (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide any additional context..."
            rows={4}
            disabled={submitting}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-900 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!selectedReason || submitting}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
