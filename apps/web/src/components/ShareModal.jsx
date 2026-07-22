import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient, useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import {
  canInviteGuestCollaborator,
  isGuestCollaboratorLimitError,
  defaultProjectCrewRoleForContact,
  ensureContactIdForProjectAssignment,
} from '@siteweave/core-logic';
import UpgradeRequiredModal from './UpgradeRequiredModal';
import Avatar from './Avatar';
import ProjectCrewRoleSelect from './ProjectCrewRoleSelect';
import {
  getProjectInviteBlockedEmails,
  isBlockedProjectInviteEmail,
  resolveOwnerContactId,
} from '../utils/projectInviteBlocklist';
import { FieldError, fieldInputClassName } from './FormAlert';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

function ShareModal({ projectId, onClose, canManageCrew = true }) {
  const { t } = useTranslation();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const directorySectionRef = useRef(null);
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState([]);
  const [expandedQueueEmails, setExpandedQueueEmails] = useState(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [showContactPicker, setShowContactPicker] = useState(true);
  const [warning, setWarning] = useState(null);
  const [addingContactId, setAddingContactId] = useState(null);
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [updatingRoleMemberId, setUpdatingRoleMemberId] = useState(null);
  const [showGuestLimitUpgrade, setShowGuestLimitUpgrade] = useState(false);
  const [orgRolesByEmail, setOrgRolesByEmail] = useState({});

  const allowManage = canManageCrew === true;

  const [dbProjectMembers, setDbProjectMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const project = useMemo(
    () => state.projects?.find((p) => p.id === projectId),
    [state.projects, projectId],
  );

  const ownerContactId = useMemo(
    () => resolveOwnerContactId({
      project,
      user: state.user,
      userContactId: state.userContactId,
      profiles: state.profiles,
      contacts: state.contacts,
    }),
    [project, state.user, state.userContactId, state.profiles, state.contacts],
  );

  const projectMembers = dbProjectMembers;

  const blockedInviteEmails = useMemo(
    () => getProjectInviteBlockedEmails({
      project,
      user: state.user,
      projectMembers,
      profiles: state.profiles,
      userContactId: state.userContactId,
      contacts: state.contacts,
    }),
    [project, state.user, state.userContactId, state.profiles, state.contacts, projectMembers],
  );

  const userEmail = state.user?.email?.trim().toLowerCase() || '';

  const resolveDefaultRole = useCallback((email, contactType = null) => {
    const normalized = email?.trim().toLowerCase();
    const orgRoleName = normalized ? orgRolesByEmail[normalized] : null;
    return defaultProjectCrewRoleForContact({
      orgRoleName,
      contactType,
      hasOrgAccount: Boolean(orgRoleName),
    });
  }, [orgRolesByEmail]);

  const loadProjectMembers = async () => {
    if (!projectId) return;

    setLoadingMembers(true);
    try {
      const { data: projectContactRows, error: loadError } = await supabaseClient
        .from('project_contacts')
        .select('contact_id, role')
        .eq('project_id', projectId);

      if (loadError) {
        console.error('Error loading project members:', loadError);
        setDbProjectMembers([]);
        return;
      }

      if (!projectContactRows?.length) {
        setDbProjectMembers([]);
        return;
      }

      const contactIds = [...new Set(projectContactRows.map((row) => row.contact_id).filter(Boolean))];
      const { data: contactsData, error: contactsError } = await supabaseClient
        .from('contacts')
        .select('id, name, email, role, phone, avatar_url, status, type')
        .in('id', contactIds);

      if (contactsError) {
        console.error('Error loading contacts for project members:', contactsError);
        setDbProjectMembers([]);
        return;
      }

      const contactById = new Map((contactsData || []).map((c) => [c.id, c]));
      const members = [];

      for (const row of projectContactRows) {
        const contact = contactById.get(row.contact_id);
        if (!contact) continue;
        members.push({
          ...contact,
          project_contacts: [{ project_id: projectId, role: row.role }],
        });
      }

      setDbProjectMembers(members);
      members.forEach((member) => {
        dispatch({ type: 'ADD_CONTACT', payload: member });
      });
    } catch (err) {
      console.error('Error in loadProjectMembers:', err);
      setDbProjectMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadProjectMembers();
  }, [projectId]);

  useEffect(() => {
    const orgId = state.currentOrganization?.id || project?.organization_id;
    if (!orgId) return;
    (async () => {
      const { data } = await supabaseClient
        .from('profiles')
        .select('role_id, contacts!fk_profiles_contact (email), roles (name)')
        .eq('organization_id', orgId);
      const map = {};
      (data || []).forEach((row) => {
        const email = row.contacts?.email?.toLowerCase();
        if (email && row.roles?.name) map[email] = row.roles.name;
      });
      setOrgRolesByEmail(map);
    })();
  }, [state.currentOrganization?.id, project?.organization_id, dbProjectMembers.length, entries.length]);

  const projectMemberEmails = useMemo(
    () => new Set(projectMembers.map((m) => m.email?.toLowerCase()).filter(Boolean)),
    [projectMembers],
  );

  const projectMemberIds = useMemo(
    () => new Set(projectMembers.map((m) => m.id).filter(Boolean)),
    [projectMembers],
  );

  const availableContacts = useMemo(() => {
    const contactsWithEmail = state.contacts.filter((c) => c.email);
    const notInProject = contactsWithEmail.filter((contact) => !projectMemberIds.has(contact.id));
    return notInProject.filter((contact) => {
      if (isBlockedProjectInviteEmail(contact.email, blockedInviteEmails)) return false;
      return !entries.some((entry) => entry.email.toLowerCase() === contact.email.toLowerCase());
    });
  }, [state.contacts, projectMemberIds, entries, blockedInviteEmails]);

  const scrollToDirectory = () => {
    setShowContactPicker(true);
    directorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const addContact = async (contact) => {
    if (!allowManage) return;
    if (!contact.email) return;
    if (isBlockedProjectInviteEmail(contact.email, blockedInviteEmails)) {
      const isSelf = contact.email.trim().toLowerCase() === userEmail;
      addToast(
        isSelf ? t('share.cannot_invite_self') : t('share.cannot_invite_owner'),
        'info',
      );
      return;
    }
    const email = contact.email.toLowerCase();
    const role = resolveDefaultRole(email, contact.type);
    setAddingContactId(contact.id);
    setError(null);
    try {
      const organizationId = state.currentOrganization?.id || project?.organization_id;
      const contactId = await ensureContactIdForProjectAssignment(supabaseClient, {
        contactId: contact.id,
        profileId: contact.profile_id,
        organizationId,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        type: contact.type || 'Team',
        userId: state.user?.id,
      });

      const { error: assignError } = await supabaseClient
        .from('project_contacts')
        .upsert({
          project_id: projectId,
          contact_id: contactId,
          organization_id: organizationId,
          role,
        }, {
          onConflict: 'project_id,contact_id',
          ignoreDuplicates: true,
        });

      if (assignError && assignError.code !== '23505') throw assignError;

      dispatch({
        type: 'ADD_PROJECT_CONTACT',
        payload: { project_id: projectId, contact_id: contactId },
      });
      addToast(t('contacts.assigned_to_project', { name: contact.name || contact.email }), 'success');
      await loadProjectMembers();
    } catch (err) {
      console.error('Error adding project contact:', err);
      setError(err?.message || 'Could not add this person to the project. Try again.');
    } finally {
      setAddingContactId(null);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!allowManage) return;
    if (!projectId || !member?.id || removingMemberId) return;
    if (member.id === ownerContactId) {
      setError(t('share.cannot_invite_owner'));
      return;
    }

    const confirmed = window.confirm(`Remove ${member.name || member.email} from this project?`);
    if (!confirmed) return;

    setRemovingMemberId(member.id);
    try {
      const { error: deleteError } = await supabaseClient
        .from('project_contacts')
        .delete()
        .eq('project_id', projectId)
        .eq('contact_id', member.id);

      if (deleteError) throw deleteError;

      setDbProjectMembers((prev) => prev.filter((m) => m.id !== member.id));
      dispatch({
        type: 'REMOVE_PROJECT_CONTACT',
        payload: { project_id: projectId, contact_id: member.id },
      });
      addToast(`${member.name || member.email} removed from project`, 'success');
    } catch (err) {
      console.error('Error removing member:', err);
      setError(err?.message || 'Could not remove this person. Try again.');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleUpdateMemberRole = async (member, newRole) => {
    if (!allowManage) return;
    if (!projectId || !member?.id || updatingRoleMemberId) return;
    const currentRole = member.project_contacts?.find(
      (pc) => String(pc.project_id) === String(projectId),
    )?.role || 'Team';
    if (currentRole === newRole) return;

    setUpdatingRoleMemberId(member.id);
    try {
      const { error: updateError } = await supabaseClient
        .from('project_contacts')
        .update({ role: newRole })
        .eq('project_id', projectId)
        .eq('contact_id', member.id);

      if (updateError) throw updateError;

      setDbProjectMembers((prev) => prev.map((m) => {
        if (m.id !== member.id) return m;
        return {
          ...m,
          project_contacts: [{ project_id: projectId, role: newRole }],
        };
      }));
      addToast(t('share.role_updated'), 'success');
    } catch (err) {
      console.error('Error updating project role:', err);
      setError(err?.message || 'Could not save the role. Try again.');
    } finally {
      setUpdatingRoleMemberId(null);
    }
  };

  const addEmails = () => {
    const parts = input
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const deduped = Array.from(new Set(parts));

    const blocked = deduped.filter((email) => isBlockedProjectInviteEmail(email, blockedInviteEmails));
    const alreadyInProject = deduped.filter((email) => projectMemberEmails.has(email));
    const alreadyQueued = deduped.filter((email) => entries.some((en) => en.email === email));

    const newEntries = deduped
      .filter((e) => !isBlockedProjectInviteEmail(e, blockedInviteEmails))
      .filter((e) => !projectMemberEmails.has(e))
      .filter((e) => !entries.some((en) => en.email === e))
      .map((email) => ({
        email,
        role: resolveDefaultRole(email),
        isOrgMember: false,
      }));

    if (newEntries.length) {
      setEntries((prev) => [...prev, ...newEntries]);
    }

    const messages = [];
    if (blocked.length) {
      const selfBlocked = blocked.filter((e) => e === userEmail);
      const ownerBlocked = blocked.filter((e) => e !== userEmail);
      if (selfBlocked.length) messages.push(t('share.cannot_invite_self'));
      if (ownerBlocked.length) {
        messages.push(t('share.cannot_invite_owner_emails', { emails: ownerBlocked.join(', ') }));
      }
    }
    if (alreadyInProject.length) {
      messages.push(t('share.already_on_project', { emails: alreadyInProject.join(', ') }));
    }
    if (alreadyQueued.length) {
      messages.push(t('share.already_selected', { emails: alreadyQueued.join(', ') }));
    }
    setWarning(messages.length ? messages.join(' • ') : null);
    setInput('');
  };

  const updateRole = (email, role) => {
    setEntries((prev) => prev.map((en) => (en.email === email ? { ...en, role } : en)));
  };

  const removeEntry = (email) => {
    setEntries((prev) => prev.filter((en) => en.email !== email));
    setExpandedQueueEmails((prev) => {
      const next = new Set(prev);
      next.delete(email);
      return next;
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!allowManage) return;
    setSubmitting(true);
    setError(null);
    setResults(null);
    try {
      const orgId = state.currentOrganization?.id || project?.organization_id;
      if (orgId && entries.length > 0) {
        const allowed = await canInviteGuestCollaborator(supabaseClient, orgId, projectId);
        if (!allowed) {
          setShowGuestLimitUpgrade(true);
          setSubmitting(false);
          return;
        }
      }
      const safeEntries = entries
        .filter((en) => !isBlockedProjectInviteEmail(en.email, blockedInviteEmails))
        .map(({ email, role }) => ({ email, role }));
      if (safeEntries.length === 0) {
        setError(t('share.no_valid_invites'));
        setSubmitting(false);
        return;
      }

      const { data, error: fnError } = await supabaseClient.functions.invoke('invite_or_add_member', {
        body: { projectId, entries: safeEntries, addedByUserId: state.user?.id },
      });

      if (fnError) throw new Error(fnError.message || 'Could not add crew members. Try again.');

      setResults(data?.results || []);
      await loadProjectMembers();
      setEntries([]);
      setExpandedQueueEmails(new Set());
      addToast('Members added successfully!', 'success');
    } catch (err) {
      console.error('Full error:', err);
      if (isGuestCollaboratorLimitError(err) || err?.message?.includes('GUEST_COLLABORATOR_LIMIT')) {
        setShowGuestLimitUpgrade(true);
      } else {
        setError(err?.message || 'Could not add crew members. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const memberProjectRole = (member) =>
    member.project_contacts?.find((pc) => String(pc.project_id) === String(projectId))?.role
    || member.type
    || 'Team';

  return (
    <>
    <ModalOverlay onClose={onClose}>
      <div className={`w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl ring-1 ring-slate-200/80 ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{t('projectDetail.manage_project_crew')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('share.role_on_project_helper')}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-800">
                Current Crew {!loadingMembers && `(${projectMembers.length})`}
              </label>
              {loadingMembers && <span className="text-xs text-slate-400">Loading...</span>}
            </div>

            {loadingMembers ? (
              <div className="py-4 text-center text-sm text-slate-500">Loading project members...</div>
            ) : projectMembers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-8 text-center">
                <p className="text-sm font-semibold text-slate-800">{t('share.crew_empty_title')}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('share.crew_empty_body')}</p>
                {allowManage && availableContacts.length > 0 && (
                  <button
                    type="button"
                    onClick={scrollToDirectory}
                    className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition active:scale-[0.98] hover:bg-blue-700"
                  >
                    {t('share.crew_empty_cta')}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {projectMembers.map((member) => {
                  const isOwner = member.id === ownerContactId;
                  const emailKey = member.email?.toLowerCase();
                  const companyAccess = emailKey ? orgRolesByEmail[emailKey] : null;
                  const currentRole = memberProjectRole(member);

                  return (
                    <div
                      key={member.id}
                      className={`flex flex-wrap items-start gap-3 rounded-lg border px-3 py-3 ${
                        isOwner ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      <Avatar
                        name={member.name || member.email}
                        avatarUrl={member.avatar_url}
                        size="md"
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {member.name || member.email}
                        </div>
                        <div className="text-xs text-slate-500 truncate">{member.email}</div>
                        {companyAccess && (
                          <p className="mt-1 text-xs text-slate-500">
                            {t('share.company_access', { role: companyAccess })}
                          </p>
                        )}
                      </div>

                      {isOwner ? (
                        <span className="rounded-full border border-blue-200 bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          Owner
                        </span>
                      ) : allowManage ? (
                        <div className="w-full sm:w-auto sm:min-w-[11rem]">
                          <ProjectCrewRoleSelect
                            id={`crew-role-${member.id}`}
                            value={currentRole}
                            onChange={(role) => handleUpdateMemberRole(member, role)}
                            companyAccessName={null}
                            showHelper={false}
                            compact
                            disabled={updatingRoleMemberId === member.id}
                          />
                        </div>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {currentRole}
                        </span>
                      )}

                      {!isOwner && allowManage && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member)}
                          disabled={removingMemberId === member.id}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-slate-400"
                        >
                          {removingMemberId === member.id ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {allowManage && availableContacts.length > 0 && (
            <div ref={directorySectionRef} className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-slate-800">{t('share.add_org_member_section')}</label>
                  <p className="mt-0.5 text-xs text-slate-500">{t('share.add_org_member_hint')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowContactPicker(!showContactPicker)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  {showContactPicker ? 'Hide' : 'Show'} ({availableContacts.length})
                </button>
              </div>

              {showContactPicker && (
                <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
                  <div className="divide-y divide-slate-100">
                    {availableContacts.map((contact) => {
                      const orgRole = contact.email
                        ? orgRolesByEmail[contact.email.toLowerCase()]
                        : null;
                      return (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => addContact(contact)}
                          disabled={addingContactId === contact.id}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-50/80"
                        >
                          <Avatar
                            name={contact.name}
                            avatarUrl={contact.avatar_url}
                            size="md"
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-900">{contact.name}</div>
                            <div className="text-xs text-slate-500">{contact.email}</div>
                            {orgRole && (
                              <div className="mt-0.5 text-xs text-slate-500">
                                {t('share.company_access', { role: orgRole })}
                              </div>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-medium text-blue-600">
                            {addingContactId === contact.id ? 'Adding...' : '+ Add'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {allowManage && (
          <>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-semibold text-slate-800">
              {t('share.invite_guest_section')}
            </label>
            <p className="mb-2 text-xs text-slate-500">{t('share.invite_guest_hint')}</p>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. user@example.com"
                aria-invalid={!!error}
                className={fieldInputClassName(
                  !!error,
                  'flex-1 rounded-lg border px-3 py-2 shadow-xs focus:outline-hidden focus:ring-2',
                )}
              />
              <button
                type="button"
                onClick={addEmails}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition active:scale-[0.98] hover:bg-slate-200"
              >
                Add
              </button>
            </div>
            <FieldError message={error} />
            {warning && <p className="mt-1.5 text-xs text-amber-700">{warning}</p>}
          </div>

          {entries.length > 0 && (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                {t('share.selected_to_add', { count: entries.length })}
              </label>
              <div className="space-y-2">
                {entries.map((en) => {
                  const companyAccess = orgRolesByEmail[en.email];
                  const isExpanded = expandedQueueEmails.has(en.email);
                  const isGuest = !en.isOrgMember && !companyAccess;

                  return (
                    <div
                      key={en.email}
                      className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 bg-blue-50/50 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900">{en.name || en.email}</div>
                        {en.name && <div className="text-xs text-slate-500">{en.email}</div>}
                        {companyAccess && !en.isOrgMember && (
                          <p className="mt-1 text-xs text-amber-700">{t('share.already_in_org_use_directory')}</p>
                        )}
                      </div>

                      {isGuest || isExpanded ? (
                        <div className="w-full sm:w-56">
                          <ProjectCrewRoleSelect
                            id={`queue-role-${en.email}`}
                            value={en.role}
                            onChange={(role) => updateRole(en.email, role)}
                            companyAccessName={companyAccess}
                            showHelper={isExpanded}
                          />
                        </div>
                      ) : (
                        <ProjectCrewRoleSelect
                          value={en.role}
                          collapsed
                          companyAccessName={companyAccess}
                          onExpand={() => setExpandedQueueEmails((prev) => new Set(prev).add(en.email))}
                          compact
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => removeEntry(en.email)}
                        className="text-sm text-slate-500 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {results && (
            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-700">Results</div>
              <ul className="space-y-2 text-sm">
                {results.map((r) => (
                  <li key={r.email} className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{r.email}</span>
                    <span className="text-slate-600">{r.action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || entries.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition active:scale-[0.98] hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Adding…' : t('share.add_count_to_crew', { count: entries.length })}
            </button>
          </div>
          </>
          )}

          {!allowManage && (
            <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          )}
        </form>
      </div>
    </ModalOverlay>
      <UpgradeRequiredModal
        isOpen={showGuestLimitUpgrade}
        onClose={() => setShowGuestLimitUpgrade(false)}
        feature="guest_collaborators"
      />
    </>
  );
}

export default ShareModal;
