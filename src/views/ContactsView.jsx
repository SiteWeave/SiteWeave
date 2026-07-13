import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import AddContactModal from '../components/AddContactModal';
import ContactCard from '../components/ContactCard';
import ConfirmDialog from '../components/ConfirmDialog';
import { logContactCreated, logContactUpdated } from '../utils/activityLogger';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import UpgradeRequiredModal from '../components/UpgradeRequiredModal';
import { getContactIdentityDbError, getContactIdentityError } from '../utils/contactValidation';
import { loadSmsConsentByPhones, resolveContactSmsConsent } from '../utils/smsWebConsent';
import {
  defaultProjectCrewRoleForContact,
  ensureContactIdForProjectAssignment,
  normalizeAssigneePhone,
} from '@siteweave/core-logic';
import ProjectCrewRoleSelect from '../components/ProjectCrewRoleSelect';

function ContactsView({ embedded = false, defaultProjectFilter = null }) {
    const { t } = useTranslation();
    const { state, dispatch } = useAppContext();
    const { addToast } = useToast();
    const { canExport } = useWorkspaceTier();
    const [showExportUpgrade, setShowExportUpgrade] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingContact, setEditingContact] = useState(null);
    const [isCreatingContact, setIsCreatingContact] = useState(false);
    const [isUpdatingContact, setIsUpdatingContact] = useState(false);
    const [isDeletingContact, setIsDeletingContact] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [contactToDelete, setContactToDelete] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [tradeFilter, setTradeFilter] = useState('All Trades');
    const [projectFilter, setProjectFilter] = useState('All Projects');
    const [showImportModal, setShowImportModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignContact, setAssignContact] = useState(null);
    const [selectedAssignProject, setSelectedAssignProject] = useState('');
    const [assignProjectRole, setAssignProjectRole] = useState('Subcontractor');
    const [assignRoleExpanded, setAssignRoleExpanded] = useState(false);
    const [isAssigningContact, setIsAssigningContact] = useState(false);
    const [smsConsentMap, setSmsConsentMap] = useState(() => new Map());

    useEffect(() => {
        if (defaultProjectFilter) {
            setProjectFilter(String(defaultProjectFilter));
        } else if (embedded) {
            setProjectFilter('All Projects');
        }
    }, [defaultProjectFilter, embedded]);

    const contacts = state.contacts || [];
    const projects = state.projects || [];
    const tradePartners = useMemo(
        () => contacts.filter((c) => c.type === 'Subcontractor'),
        [contacts],
    );

    const tradePartnerPhoneKey = useMemo(
        () => tradePartners
            .map((contact) => normalizeAssigneePhone(contact?.phone, { defaultRegion: 'US' }).e164)
            .filter(Boolean)
            .sort()
            .join('|'),
        [tradePartners],
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const map = await loadSmsConsentByPhones(
                supabaseClient,
                tradePartners,
                state.currentOrganization?.id,
            );
            if (!cancelled) setSmsConsentMap(map);
        })();
        return () => { cancelled = true; };
    }, [tradePartnerPhoneKey, state.currentOrganization?.id]);

    const tradeOptions = useMemo(() => {
        const trades = new Set(tradePartners.map(c => c.trade).filter(Boolean));
        return [
            { value: 'All Trades', label: t('contacts.all_trades') },
            ...Array.from(trades).sort().map(tr => ({ value: tr, label: tr })),
        ];
    }, [tradePartners, t]);

    const filteredContacts = useMemo(() => {
        let list = tradePartners;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            list = list.filter(contact =>
                (contact.name || '').toLowerCase().includes(term) ||
                (contact.company || '').toLowerCase().includes(term) ||
                (contact.trade || '').toLowerCase().includes(term) ||
                (contact.email || '').toLowerCase().includes(term),
            );
        }

        if (tradeFilter !== 'All Trades') {
            list = list.filter(contact => contact.trade === tradeFilter);
        }

        if (projectFilter !== 'All Projects') {
            list = list.filter(contact =>
                Array.isArray(contact.project_contacts) &&
                contact.project_contacts.some(pc => String(pc.project_id) === projectFilter),
            );
        }

        return list;
    }, [tradePartners, searchTerm, tradeFilter, projectFilter]);

    const handleSaveContact = async (contactData) => {
        const orgId = state.currentOrganization?.id;
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
            setIsUpdatingContact(true);
            const { error } = await supabaseClient
                .from('contacts')
                .update(contactData)
                .eq('id', contactData.id);

            if (error) {
                const dbIdentityError = getContactIdentityDbError(error, t);
                addToast(
                    dbIdentityError?.message || t('contacts.update_error', { message: error.message }),
                    'error',
                );
            } else {
                const trackKeys = ['name', 'role', 'type', 'company', 'trade', 'email', 'phone'];
                const changes = {};
                trackKeys.forEach((k) => {
                    if (contactData[k] !== undefined && editingContact[k] !== contactData[k]) {
                        changes[k] = { from: editingContact[k], to: contactData[k] };
                    }
                });
                if (Object.keys(changes).length > 0 && state.user) {
                    logContactUpdated(
                        { ...editingContact, ...contactData, organization_id: editingContact.organization_id ?? state.currentOrganization?.id },
                        state.user,
                        changes,
                    );
                }
                const hasEmail = contactData.email && String(contactData.email).includes('@');
                addToast(
                    hasEmail ? t('contacts.saved_with_email') : t('contacts.saved_add_email'),
                    'success',
                );
                dispatch({ type: 'UPDATE_CONTACT', payload: contactData });
                setShowAddModal(false);
                setEditingContact(null);
            }
            setIsUpdatingContact(false);
        } else {
            setIsCreatingContact(true);
            const contactDataWithAudit = {
                ...contactData,
                type: 'Subcontractor',
                status: null,
                created_by_user_id: state.user?.id,
                organization_id: state.currentOrganization?.id,
            };
            const { data, error } = await supabaseClient
                .from('contacts')
                .insert(contactDataWithAudit)
                .select('*, project_contacts!fk_project_contacts_contact_id(project_id)')
                .single();

            if (error) {
                const dbIdentityError = getContactIdentityDbError(error, t);
                addToast(
                    dbIdentityError?.message || t('contacts.create_error', { message: error.message }),
                    'error',
                );
            } else {
                const hasEmail = contactData.email && String(contactData.email).includes('@');
                addToast(
                    hasEmail ? t('contacts.saved_with_email') : t('contacts.saved_add_email'),
                    'success',
                );
                dispatch({ type: 'ADD_CONTACT', payload: data });
                if (state.user) logContactCreated(data, state.user, null);
                setShowAddModal(false);
            }
            setIsCreatingContact(false);
        }
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        setShowAddModal(true);
    };

    const handleDeleteContact = (contact) => {
        setContactToDelete(contact);
        setShowDeleteConfirm(true);
    };

    const confirmDeleteContact = async () => {
        if (!contactToDelete) return;

        setIsDeletingContact(true);
        const { error } = await supabaseClient
            .from('contacts')
            .delete()
            .eq('id', contactToDelete.id);

        if (error) {
            addToast(t('contacts.delete_error', { message: error.message }), 'error');
        } else {
            addToast(t('contacts.deleted_success'), 'success');
            dispatch({ type: 'DELETE_CONTACT', payload: contactToDelete.id });
        }

        setIsDeletingContact(false);
        setShowDeleteConfirm(false);
        setContactToDelete(null);
    };

    const handleImportContacts = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const csv = ev.target.result;
                        const lines = csv.split('\n');
                        const headers = lines[0].split(',');
                        const parsed = lines.slice(1).map(line => {
                            const values = line.split(',');
                            const contact = {};
                            headers.forEach((header, index) => {
                                contact[header.trim().toLowerCase().replace(' ', '_')] = values[index]?.trim();
                            });
                            return contact;
                        }).filter(contact => contact.name);
                        addToast(t('contacts.import_found', { count: parsed.length }), 'info');
                    } catch {
                        addToast(t('contacts.import_parse_error'), 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
        setShowImportModal(false);
    };

    const handleExportContacts = () => {
        if (!canExport) {
            setShowExportUpgrade(true);
            setShowExportModal(false);
            return;
        }
        const csvContent = [
            'Company,Trade,Name,Role,Email,Phone',
            ...tradePartners.map(contact =>
                `"${contact.company || ''}","${contact.trade || ''}","${contact.name}","${contact.role || ''}","${contact.email || ''}","${contact.phone || ''}"`,
            ),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'trade_partners.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        addToast(t('contacts.exported_success'), 'success');
        setShowExportModal(false);
    };

    const handleAssignToProject = (contact) => {
        if (projects.length === 0) {
            addToast(t('contacts.no_projects_to_assign'), 'warning');
            return;
        }
        setAssignContact(contact);
        const assignedIds = (contact.project_contacts || []).map(pc => String(pc.project_id));
        const unassignedProject = projects.find(project => !assignedIds.includes(String(project.id)));
        const defaultProject = unassignedProject || state.projects[0];
        setSelectedAssignProject(defaultProject ? String(defaultProject.id) : '');
        setAssignProjectRole(defaultProjectCrewRoleForContact({ contactType: contact.type || 'Subcontractor' }));
        setAssignRoleExpanded(false);
        setShowAssignModal(true);
    };

    const closeAssignModal = () => {
        setShowAssignModal(false);
        setAssignContact(null);
        setSelectedAssignProject('');
        setAssignProjectRole('Subcontractor');
        setAssignRoleExpanded(false);
        setIsAssigningContact(false);
    };

    const handleConfirmAssign = async () => {
        if (!assignContact || !selectedAssignProject) return;

        if (assignContact.project_contacts?.some(pc => String(pc.project_id) === selectedAssignProject)) {
            addToast(t('contacts.already_assigned_project'), 'info');
            return;
        }

        setIsAssigningContact(true);
        try {
            const contactId = await ensureContactIdForProjectAssignment(supabaseClient, {
                contactId: assignContact.id,
                profileId: assignContact.profile_id,
                organizationId: state.currentOrganization?.id,
                name: assignContact.name,
                email: assignContact.email,
                phone: assignContact.phone,
                type: assignContact.type || 'Subcontractor',
                userId: state.user?.id,
            });

            const { error } = await supabaseClient
                .from('project_contacts')
                .upsert({
                    project_id: selectedAssignProject,
                    contact_id: contactId,
                    organization_id: state.currentOrganization?.id,
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
                addToast(t('contacts.assigned_to_project', { name: assignContact.name }), 'success');
                closeAssignModal();
            }
        } catch (error) {
            addToast(t('contacts.assign_error', { message: error.message }), 'error');
        } finally {
            setIsAssigningContact(false);
        }
    };

    return (
        <>
            <header className={`flex items-center justify-between ${embedded ? 'mb-4' : 'mb-6'}`}>
                <div>
                    <h1 className={`${embedded ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900`}>
                        {t('contacts.trade_partners_title')}
                    </h1>
                    <p className="text-gray-500">{t('contacts.trade_partners_subtitle')}</p>
                </div>
                <div className="flex gap-3">
                    <button type="button"
                        onClick={() => setShowImportModal(true)}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        {t('contacts.import')}
                    </button>
                    <button type="button"
                        onClick={() => setShowExportModal(true)}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        {t('contacts.export')}
                    </button>
                    <button type="button"
                        onClick={() => setShowAddModal(true)}
                        data-onboarding="add-contact-btn"
                        className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-xs hover:bg-blue-700 transition-colors"
                    >
                        {t('contacts.add_trade_partner')}
                    </button>
                </div>
            </header>

            <div className="mb-6 flex flex-col gap-3 sm:grid sm:grid-cols-3 sm:items-end sm:gap-4">
                <input
                    type="text"
                    placeholder={t('contacts.search_trade_partners_placeholder')}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="min-w-0 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="min-w-0 w-full">
                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">{t('contacts.filter_trade')}</label>
                    <select
                        value={tradeFilter}
                        onChange={e => setTradeFilter(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {tradeOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                <div className="min-w-0 w-full">
                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">{t('contacts.filter_project')}</label>
                    <select
                        value={projectFilter}
                        onChange={e => setProjectFilter(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="All Projects">{t('contacts.all_projects')}</option>
                        {projects.map(project => (
                            <option key={project.id} value={String(project.id)}>{project.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="p-6 bg-white rounded-xl shadow-xs border border-gray-200" data-onboarding="contacts-list">
                <h2 className="text-xl font-bold mb-4">
                    {t('contacts.trade_partners_heading', { count: filteredContacts.length })}
                </h2>
                <ul className="space-y-3">
                    {filteredContacts.map(c => (
                        <ContactCard
                            key={c.id}
                            contact={c}
                            onEdit={handleEditContact}
                            onDelete={handleDeleteContact}
                            showActions={true}
                            onAssignToProject={handleAssignToProject}
                            variant="trade_partner"
                            organizationId={state.currentOrganization?.id}
                            smsConsentStatus={resolveContactSmsConsent(c, smsConsentMap)}
                            onSmsConsentStatusChange={(status) => {
                                const n = normalizeAssigneePhone(c.phone, { defaultRegion: 'US' });
                                if (n.e164) {
                                    setSmsConsentMap((prev) => new Map(prev).set(n.e164, status));
                                }
                            }}
                        />
                    ))}
                </ul>
                {filteredContacts.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        {searchTerm || tradeFilter !== 'All Trades' || projectFilter !== 'All Projects'
                            ? t('contacts.no_match')
                            : t('contacts.no_trade_partners')}
                    </div>
                )}
            </div>

            {showAddModal && (
                <AddContactModal
                    onClose={() => {
                        setShowAddModal(false);
                        setEditingContact(null);
                    }}
                    onSave={handleSaveContact}
                    contact={editingContact}
                    isLoading={isCreatingContact || isUpdatingContact}
                    currentOrganization={state.currentOrganization}
                    contactMode="trade_partner"
                />
            )}

            {showDeleteConfirm && (
                <ConfirmDialog
                    isOpen={showDeleteConfirm}
                    onClose={() => {
                        setShowDeleteConfirm(false);
                        setContactToDelete(null);
                    }}
                    onConfirm={confirmDeleteContact}
                    title={t('contacts.delete_title')}
                    message={t('contacts.delete_message', { name: contactToDelete?.name })}
                    confirmText={t('common.delete')}
                    confirmClass="bg-red-600 hover:bg-red-700"
                    isLoading={isDeletingContact}
                />
            )}

            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-6">{t('contacts.import_title')}</h2>
                        <p className="text-gray-600 mb-6">{t('contacts.import_description_trade')}</p>
                        <div className="flex justify-end gap-4">
                            <button type="button" onClick={() => setShowImportModal(false)} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                                {t('common.cancel')}
                            </button>
                            <button type="button" onClick={handleImportContacts} className="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                                {t('contacts.choose_file')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showExportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-6">{t('contacts.export_title')}</h2>
                        <p className="text-gray-600 mb-6">{t('contacts.export_description_trade')}</p>
                        <div className="flex justify-end gap-4">
                            <button type="button" onClick={() => setShowExportModal(false)} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                                {t('common.cancel')}
                            </button>
                            <button type="button" onClick={handleExportContacts} className="px-6 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors">
                                {t('contacts.export')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAssignModal && assignContact && (() => {
                const assignedProjectIds = (assignContact.project_contacts || []).map(pc => String(pc.project_id));
                const assignedProjects = projects.filter(p => assignedProjectIds.includes(String(p.id)));
                const unassignedProjects = projects.filter(p => !assignedProjectIds.includes(String(p.id)));

                return (
                    <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                            <h2 className="text-2xl font-bold mb-2">{t('contacts.assign_title')}</h2>
                            <p className="text-gray-600 text-sm mb-4">
                                {t('contacts.assign_description', { name: assignContact.name })}
                            </p>

                            {assignedProjects.length > 0 && (
                                <div className="mb-6">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        {t('contacts.currently_assigned', { count: assignedProjects.length })}
                                    </label>
                                    <div className="space-y-2">
                                        {assignedProjects.map(project => (
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
                                    {assignedProjects.length > 0 ? t('contacts.assign_another') : t('contacts.select_project')}
                                </label>
                                <select
                                    value={selectedAssignProject}
                                    onChange={e => setSelectedAssignProject(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                    disabled={projects.length === 0 || unassignedProjects.length === 0}
                                >
                                    <option value="" disabled>
                                        {unassignedProjects.length === 0
                                            ? t('contacts.all_projects_assigned')
                                            : t('contacts.select_a_project')}
                                    </option>
                                    {unassignedProjects.map(project => (
                                        <option key={project.id} value={String(project.id)}>{project.name}</option>
                                    ))}
                                </select>
                            </div>

                            {unassignedProjects.length > 0 && (
                                <div className="mb-6">
                                    {assignRoleExpanded ? (
                                        <ProjectCrewRoleSelect
                                            id="contacts-assign-project-role"
                                            value={assignProjectRole}
                                            onChange={setAssignProjectRole}
                                        />
                                    ) : (
                                        <ProjectCrewRoleSelect
                                            value={assignProjectRole}
                                            collapsed
                                            onExpand={() => setAssignRoleExpanded(true)}
                                        />
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                                <button type="button" onClick={closeAssignModal} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                                    {t('common.close')}
                                </button>
                                <button type="button" onClick={handleConfirmAssign} disabled={isAssigningContact || !selectedAssignProject || unassignedProjects.length === 0} className="rounded-lg px-4 py-2 text-sm font-semibold app-action-primary disabled:opacity-50">
                                    {isAssigningContact ? t('contacts.assigning') : t('share.add_to_project')}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <UpgradeRequiredModal
                isOpen={showExportUpgrade}
                onClose={() => setShowExportUpgrade(false)}
                feature="exports"
            />
        </>
    );
}

export default ContactsView;
