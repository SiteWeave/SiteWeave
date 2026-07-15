import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { saveProjectAsTemplate } from '../utils/projectTemplateService';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

export default function SaveAsTemplateModal({ projectId, projectName, onClose, onSaved }) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [name, setName] = useState(() => t('templates.default_name', { name: projectName || 'Project' }));
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const orgId = state.currentOrganization?.id;
  const userId = state.user?.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast(t('templates.enter_name'), 'error');
      return;
    }
    if (!orgId || !userId) {
      addToast(t('templates.missing_context'), 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await saveProjectAsTemplate(supabaseClient, projectId, orgId, userId, name.trim(), description.trim());
      if (result.success) {
        addToast(t('templates.saved_success'), 'success');
        onSaved?.();
        onClose();
      } else {
        addToast(result.error || t('templates.save_failed'), 'error');
      }
    } catch (err) {
      addToast(t('templates.save_failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className={`bg-white rounded-lg shadow-2xl p-8 w-full max-w-md ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
        <h2 className="text-xl font-bold mb-4">{t('templates.save_title')}</h2>
        <p className="text-sm text-gray-600 mb-4">{t('templates.save_description')}</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('templates.template_name')}</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded-lg" required placeholder={t('templates.name_placeholder')} />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('templates.description_optional')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border rounded-lg" rows={2} placeholder={t('templates.description_placeholder')} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50" disabled={saving}>{t('common.cancel')}</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" disabled={saving}>{saving ? t('templates.saving') : t('templates.save_template')}</button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
