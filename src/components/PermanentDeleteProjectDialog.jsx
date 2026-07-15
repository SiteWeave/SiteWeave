import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

function PermanentDeleteProjectDialog({
  isOpen,
  onClose,
  onConfirm,
  projectName,
  isLoading = false,
}) {
  const { t } = useTranslation();
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    if (isOpen) setTypedName('');
  }, [isOpen, projectName]);

  if (!isOpen) return null;

  const nameMatches = typedName.trim() === (projectName || '').trim();
  const impactItems = t('projectTrash.permanent_delete_impact', { returnObjects: true });

  return (
    <ModalOverlay onClose={onClose}>
      <div className={`bg-white rounded-lg shadow-2xl p-6 w-full max-w-lg ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {t('projectTrash.permanent_delete_title')}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {t('projectTrash.permanent_delete_message', { name: projectName })}
        </p>
        {Array.isArray(impactItems) ? (
          <ul className="mb-4 list-disc pl-5 text-sm text-gray-600 space-y-1">
            {impactItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="confirm-project-name">
          {t('projectTrash.type_name_to_confirm', { name: projectName })}
        </label>
        <input
          id="confirm-project-name"
          type="text"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
          autoComplete="off"
          placeholder={projectName}
        />
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setTypedName('');
              onClose();
            }}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            disabled={isLoading}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(typedName.trim())}
            disabled={!nameMatches || isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('common.deleting') : t('projectTrash.delete_permanently')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

export default PermanentDeleteProjectDialog;
