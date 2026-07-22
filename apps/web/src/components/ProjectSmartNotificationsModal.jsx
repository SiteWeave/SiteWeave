import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

function parseLeadDays(raw) {
  const values = String(raw || '')
    .split(',')
    .map((part) => parseInt(part.trim(), 10))
    .filter((num) => Number.isFinite(num) && num >= 1 && num <= 365);
  const deduped = Array.from(new Set(values));
  return deduped.length > 0 ? deduped.sort((a, b) => b - a) : [14, 7];
}

export default function ProjectSmartNotificationsModal({
  project,
  onClose,
  onSaved,
  activateOnOpen = false,
}) {
  const { t } = useTranslation();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [taskNotifUseOrgDefaults, setTaskNotifUseOrgDefaults] = useState(false);
  const [taskNotifEnabled, setTaskNotifEnabled] = useState(false);
  const [taskNotifLeadDays, setTaskNotifLeadDays] = useState('14, 7');
  const [dependencyNotifEnabled, setDependencyNotifEnabled] = useState(true);

  useEffect(() => {
    if (!project) return;
    const leadDays = Array.isArray(project.task_start_notification_lead_days)
      && project.task_start_notification_lead_days.length > 0
      ? project.task_start_notification_lead_days
      : [14, 7];

    if (activateOnOpen) {
      setTaskNotifUseOrgDefaults(false);
      setTaskNotifEnabled(true);
      setTaskNotifLeadDays(leadDays.join(', '));
    } else {
      setTaskNotifUseOrgDefaults(project.task_notifications_use_org_defaults === true);
      setTaskNotifEnabled(project.task_start_notifications_enabled === true);
      setTaskNotifLeadDays(leadDays.join(', '));
    }
    setDependencyNotifEnabled(project.dependency_notifications_enabled !== false);
  }, [project, activateOnOpen]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!project?.id) return;

    setIsSaving(true);
    try {
      const payload = {
        task_notifications_use_org_defaults: taskNotifUseOrgDefaults,
        task_start_notifications_enabled: taskNotifUseOrgDefaults ? null : taskNotifEnabled,
        task_start_notification_lead_days: taskNotifUseOrgDefaults ? null : parseLeadDays(taskNotifLeadDays),
        notification_email_batching_enabled: project.notification_email_batching_enabled !== false,
        notification_batch_window_minutes: Number.isFinite(Number(project.notification_batch_window_minutes))
          ? Math.max(1, Math.min(60, Number(project.notification_batch_window_minutes)))
          : 5,
        dependency_notifications_enabled: dependencyNotifEnabled,
        updated_by_user_id: state.user?.id,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedProject, error } = await supabaseClient
        .from('projects')
        .update(payload)
        .eq('id', project.id)
        .select()
        .single();

      if (error) throw error;

      dispatch({ type: 'UPDATE_PROJECT', payload: updatedProject });
      addToast(t('toast.project_updated_successfully'), 'success');
      if (onSaved) onSaved(updatedProject);
      onClose();
    } catch (err) {
      addToast(t('toast.error_updating_project', { message: err.message }), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!project) return null;

  return (
    <ModalOverlay onClose={onClose}>
      <div className={`${MODAL_PANEL_MAX_H} w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('projectModal.smart_notif_title')}</h2>
            <p className="mt-1 text-sm text-gray-500">{project.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            {t('common.close')}
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <p className="text-sm text-gray-600">{t('projectModal.smart_notif_desc')}</p>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={taskNotifUseOrgDefaults}
              onChange={(e) => setTaskNotifUseOrgDefaults(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('projectModal.use_org_defaults')}
          </label>

          {!taskNotifUseOrgDefaults && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={taskNotifEnabled}
                  onChange={(e) => setTaskNotifEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {t('projectModal.email_before_start')}
              </label>
              <div>
                <label className="mb-1 block text-xs text-gray-500">{t('projectModal.lead_days_label')}</label>
                <input
                  type="text"
                  value={taskNotifLeadDays}
                  onChange={(e) => setTaskNotifLeadDays(e.target.value)}
                  className="w-full rounded-lg border p-2 text-sm"
                  placeholder={t('projectModal.lead_days_placeholder')}
                />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={dependencyNotifEnabled}
              onChange={(e) => setDependencyNotifEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('projectModal.email_on_dependency_unlock')}
          </label>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={isSaving}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
