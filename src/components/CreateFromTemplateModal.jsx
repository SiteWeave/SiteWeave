import React, { useState, useEffect } from 'react';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import DateDropdown from './DateDropdown';
import { createProjectFromTemplate } from '../utils/projectTemplateService';

export default function CreateFromTemplateModal({ onClose, onCreated }) {
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
      addToast('Please select a template, enter project name, and start date', 'error');
      return;
    }
    if (!orgId || !userId) {
      addToast('Missing organization or user context', 'error');
      return;
    }
    setCreating(true);
    try {
      const result = await createProjectFromTemplate(supabaseClient, selectedId, orgId, userId, projectName.trim(), address.trim() || undefined, projectNumber.trim() || undefined, startDate);
      if (result.success) {
        addToast('Project created from template', 'success');
        const { data: newProject } = await supabaseClient.from('projects').select('*').eq('id', result.projectId).single();
        if (newProject) dispatch({ type: 'ADD_PROJECT', payload: newProject });
        onCreated?.(result.projectId);
        onClose();
      } else if (result.error === 'PROJECT_LIMIT_REACHED') {
        addToast('Project limit reached. Contact sales to upgrade.', 'warning');
        onClose();
      } else {
        addToast(result.error || 'Failed to create project', 'error');
      }
    } catch (err) {
      addToast('Failed to create project', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Create project from template</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1 text-gray-600">Template</label>
            {loading ? (
              <p className="text-sm text-gray-500">Loading templates...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-500">No templates yet. Save a project as a template first.</p>
            ) : (
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="w-full p-2 border rounded-lg bg-white" required>
                <option value="">Select a template</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}{t.description ? ` – ${t.description}` : ''}</option>
                ))}
              </select>
            )}
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1 text-gray-600">Project name</label>
            <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} className="w-full p-2 border rounded-lg" required placeholder="New project name" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1 text-gray-600">Address (optional)</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1 text-gray-600">Project number (optional)</label>
            <input type="text" value={projectNumber} onChange={e => setProjectNumber(e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="mb-6">
            <DateDropdown value={startDate} onChange={setStartDate} label="Start date" required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50" disabled={creating}>Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" disabled={creating || !templates.length}>{creating ? 'Creating...' : 'Create project'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
