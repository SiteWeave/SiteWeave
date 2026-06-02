import React from 'react';
import Icon from './Icon';

/**
 * Credential Card Component
 * Displays credentials for a newly created managed account
 * Designed to be printed or screenshotted
 */
function CredentialCard({ fullName, username, password, email, roleName, onClose }) {
  const handlePrint = () => {
    window.print();
  };

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    // You could add a toast here if needed
  };

  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg p-6 max-w-md mx-auto shadow-lg print:shadow-none">
      <div className="text-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Account Credentials</h3>
        <p className="text-sm text-gray-600">Save this information securely</p>
      </div>

      <div className="space-y-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600 uppercase">Full Name</label>
            <button type="button"
              onClick={() => handleCopy(fullName, 'Name')}
              className="text-xs text-blue-600 hover:text-blue-700"
              title="Copy"
            >
              <Icon path="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" className="w-4 h-4" />
            </button>
          </div>
          <p className="text-lg font-semibold text-gray-900">{fullName}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600 uppercase">Username</label>
            <button type="button"
              onClick={() => handleCopy(username, 'Username')}
              className="text-xs text-blue-600 hover:text-blue-700"
              title="Copy"
            >
              <Icon path="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" className="w-4 h-4" />
            </button>
          </div>
          <p className="text-lg font-mono text-gray-900">{username}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600 uppercase">Temporary Password</label>
            <button type="button"
              onClick={() => handleCopy(password, 'Password')}
              className="text-xs text-blue-600 hover:text-blue-700"
              title="Copy"
            >
              <Icon path="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" className="w-4 h-4" />
            </button>
          </div>
          <p className="text-lg font-mono text-gray-900 break-all">{password}</p>
        </div>

        {email && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase">Email</label>
              <button type="button"
                onClick={() => handleCopy(email, 'Email')}
                className="text-xs text-blue-600 hover:text-blue-700"
                title="Copy"
              >
                <Icon path="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" className="w-4 h-4" />
              </button>
            </div>
            <p className="text-lg text-gray-900">{email}</p>
          </div>
        )}

        {roleName && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <label className="text-xs font-semibold text-gray-600 uppercase block mb-2">Role</label>
            <p className="text-lg text-gray-900">{roleName}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200 print:hidden">
        <button type="button"
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <Icon path="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M10.5 2.25H3.375c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-4 h-4" />
          Print
        </button>
        <button type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Close
        </button>
      </div>

      <style jsx>{`
        @media print {
          .print\\:hidden {
            display: none;
          }
          .print\\:shadow-none {
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
}

export default CredentialCard;
