import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import DateDropdown from './DateDropdown';
import { createProjectFromTemplate } from '../utils/projectTemplateService';
import { ensureOrganizationForWrites } from '../utils/organizationContext';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';
import { logProjectCreated } from '../utils/activityLogger';

export default function CreateFromTemplateModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [address, setAddress] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [startDate, setStartDate] = useState('');
  const [creating, setCreating] = useState(false);

  const orgId = state.currentOrganization?.id;
  const userId = state.user?.id;

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data, error } = await supabaseClient
        .from('project_templates')
        .select('id, name, description')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (!error) setTemplates(data || []);
      setLoading(false);
    })();
  }, [orgId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId || !projectName.trim() || !startDate) {
      addToast(t('templates.required_fields'), 'error');
      return;
    }
    if (!userId) {
      addToast(t('templates.missing_context'), 'error');
      return;
    }
    setCreating(true);
    try {
      const orgContext = await ensureOrganizationForWrites(supabaseClient, {
        userId,
        accountIntent: state.accountIntent,
        currentOrganization: state.currentOrganization,
        dispatch,
      });
      if (!orgContext.ok) {
        addToast(orgContext.error || t('templates.missing_context'), 'error');
        return;
      }
      const result = await createProjectFromTemplate(supabaseClient, selectedId, orgContext.organizationId, userId, projectName.trim(), address.trim() || undefined, projectNumber.trim() || undefined, startDate);
      if (result.success) {
        addToast(t('templates.created_success'), 'success');
        const { data: newProject } = await supabaseClient.from('projects').select('*').eq('id', result.projectId).single();
        if (newProject) {
          dispatch({ type: 'ADD_PROJECT', payload: newProject });
          if (state.user) logProjectCreated(newProject, state.user);
        }
        onCreated?.(result.projectId);
        onClose();
      } else if (result.error === 'PROJECT_LIMIT_REACHED') {
        addToast(t('templates.limit_reached'), 'warning');
        onClose();
      } else {
        addToast(result.error || t('templates.create_failed'), 'error');
      }
    } catch (err) {
      addToast(t('templates.create_failed'), 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className={`bg-white rounded-lg shadow-2xl p-8 w-full max-w-md ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
        <h2 className="text-xl font-bold mb-4">{t('templates.create_title')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('templates.select_template')}</label>
            {loading ? (
              <p className="text-sm text-gray-500">{t('templates.loading_templates')}</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-500">{t('templates.no_templates')}</p>
            ) : (
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="w-full p-2 border rounded-lg bg-white" required>
                <option value="">{t('templates.select_placeholder')}</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}{t.description ? ` – ${t.description}` : ''}</option>
                ))}
              </select>
            )}
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('templates.project_name')}</label>
            <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} className="w-full p-2 border rounded-lg" required placeholder={t('templates.project_name')} />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('templates.address_optional')}</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('templates.project_number_optional')}</label>
            <input type="text" value={projectNumber} onChange={e => setProjectNumber(e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="mb-6">
            <DateDropdown value={startDate} onChange={setStartDate} label={t('templates.start_date')} required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50" disabled={creating}>{t('common.cancel')}</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" disabled={creating || !templates.length}>{creating ? t('templates.creating') : t('templates.create_project')}</button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
