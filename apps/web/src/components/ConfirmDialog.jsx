import React from 'react';
import { useTranslation } from 'react-i18next';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText, cancelText }) {
    const { t } = useTranslation();
    const resolvedConfirmText = confirmText ?? t('common.delete');
    const resolvedCancelText = cancelText ?? t('common.cancel');
    if (!isOpen) return null;

    return (
        <ModalOverlay onClose={onClose}>
            <div className={`bg-white rounded-lg shadow-2xl p-6 w-full max-w-md ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
                <h3 className="text-lg font-bold mb-4">{title}</h3>
                <p className="text-gray-600 mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                    >
                        {resolvedCancelText}
                    </button>
                    <button type="button"
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                        {resolvedConfirmText}
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
}

export default ConfirmDialog;
