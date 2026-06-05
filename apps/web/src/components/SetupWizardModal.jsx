import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getRoles } from '../utils/roleManagementService';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';
import Icon from './Icon';

/**
 * SetupWizardModal — founding Org Admin only (see App.jsx).
 * Single step: invite teammates with three preset roles (no permission editing here).
 */

const PRESETS = [
  {
    id: 'admin',
    roleName: 'Org Admin',
    label: 'Admin',
    description: 'Can invite and manage users'
  },
  {
    id: 'member',
    roleName: 'Member',
    label: 'Member',
    description: 'Can add and edit content'
  },
  {
    id: 'pm',
    roleName: 'Project Manager',
    label: 'Project Manager',
    description: 'Can manage projects, tasks, and assignments'
  }
];

function makeRow() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, email: '', preset: 'member' };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function SetupWizardModal({ show, onComplete }) {
  const { state } = useAppContext();
  const { addToast } = useToast();
  const currentOrganization = state.currentOrganization;
  const user = state.user;

  const [rows, setRows] = useState([makeRow(), makeRow()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (show) {
      setRows([makeRow(), makeRow()]);
    }
  }, [show, currentOrganization?.id]);

  if (!show) return null;

  const markWizardComplete = async () => {
    if (!currentOrganization?.id) {
      addToast('Organization not found', 'error');
      return;
    }
    const { error } = await supabaseClient
      .from('organizations')
      .update({ setup_wizard_completed_at: new Date().toISOString() })
      .eq('id', currentOrganization.id);

    if (error) {
      console.error('Setup wizard completion:', error);
      addToast(error.message || 'Could not save setup status', 'error');
      throw error;
    }
  };

  const handleSkip = () => {
    if (
      window.confirm(
        'Skip inviting your team for now? You can invite people later from Organization settings.'
      )
    ) {
      (async () => {
        try {
          setSubmitting(true);
          await markWizardComplete();
          addToast('Setup saved.', 'success');
          onComplete();
        } catch {
          /* toast already shown */
        } finally {
          setSubmitting(false);
        }
      })();
    }
  };

  const handleClose = () => {
    handleSkip();
  };

  const updateRow = (rowId, patch) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  };

  const removeRow = (rowId) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== rowId)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, makeRow()]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentOrganization?.id || !user?.id) {
      addToast('Missing organization or user', 'error');
      return;
    }

    const toInvite = rows
      .map((r) => ({ ...r, email: r.email.trim() }))
      .filter((r) => r.email.length > 0);

    for (const r of toInvite) {
      if (!isValidEmail(r.email)) {
        addToast(`Invalid email: ${r.email}`, 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (toInvite.length === 0) {
        await markWizardComplete();
        addToast('Setup complete!', 'success');
        onComplete();
        return;
      }

      const rolesList = await getRoles(supabaseClient, currentOrganization.id);
      const byName = new Map(rolesList.map((role) => [role.name, role.id]));

      const {
        data: { session }
      } = await supabaseClient.auth.getSession();
      if (!session) {
        addToast('Not authenticated', 'error');
        return;
      }

      let inviteErrors = 0;
      for (const row of toInvite) {
        const preset = PRESETS.find((p) => p.id === row.preset);
        const roleName = preset?.roleName || 'Member';
        const roleId = byName.get(roleName);
        if (!roleId) {
          addToast(`Role "${roleName}" not found in your organization.`, 'error');
          return;
        }

        const response = await fetch(
          `${supabaseClient.supabaseUrl}/functions/v1/team-invite`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: row.email,
              organizationId: currentOrganization.id,
              roleId
            })
          }
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.warn('team-invite', row.email, body);
          inviteErrors += 1;
          addToast(body?.error || `Invite failed for ${row.email}`, 'error');
        }
      }

      await markWizardComplete();
      if (inviteErrors === 0) {
        addToast('Invites sent. Setup complete!', 'success');
      } else {
        addToast('Setup saved. Fix any failed invites from Organization settings.', 'success');
      }
      onComplete();
    } catch (err) {
      console.error(err);
      if (!err?.message?.includes('Could not save')) {
        addToast(err.message || 'Something went wrong', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onClose={handleClose} title="Who else is on your team?" size="large">
      <form onSubmit={handleSubmit} className="space-y-6">
        <p className="text-gray-600 text-sm">
          Add email addresses and choose a default role for each person. You can fine-tune roles later in
          settings.
        </p>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {rows.map((row) => {
            const preset = PRESETS.find((p) => p.id === row.preset) || PRESETS[1];
            return (
              <div key={row.id} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                <input
                  type="email"
                  placeholder="Add email here"
                  value={row.email}
                  onChange={(e) => updateRow(row.id, { email: e.target.value })}
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoComplete="off"
                  disabled={submitting}
                />
                <div className="flex items-start gap-2 sm:w-[280px] flex-shrink-0">
                  <div className="flex-1 min-w-0">
                    <select
                      value={row.preset}
                      onChange={(e) => updateRow(row.id, { preset: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={submitting}
                      aria-label="Role"
                    >
                      {PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{preset.description}</p>
                  </div>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg mt-0.5"
                      title="Remove row"
                      disabled={submitting}
                    >
                      <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
          disabled={submitting}
        >
          <Icon path="M12 4v16m8-8H4" className="w-4 h-4" />
          Add another
        </button>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleSkip}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={submitting}
          >
            Skip for now
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 min-w-[140px]"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <LoadingSpinner size="sm" text="" />
                <span>Working…</span>
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default SetupWizardModal;
