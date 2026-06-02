import React from 'react';

function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', cancelText = 'Cancel' }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md">
                <h3 className="text-lg font-bold mb-4">{title}</h3>
                <p className="text-gray-600 mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                    >
                        {cancelText}
                    </button>
                    <button type="button"
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmDialog;
