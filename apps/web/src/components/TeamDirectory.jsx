import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import {
  ensureContactIdForProjectAssignment,
  getStaffDeploymentContext,
  mapOrgRoleToDefaultProjectCrewRole,
} from '@siteweave/core-logic';
import ProjectCrewRoleSelect from './ProjectCrewRoleSelect';
import { getContactIdentityDbError, getContactIdentityError } from '../utils/contactValidation';
import LoadingSpinner from './LoadingSpinner';
import Avatar from './Avatar';
import Icon from './Icon';
import AddContactModal from './AddContactModal';
import ConfirmDialog from './ConfirmDialog';
import PermissionGuard from './PermissionGuard';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

const STAFF_FILTER_OPTIONS = ['All', 'On a project', 'Unassigned', 'Has work today'];

const ASSIGN_ICON = 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z';

function StaffCardActions({ member, canManageTeam, canDeleteMember, onAssign, onEdit, onDelete, t }) {
  const canAssign = Boolean(member.contactId || member.profileId);
  if (!canManageTeam || (!canAssign && !member.contactId && !canDeleteMember)) return null;

  return (
    <div
      className="flex shrink-0 overflow-hidden rounded-md border border-slate-200/90 bg-white shadow-sm"
      role="group"
      aria-label={t('common.actions')}
    >
      {canAssign && (
        <button
          type="button"
          onClick={() => onAssign(member)}
          className="p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
          title={t('contacts.assign_to_project')}
          aria-label={t('contacts.assign_to_project')}
        >
          <Icon path={ASSIGN_ICON} className="h-3.5 w-3.5" />
        </button>
      )}
      {member.contactId && (
        <button
          type="button"
          onClick={() => onEdit(member)}
          className="border-l border-slate-200/90 p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          title={t('common.edit')}
          aria-label={t('contacts.edit_profile')}
        >
          <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="h-3.5 w-3.5" />
        </button>
      )}
      {canDeleteMember && (
        <button
          type="button"
          onClick={() => onDelete(member)}
          className="border-l border-slate-200/90 p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          title={t('common.delete')}
          aria-label={t('common.delete')}
        >
          <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function TeamDirectory({ refreshKey = 0, onStaffChanged }) {
  const { t } = useTranslation();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const currentOrganization = state.currentOrganization;
  const user = state.user;
  const projects = state.projects || [];

  const [staffMembers, setStaffMembers] = useState([]);
  const [workContext, setWorkContext] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [staffFilter, setStaffFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignMember, setAssignMember] = useState(null);
  const [selectedAssignProject, setSelectedAssignProject] = useState('');
  const [assignProjectRole, setAssignProjectRole] = useState('Team');
  const [assignRoleExpanded, setAssignRoleExpanded] = useState(false);
  const [isAssigningContact, setIsAssigningContact] = useState(false);

  const projectNamesById = useMemo(() => {
    const map = {};
    projects.forEach((p) => { map[String(p.id)] = p.name; });
    return map;
  }, [projects]);

  const loadStaffMembers = useCallback(async () => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabaseClient
        .from('profiles')
        .select(`
          id,
          created_at,
          contact_id,
          contacts!fk_profiles_contact (
            id,
            name,
            email,
            role,
            phone,
            avatar_url,
            type
          ),
          roles (
            id,
            name
          )
        `)
        .eq('organization_id', currentOrganization.id)
        .order('created_at', { ascending: true });

      if (profilesError) throw profilesError;

      const linkedContactIds = new Set(
        (profiles || []).map((p) => p.contacts?.id).filter(Boolean),
      );

      const { data: directoryOnly, error: contactsError } = await supabaseClient
        .from('contacts')
        .select('id, name, email, role, phone, avatar_url, type')
        .eq('organization_id', currentOrganization.id)
        .eq('type', 'Team');

      if (contactsError) throw contactsError;

      const unified = [];

      (profiles || []).forEach((profile) => {
        const contact = profile.contacts;
        unified.push({
          key: profile.id,
          profileId: profile.id,
          contactId: contact?.id || null,
          name: contact?.name || t('team.unnamed_user'),
          email: contact?.email,
          phone: contact?.phone,
          avatar_url: contact?.avatar_url,
          jobTitle: contact?.role,
          appRoleName: profile.roles?.name || null,
          hasAccount: true,
          created_at: profile.created_at,
          isCurrentUser: profile.id === user?.id,
          rawContact: contact,
          project_contacts: [],
        });
      });

      (directoryOnly || []).forEach((contact) => {
        if (linkedContactIds.has(contact.id)) return;
        unified.push({
          key: `contact:${contact.id}`,
          profileId: null,
          contactId: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          avatar_url: contact.avatar_url,
          jobTitle: contact.role,
          appRoleName: null,
          hasAccount: false,
          isCurrentUser: false,
          rawContact: contact,
          project_contacts: [],
        });
      });

      unified.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const staffContactIds = unified.map((m) => m.contactId).filter(Boolean);
      if (staffContactIds.length > 0) {
        const [{ data: projectContactsRows }, ctx] = await Promise.all([
          supabaseClient
            .from('project_contacts')
            .select('contact_id, project_id, role')
            .in('contact_id', staffContactIds)
            .eq('organization_id', currentOrganization.id),
          getStaffDeploymentContext(
            supabaseClient,
            staffContactIds,
            currentOrganization.id,
            projectNamesById,
          ),
        ]);

        const projectContactsByContactId = {};
        (projectContactsRows || []).forEach((pc) => {
          if (!projectContactsByContactId[pc.contact_id]) {
            projectContactsByContactId[pc.contact_id] = [];
          }
          projectContactsByContactId[pc.contact_id].push(pc);
        });

        unified.forEach((member) => {
          if (member.contactId) {
            member.project_contacts = projectContactsByContactId[member.contactId] || [];
          }
        });

        setWorkContext(ctx);
      } else {
        setWorkContext({});
      }

      setStaffMembers(unified);
    } catch (error) {
      console.error('Error loading staff members:', error);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id, user?.id, projectNamesById, t]);

  useEffect(() => {
    if (currentOrganization?.id && user?.id) {
      loadStaffMembers();
    }
  }, [currentOrganization?.id, user?.id, refreshKey, loadStaffMembers]);

  const filteredStaff = useMemo(() => {
    let list = staffMembers;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter((m) =>
        (m.name || '').toLowerCase().includes(term) ||
        (m.jobTitle || '').toLowerCase().includes(term) ||
        (m.email || '').toLowerCase().includes(term) ||
        (m.appRoleName || '').toLowerCase().includes(term),
      );
    }

    if (staffFilter === 'Has work today') {
      list = list.filter((m) => m.contactId && (workContext[m.contactId]?.tasksDueToday || 0) > 0);
    } else if (staffFilter === 'On a project') {
      list = list.filter((m) => m.contactId && (workContext[m.contactId]?.assignedProjectIds?.length || 0) > 0);
    } else if (staffFilter === 'Unassigned') {
      list = list.filter((m) => !m.contactId || !(workContext[m.contactId]?.assignedProjectIds?.length));
    }

    return list;
  }, [staffMembers, searchTerm, staffFilter, workContext]);

  const handleSaveContact = async (contactData) => {
    setIsSavingContact(true);
    try {
      const orgId = currentOrganization?.id;
      if (orgId && (contactData.email || contactData.phone)) {
        const identityError = await getContactIdentityError(
          supabaseClient,
          orgId,
          contactData,
          t,
        );
        if (identityError) {
          addToast(identityError.message, 'error');
          return;
        }
      }

      if (editingContact) {
        const { error } = await supabaseClient
          .from('contacts')
          .update(contactData)
          .eq('id', contactData.id);
        if (error) throw error;
        addToast(t('contacts.updated_success'), 'success');
        dispatch({ type: 'UPDATE_CONTACT', payload: contactData });
      } else {
        const payload = {
          ...contactData,
          type: 'Team',
          company: 'SiteWeave',
          trade: 'Internal',
          organization_id: currentOrganization?.id,
          created_by_user_id: user?.id,
        };
        const { data, error } = await supabaseClient
          .from('contacts')
          .insert(payload)
          .select('*')
          .single();
        if (error) throw error;
        addToast(t('contacts.created_success'), 'success');
        dispatch({ type: 'ADD_CONTACT', payload: data });
      }
      setShowAddModal(false);
      setEditingContact(null);
      loadStaffMembers();
      onStaffChanged?.();
    } catch (error) {
      const dbIdentityError = getContactIdentityDbError(error, t);
      if (dbIdentityError) {
        addToast(dbIdentityError.message, 'error');
        return;
      }
      addToast(
        editingContact
          ? t('contacts.update_error', { message: error.message })
          : t('contacts.create_error', { message: error.message }),
        'error',
      );
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleEditMember = (member) => {
    if (!member.rawContact?.id && !member.contactId) return;
    setEditingContact(member.rawContact || { id: member.contactId, name: member.name });
    setShowAddModal(true);
  };

  const handleDeleteMember = (member) => {
    if (member.isCurrentUser) return;
    setMemberToDelete(member);
  };

  const confirmDeleteMember = async () => {
    if (!memberToDelete) return;

    setIsDeletingMember(true);
    try {
      if (memberToDelete.hasAccount && memberToDelete.profileId) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          addToast(t('team.not_authenticated'), 'error');
          return;
        }

        const response = await fetch(
          `${supabaseClient.supabaseUrl}/functions/v1/team-remove-user`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: memberToDelete.profileId,
              organizationId: currentOrganization.id,
            }),
          },
        );

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || t('team.failed_remove_user'));
        }
        addToast(t('team.user_removed'), 'success');
      } else if (memberToDelete.contactId) {
        const { error } = await supabaseClient
          .from('contacts')
          .delete()
          .eq('id', memberToDelete.contactId);
        if (error) throw error;
        dispatch({ type: 'DELETE_CONTACT', payload: memberToDelete.contactId });
        addToast(t('contacts.deleted_success'), 'success');
      }

      setMemberToDelete(null);
      await loadStaffMembers();
      onStaffChanged?.();
    } catch (error) {
      addToast(
        memberToDelete.hasAccount
          ? t('team.failed_remove_user')
          : t('contacts.delete_error', { message: error.message }),
        'error',
      );
    } finally {
      setIsDeletingMember(false);
    }
  };

  const handleAssignToProject = (member) => {
    if (!member.contactId && !member.profileId) return;
    if (projects.length === 0) {
      addToast(t('contacts.no_projects_to_assign'), 'warning');
      return;
    }
    const assignContact = {
      id: member.contactId || `profile:${member.profileId}`,
      profileId: member.profileId,
      email: member.email,
      phone: member.phone,
      name: member.name,
      appRoleName: member.appRoleName,
      project_contacts: member.project_contacts || [],
    };
    setAssignMember(assignContact);
    const assignedIds = (assignContact.project_contacts || []).map((pc) => String(pc.project_id));
    const unassignedProject = projects.find((p) => !assignedIds.includes(String(p.id)));
    const defaultProject = unassignedProject || projects[0];
    setSelectedAssignProject(defaultProject ? String(defaultProject.id) : '');
    setAssignProjectRole(mapOrgRoleToDefaultProjectCrewRole(member.appRoleName));
    setAssignRoleExpanded(false);
    setShowAssignModal(true);
  };

  const closeAssignModal = () => {
    setShowAssignModal(false);
    setAssignMember(null);
    setSelectedAssignProject('');
    setAssignProjectRole('Team');
    setAssignRoleExpanded(false);
    setIsAssigningContact(false);
  };

  const handleConfirmAssign = async () => {
    if (!assignMember || !selectedAssignProject) return;

    if (assignMember.project_contacts?.some((pc) => String(pc.project_id) === selectedAssignProject)) {
      addToast(t('contacts.already_assigned_project'), 'info');
      return;
    }

    setIsAssigningContact(true);
    try {
      const contactId = await ensureContactIdForProjectAssignment(supabaseClient, {
        contactId: assignMember.id,
        profileId: assignMember.profileId,
        organizationId: currentOrganization?.id,
        name: assignMember.name,
        email: assignMember.email,
        phone: assignMember.phone,
        type: 'Team',
        userId: user?.id,
      });

      const { error } = await supabaseClient
        .from('project_contacts')
        .upsert({
          project_id: selectedAssignProject,
          contact_id: contactId,
          organization_id: currentOrganization?.id,
          role: assignProjectRole,
        }, {
          onConflict: 'project_id,contact_id',
          ignoreDuplicates: true,
        });

      if (error && error.code !== '23505') {
        addToast(t('contacts.assign_error', { message: error.message }), 'error');
      } else {
        dispatch({
          type: 'ADD_PROJECT_CONTACT',
          payload: { project_id: selectedAssignProject, contact_id: contactId },
        });
        addToast(t('contacts.assigned_to_project', { name: assignMember.name }), 'success');
        closeAssignModal();
        await loadStaffMembers();
        onStaffChanged?.();
      }
    } catch (error) {
      addToast(t('contacts.assign_error', { message: error.message }), 'error');
    } finally {
      setIsAssigningContact(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const assignAssignedProjectIds = assignMember
    ? (assignMember.project_contacts || []).map((pc) => String(pc.project_id))
    : [];
  const assignAssignedProjects = projects.filter((p) => assignAssignedProjectIds.includes(String(p.id)));
  const assignUnassignedProjects = projects.filter((p) => !assignAssignedProjectIds.includes(String(p.id)));

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <input
            type="text"
            placeholder={t('team.search_staff_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 focus:ring-2 focus:ring-blue-500 sm:w-48"
          >
            {STAFF_FILTER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'All' && t('team.filter_all_staff')}
                {option === 'On a project' && t('team.filter_on_project')}
                {option === 'Unassigned' && t('team.filter_unassigned')}
                {option === 'Has work today' && t('team.filter_has_work_today')}
              </option>
            ))}
          </select>
        </div>
        <PermissionGuard permission="can_manage_team">
          <button
            type="button"
            onClick={() => { setEditingContact(null); setShowAddModal(true); }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            title={t('team.add_internal_contact_helper')}
          >
            {t('team.add_internal_contact')}
          </button>
        </PermissionGuard>
      </div>

      {filteredStaff.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate-500">{t('team.no_staff_yet')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredStaff.map((member) => {
            const ctx = member.contactId ? workContext[member.contactId] : null;
            const canManageTeam = state.userRole?.permissions?.can_manage_team === true;
            const canDeleteMember =
              canManageTeam &&
              !member.isCurrentUser &&
              (member.profileId || member.contactId);
            const projectNames = ctx?.assignedProjectNames || [];
            const visibleProjects = projectNames.slice(0, 2);
            const extraProjects = projectNames.length - visibleProjects.length;
            const hasContact = member.email || member.phone;

            return (
              <article
                key={member.key}
                className={`group relative flex flex-col rounded-xl border bg-white p-3.5 transition-shadow hover:shadow-md ${
                  member.isCurrentUser
                    ? 'border-blue-300/80 ring-1 ring-blue-500/20'
                    : 'border-slate-200/90 shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3 pr-1">
                  <div className="shrink-0">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200/80"
                      />
                    ) : (
                      <Avatar name={member.name} size="lg" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-[15px] font-semibold leading-tight text-slate-900">
                        {member.name}
                      </h3>
                      {member.isCurrentUser && (
                        <span className="shrink-0 rounded bg-blue-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                          {t('team.you')}
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {member.hasAccount
                        ? t('team.internal_contact_with_access', {
                            role: member.appRoleName || t('team.team_member'),
                          })
                        : t('team.internal_contact_no_app')}
                    </p>
                  </div>

                  <StaffCardActions
                    member={member}
                    canManageTeam={canManageTeam}
                    canDeleteMember={canDeleteMember}
                    onAssign={handleAssignToProject}
                    onEdit={handleEditMember}
                    onDelete={handleDeleteMember}
                    t={t}
                  />
                </div>

                <div className="mt-2.5 flex min-h-[1.375rem] flex-wrap items-center gap-1">
                  {visibleProjects.map((project) => (
                    <span
                      key={project}
                      className="inline-flex max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700"
                      title={project}
                    >
                      {project}
                    </span>
                  ))}
                  {extraProjects > 0 && (
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      +{extraProjects}
                    </span>
                  )}
                  {ctx?.tasksDueToday > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                      <Icon path="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" className="h-3 w-3 shrink-0" />
                      {t('team.tasks_due_today', { count: ctx.tasksDueToday })}
                    </span>
                  )}
                  {member.contactId && projectNames.length === 0 && !(ctx?.tasksDueToday > 0) && (
                    <span className="text-[11px] text-slate-400">{t('team.not_on_project')}</span>
                  )}
                </div>

                {hasContact && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    {member.email && (
                      <a href={`mailto:${member.email}`} className="truncate hover:text-blue-600">
                        {member.email}
                      </a>
                    )}
                    {member.email && member.phone && (
                      <span className="text-slate-300" aria-hidden>·</span>
                    )}
                    {member.phone && (
                      <a href={`tel:${member.phone}`} className="shrink-0 hover:text-blue-600">
                        {member.phone}
                      </a>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!memberToDelete}
        onClose={() => setMemberToDelete(null)}
        onConfirm={confirmDeleteMember}
        title={memberToDelete?.hasAccount ? t('team.remove') : t('contacts.delete_title')}
        message={
          memberToDelete?.hasAccount
            ? t('team.remove_confirm')
            : t('contacts.delete_message', { name: memberToDelete?.name })
        }
        confirmText={memberToDelete?.hasAccount ? t('team.remove') : t('common.delete')}
        confirmClass="bg-red-600 hover:bg-red-700"
        isLoading={isDeletingMember}
      />

      {showAssignModal && assignMember && (
        <ModalOverlay onClose={closeAssignModal}>
          <div className={`bg-white rounded-xl shadow-2xl w-full max-w-md p-6 ${MODAL_PANEL_MAX_H} overflow-y-auto`}>
            <h2 className="text-2xl font-bold mb-2">{t('contacts.assign_title')}</h2>
            <p className="text-gray-600 text-sm mb-4">
              {t('contacts.assign_description', { name: assignMember.name })}
            </p>

            {assignAssignedProjects.length > 0 && (
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('contacts.currently_assigned', { count: assignAssignedProjects.length })}
                </label>
                <div className="space-y-2">
                  {assignAssignedProjects.map((project) => (
                    <div key={project.id} className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-sm font-medium text-blue-900">{project.name}</span>
                      <span className="text-xs text-blue-600 font-semibold">{t('contacts.assigned_badge')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {assignAssignedProjects.length > 0 ? t('contacts.assign_another') : t('contacts.select_project')}
              </label>
              <select
                value={selectedAssignProject}
                onChange={(e) => setSelectedAssignProject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                disabled={projects.length === 0 || assignUnassignedProjects.length === 0}
              >
                <option value="" disabled>
                  {assignUnassignedProjects.length === 0
                    ? t('contacts.all_projects_assigned')
                    : t('contacts.select_a_project')}
                </option>
                {assignUnassignedProjects.map((project) => (
                  <option key={project.id} value={String(project.id)}>{project.name}</option>
                ))}
              </select>
            </div>

            {assignUnassignedProjects.length > 0 && (
              <div className="mb-6">
                {assignRoleExpanded ? (
                  <ProjectCrewRoleSelect
                    id="team-assign-project-role"
                    value={assignProjectRole}
                    onChange={setAssignProjectRole}
                    companyAccessName={assignMember.appRoleName}
                  />
                ) : (
                  <ProjectCrewRoleSelect
                    value={assignProjectRole}
                    collapsed
                    companyAccessName={assignMember.appRoleName}
                    onExpand={() => setAssignRoleExpanded(true)}
                  />
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" onClick={closeAssignModal} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {t('common.close')}
              </button>
              <button
                type="button"
                onClick={handleConfirmAssign}
                disabled={isAssigningContact || !selectedAssignProject || assignUnassignedProjects.length === 0}
                className="rounded-lg px-4 py-2 text-sm font-semibold app-action-primary disabled:opacity-50"
              >
                {isAssigningContact ? t('contacts.assigning') : t('share.add_to_project')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showAddModal && (
        <AddContactModal
          onClose={() => { setShowAddModal(false); setEditingContact(null); }}
          onSave={handleSaveContact}
          contact={editingContact}
          isLoading={isSavingContact}
          currentOrganization={currentOrganization}
          contactMode="staff"
        />
      )}
    </div>
  );
}

export default TeamDirectory;
