import React from 'react';

const SALES_URL = 'https://www.siteweave.org/contact';

const COPY = {
  project_limit: {
    title: 'Project Limit Reached',
    body: "You've used all project slots for this personal workspace—including completed and archived projects. Deleting a project does not free a slot. Upgrade for unlimited projects and full field management.",
  },
  guest_collaborators: {
    title: 'Guest Collaborator Limit Reached',
    body: 'Personal workspaces can invite up to 5 guest collaborators per project. To coordinate a larger crew across trades, upgrade to the business plan.',
  },
  exports: {
    title: 'Export Requires Upgrade',
    body: 'Branded PDF reports and data exports are available on the business plan. You can view everything in the app on the free tier—upgrade when you need official documentation for clients, architects, or inspectors.',
  },
  custom_roles: {
    title: 'Custom Roles Require Upgrade',
    body: 'Personal workspaces use a simple owner and guest model. Custom roles and granular permissions (e.g. PM edit vs. foreman view-only) are available on the business plan.',
  },
};

function UpgradeRequiredModal({ isOpen, onClose, feature = 'exports' }) {
  if (!isOpen) return null;

  const { title, body } = COPY[feature] || COPY.exports;

  const handleContactSales = () => {
    window.open(SALES_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-gray-900 mb-3">{title}</h3>
        <p className="text-gray-600 mb-6 text-sm leading-relaxed">{body}</p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContactSales}
            className="px-4 py-2 app-action-primary rounded-lg text-sm font-semibold"
          >
            Contact Sales
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpgradeRequiredModal;
