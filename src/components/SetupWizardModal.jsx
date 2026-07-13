import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getRoles } from '../utils/roleManagementService';
import {
  getOrganizationBranding,
  updateOrganizationBranding,
  uploadLogo,
} from '@siteweave/core-logic';
import {
  seedStarterTemplatesIfNeeded,
  loadSampleProjectIfRequested,
  markTeamInviteSent,
} from '@siteweave/onboarding-ui';
import { createProjectFromTemplate } from '../utils/projectTemplateService';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';
import Icon from './Icon';

const PRESETS = [
  {
    id: 'admin',
    roleName: 'Org Admin',
    label: 'Admin',
    description: 'Can invite and manage users',
  },
  {
    id: 'member',
    roleName: 'Member',
    label: 'Member',
    description: 'Can add and edit content',
  },
  {
    id: 'pm',
    roleName: 'Project Manager',
    label: 'Project Manager',
    description: 'Can manage projects, tasks, and assignments',
  },
];

function makeRow() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, email: '', preset: 'member' };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function SetupWizardModal({ show, onComplete }) {
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const currentOrganization = state.currentOrganization;
  const user = state.user;

  const [wizardStep, setWizardStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [loadSampleProject, setLoadSampleProject] = useState(false);
  const [rows, setRows] = useState([makeRow(), makeRow()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!show || !currentOrganization?.id) return;

    setWizardStep(1);
    setWorkspaceName(currentOrganization.name || '');
    setRows([makeRow(), makeRow()]);
    setLoadSampleProject(false);
    setLogoFile(null);
    setLogoPreview(null);

    (async () => {
      try {
        const branding = await getOrganizationBranding(supabaseClient, currentOrganization.id);
        setPrimaryColor(branding.primary_color || '#3B82F6');
        if (branding.logo_url) setLogoPreview(branding.logo_url);
      } catch {
        /* optional */
      }
    })();
  }, [show, currentOrganization?.id, currentOrganization?.name]);

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

  const refreshOrganization = async () => {
    if (!currentOrganization?.id) return;
    const { data: org } = await supabaseClient
      .from('organizations')
      .select('*')
      .eq('id', currentOrganization.id)
      .single();
    if (org) dispatch({ type: 'SET_ORGANIZATION', payload: org });
  };

  const saveIdentityStep = async () => {
    const trimmedName = workspaceName.trim();
    if (!trimmedName) {
      addToast('Enter a workspace name', 'error');
      return false;
    }

    const { error: nameError } = await supabaseClient
      .from('organizations')
      .update({ name: trimmedName })
      .eq('id', currentOrganization.id);

    if (nameError) {
      addToast(nameError.message || 'Could not save workspace name', 'error');
      return false;
    }

    let logoUrl = logoPreview;
    if (logoFile) {
      logoUrl = await uploadLogo(supabaseClient, currentOrganization.id, logoFile);
      setLogoPreview(logoUrl);
      setLogoFile(null);
    }

    await updateOrganizationBranding(supabaseClient, currentOrganization.id, {
      primary_color: primaryColor,
      logo_url: logoUrl,
    });

    await seedStarterTemplatesIfNeeded(supabaseClient, currentOrganization.id, user.id);
    await refreshOrganization();
    return true;
  };

  const handleIdentityContinue = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ok = await saveIdentityStep();
      if (ok) setWizardStep(2);
    } catch (err) {
      addToast(err.message || 'Could not save workspace', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (
      window.confirm(
        'Skip setup for now? You can finish workspace branding and invites later in Organization settings.',
      )
    ) {
      (async () => {
        try {
          setSubmitting(true);
          await markWizardComplete();
          addToast('Setup saved.', 'success');
          onComplete?.({ startTour: false });
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

  const handleInviteSubmit = async (e) => {
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
      if (loadSampleProject) {
        const sampleResult = await loadSampleProjectIfRequested(
          supabaseClient,
          currentOrganization.id,
          user.id,
          createProjectFromTemplate,
        );
        if (sampleResult?.success && sampleResult.projectId) {
          const { data: newProject } = await supabaseClient
            .from('projects')
            .select('*')
            .eq('id', sampleResult.projectId)
            .single();
          if (newProject) dispatch({ type: 'ADD_PROJECT', payload: newProject });
        }
      }

      if (toInvite.length === 0) {
        await markWizardComplete();
        addToast('Workspace ready!', 'success');
        onComplete?.({ startTour: true });
        return;
      }

      const rolesList = await getRoles(supabaseClient, currentOrganization.id);
      const byName = new Map(rolesList.map((role) => [role.name, role.id]));

      const {
        data: { session },
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

        const response = await fetch(`${supabaseClient.supabaseUrl}/functions/v1/team-invite`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: row.email,
            organizationId: currentOrganization.id,
            roleId,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.warn('team-invite', row.email, body);
          inviteErrors += 1;
          addToast(body?.error || `Invite failed for ${row.email}`, 'error');
        }
      }

      await markWizardComplete();
      if (inviteErrors === 0) {
        addToast('Invites sent. Workspace ready!', 'success');
      } else {
        addToast('Setup saved. Fix any failed invites from Organization settings.', 'success');
      }
      if (toInvite.length > 0) {
        markTeamInviteSent(user.id);
      }
      onComplete?.({ startTour: true });
    } catch (err) {
      console.error(err);
      if (!err?.message?.includes('Could not save')) {
        addToast(err.message || 'Something went wrong', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitle =
    wizardStep === 1 ? 'Set up your workspace' : 'Who else is on your team?';

  return (
    <Modal show={show} onClose={handleClose} title={stepTitle} size="large">
      {wizardStep === 1 ? (
        <form onSubmit={handleIdentityContinue} className="space-y-6">
          <p className="text-sm text-gray-600">
            Name your workspace and brand it for progress reports. Your logo and color appear on PDFs
            you send to clients and architects.
          </p>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Workspace name</label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Oak Street Builders"
              disabled={submitting}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Brand color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                  disabled={submitting}
                />
                <span className="text-sm text-gray-500">{primaryColor}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Logo (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setLogoFile(file);
                  setLogoPreview(URL.createObjectURL(file));
                }}
                className="block w-full text-sm text-gray-600"
                disabled={submitting}
              />
              {logoPreview ? (
                <img src={logoPreview} alt="" className="mt-2 h-12 w-auto object-contain" />
              ) : null}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              Skip for now
            </button>
            <button
              type="submit"
              className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
      ) : (
        <form onSubmit={handleInviteSubmit} className="space-y-6">
          <p className="text-sm text-gray-600">
            Add email addresses and choose a default role for each person. You can fine-tune roles later
            in settings.
          </p>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
            <input
              type="checkbox"
              checked={loadSampleProject}
              onChange={(e) => setLoadSampleProject(e.target.checked)}
              className="mt-1"
              disabled={submitting}
            />
            <span className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">Load a sample project</span>
              <span className="mt-0.5 block text-gray-600">
                Explore phases, Gantt, and reports with labeled demo data you can remove anytime.
              </span>
            </span>
          </label>

          <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
            {rows.map((row) => {
              const preset = PRESETS.find((p) => p.id === row.preset) || PRESETS[1];
              return (
                <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                  <input
                    type="email"
                    placeholder="Add email here"
                    value={row.email}
                    onChange={(e) => updateRow(row.id, { email: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    autoComplete="off"
                    disabled={submitting}
                  />
                  <div className="flex shrink-0 items-start gap-2 sm:w-[280px]">
                    <div className="min-w-0 flex-1">
                      <select
                        value={row.preset}
                        onChange={(e) => updateRow(row.id, { preset: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                        disabled={submitting}
                        aria-label="Role"
                      >
                        {PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">{preset.description}</p>
                    </div>
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="mt-0.5 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove row"
                        disabled={submitting}
                      >
                        <Icon path="M6 18L18 6M6 6l12 12" className="h-5 w-5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
            disabled={submitting}
          >
            <Icon path="M12 4v16m8-8H4" className="h-4 w-4" />
            Add another
          </button>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => setWizardStep(1)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              disabled={submitting}
            >
              Back
            </button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleSkip}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={submitting}
              >
                Skip for now
              </button>
              <button
                type="submit"
                className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <LoadingSpinner size="sm" text="" />
                    <span>Working…</span>
                  </>
                ) : (
                  'Finish setup'
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default SetupWizardModal;
