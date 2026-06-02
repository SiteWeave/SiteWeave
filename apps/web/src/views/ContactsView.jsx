import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import AddContactModal from '../components/AddContactModal';
import ContactCard from '../components/ContactCard';
import ConfirmDialog from '../components/ConfirmDialog';
import { logContactCreated, logContactUpdated } from '../utils/activityLogger';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import UpgradeRequiredModal from '../components/UpgradeRequiredModal';

function ContactsView({ embedded = false, defaultProjectFilter = null }) {
    const { t } = useTranslation();
    const { state, dispatch } = useAppContext();
    const { addToast } = useToast();
    const { canExport } = useWorkspaceTier();
    const [showExportUpgrade, setShowExportUpgrade] = useState(false);
    const [activeTab, setActiveTab] = useState('Team');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingContact, setEditingContact] = useState(null);
    const [isCreatingContact, setIsCreatingContact] = useState(false);
    const [isUpdatingContact, setIsUpdatingContact] = useState(false);
    const [isDeletingContact, setIsDeletingContact] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [contactToDelete, setContactToDelete] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const roleOptions = useMemo(() => [
        { value: 'All Roles', label: t('contacts.all_roles') },
        { value: 'Estimator', label: t('contacts.role_estimator') },
        { value: 'Foreman', label: t('contacts.role_foreman') },
        { value: 'Technician', label: t('contacts.role_technician') },
    ], [t]);
    const availabilityOptions = useMemo(() => [
        { value: 'Any Availability', label: t('contacts.any_availability') },
        { value: 'Available', label: t('contacts.available_now') },
        { value: 'Busy', label: t('contacts.on_site') },
    ], [t]);
    const [roleFilter, setRoleFilter] = useState('All Roles');
    const [projectFilter, setProjectFilter] = useState('All Projects');
    const [availabilityFilter, setAvailabilityFilter] = useState('Any Availability');
    const [showImportModal, setShowImportModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignContact, setAssignContact] = useState(null);
    const [selectedAssignProject, setSelectedAssignProject] = useState('');
    const [isAssigningContact, setIsAssigningContact] = useState(false);

    // Listen for tour navigation to switch to Subcontractors tab
    useEffect(() => {
        const handleSwitchToSubcontractors = () => {
            setActiveTab('Subcontractors');
        };
        
        window.addEventListener('switchToSubcontractorsTab', handleSwitchToSubcontractors);
        
        return () => {
            window.removeEventListener('switchToSubcontractorsTab', handleSwitchToSubcontractors);
        };
    }, []);

    useEffect(() => {
        if (defaultProjectFilter) {
            setProjectFilter(String(defaultProjectFilter));
        } else if (embedded) {
            setProjectFilter('All Projects');
        }
    }, [defaultProjectFilter, embedded]);

    const contacts = state.contacts || [];
    const projects = state.projects || [];

    const teamMembers = contacts.filter(c => c.type === 'Team');
    const subcontractors = contacts.filter(c => c.type === 'Subcontractor');

    // Filter contacts based on search and status
    const filteredContacts = useMemo(() => {
        let contacts = activeTab === 'Team' ? teamMembers : subcontractors;
        
        if (searchTerm) {
            contacts = contacts.filter(contact => 
                contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contact.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (contact.company && contact.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        
        if (statusFilter !== 'All') {
            contacts = contacts.filter(contact => contact.status === statusFilter);
        }

        if (roleFilter !== 'All Roles') {
            contacts = contacts.filter(contact => 
                contact.role?.toLowerCase().includes(roleFilter.toLowerCase())
            );
        }

        if (projectFilter !== 'All Projects') {
            contacts = contacts.filter(contact =>
                Array.isArray(contact.project_contacts) && 
                contact.project_contacts.some(pc => String(pc.project_id) === projectFilter)
            );
        }

        if (availabilityFilter !== 'Any Availability') {
            contacts = contacts.filter(contact => contact.status === availabilityFilter);
        }
        
        return contacts;
    }, [activeTab, teamMembers, subcontractors, searchTerm, statusFilter, roleFilter, projectFilter, availabilityFilter]);

    const handleSaveContact = async (contactData) => {
        if (editingContact) {
            setIsUpdatingContact(true);
            const { error } = await supabaseClient
                .from('contacts')
                .update(contactData)
                .eq('id', contactData.id);
            
            if (error) {
                addToast(t('contacts.update_error', { message: error.message }), 'error');
            } else {
                const trackKeys = ['name', 'role', 'type', 'company', 'trade', 'email', 'phone', 'status'];
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
                        changes
                    );
                }
                if (contactData.type === 'Subcontractor') {
                    const hasEmail = contactData.email && String(contactData.email).includes('@');
                    addToast(
                        hasEmail
                            ? t('contacts.saved_with_email')
                            : t('contacts.saved_add_email'),
                        'success',
                    );
                } else {
                    addToast(t('contacts.updated_success'), 'success');
                }
                dispatch({ type: 'UPDATE_CONTACT', payload: contactData });
                setShowAddModal(false);
                setEditingContact(null);
            }
            setIsUpdatingContact(false);
        } else {
            setIsCreatingContact(true);
            const contactDataWithAudit = {
                ...contactData,
                created_by_user_id: state.user?.id,
                organization_id: state.currentOrganization?.id
            };
            const { data, error } = await supabaseClient
                .from('contacts')
                .insert(contactDataWithAudit)
                .select('*, project_contacts!fk_project_contacts_contact_id(project_id)')
                .single();
            
            if (error) {
                addToast(t('contacts.create_error', { message: error.message }), 'error');
            } else {
                if (contactData.type === 'Subcontractor') {
                    const hasEmail = contactData.email && String(contactData.email).includes('@');
                    addToast(
                        hasEmail
                            ? t('contacts.saved_with_email')
                            : t('contacts.saved_add_email'),
                        'success',
                    );
                } else {
                    addToast(t('contacts.created_success'), 'success');
                }
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
        // Create file input for CSV import
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const csv = e.target.result;
                        const lines = csv.split('\n');
                        const headers = lines[0].split(',');
                        
                        // Basic CSV parsing (would need more robust parsing in production)
                        const contacts = lines.slice(1).map(line => {
                            const values = line.split(',');
                            const contact = {};
                            headers.forEach((header, index) => {
                                contact[header.trim().toLowerCase().replace(' ', '_')] = values[index]?.trim();
                            });
                            return contact;
                        }).filter(contact => contact.name); // Filter out empty rows
                        
                        addToast(t('contacts.import_found', { count: contacts.length }), 'info');
                        // Here you would typically show a preview modal before importing
                        
                    } catch (error) {
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
        const contacts = activeTab === 'Team' ? teamMembers : subcontractors;
        const csvContent = [
            'Name,Role,Type,Company,Trade,Email,Phone,Status',
            ...contacts.map(contact => 
                `"${contact.name}","${contact.role}","${contact.type}","${contact.company || ''}","${contact.trade || ''}","${contact.email || ''}","${contact.phone || ''}","${contact.status}"`
            )
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${activeTab.toLowerCase()}_contacts.csv`;
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
        setShowAssignModal(true);
    };

    const closeAssignModal = () => {
        setShowAssignModal(false);
        setAssignContact(null);
        setSelectedAssignProject('');
        setIsAssigningContact(false);
    };

    const handleConfirmAssign = async () => {
        if (!assignContact || !selectedAssignProject) {
            return;
        }

        if (assignContact.project_contacts?.some(pc => String(pc.project_id) === selectedAssignProject)) {
            addToast(t('contacts.already_assigned_project'), 'info');
            return;
        }

        setIsAssigningContact(true);
        try {
            // project_id is a UUID, not an integer, so use it directly as a string
            const { error } = await supabaseClient
                .from('project_contacts')
                .upsert({
                    project_id: selectedAssignProject,
                    contact_id: assignContact.id,
                    organization_id: state.currentOrganization?.id
                }, {
                    onConflict: 'project_id,contact_id',
                    ignoreDuplicates: true
                });

            if (error && error.code !== '23505') {
                addToast(t('contacts.assign_error', { message: error.message }), 'error');
            } else {
                dispatch({ 
                    type: 'ADD_PROJECT_CONTACT', 
                    payload: { project_id: selectedAssignProject, contact_id: assignContact.id } 
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

    const handleDeactivateContact = async (contact) => {
        try {
            const { data, error } = await supabaseClient
                .from('contacts')
                .update({ status: 'Inactive' })
                .eq('id', contact.id)
                .select()
                .single();

            if (error) {
                addToast(t('contacts.deactivate_error', { message: error.message }), 'error');
            } else if (data) {
                dispatch({ type: 'UPDATE_CONTACT', payload: data });
                addToast(t('contacts.deactivated', { name: contact.name }), 'success');
            }
        } catch (error) {
            addToast(t('contacts.deactivate_error', { message: error.message }), 'error');
        }
    };

    const handleMessageContact = (contact) => {
        if (!contact) return;
        const firstProjectId = contact.project_contacts?.[0]?.project_id;
        if (firstProjectId) {
            dispatch({ type: 'SET_PROJECT', payload: firstProjectId });
            dispatch({ type: 'SET_VIEW', payload: 'Projects' });
            return;
        }
        addToast(t('contacts.message_assign_first'), 'info');
    };

    return (
        <>
            <header className={`flex items-center justify-between ${embedded ? 'mb-4' : 'mb-6'}`}>
                <div>
                    <h1 className={`${embedded ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900`}>
                        {embedded ? t('contacts.directory_title') : t('contacts.title')}
                    </h1>
                    <p className="text-gray-500">
                        {embedded ? t('contacts.subtitle_embedded') : t('contacts.subtitle')}
                    </p>
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
                        {t('contacts.add_contact')}
                    </button>
                </div>
            </header>

            {/* Search and Filter */}
            <div className="mb-4 flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder={t('contacts.search_placeholder')}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <div className="sm:w-48">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="All">{t('contacts.filter_all_status')}</option>
                        <option value="Available">{t('contacts.status_available')}</option>
                        <option value="Busy">{t('contacts.status_busy')}</option>
                        <option value="Offline">{t('contacts.status_offline')}</option>
                    </select>
                </div>
            </div>

            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">{t('contacts.filter_role')}</label>
                    <select
                        value={roleFilter}
                        onChange={e => setRoleFilter(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {roleOptions.map(role => (
                            <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                    </select>
                </div>
                <div>
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
                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">{t('contacts.filter_availability')}</label>
                    <select
                        value={availabilityFilter}
                        onChange={e => setAvailabilityFilter(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {availabilityOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex border-b border-gray-200 mb-6">
                <button type="button" 
                    onClick={() => setActiveTab('Team')} 
                    className={`px-4 py-2 text-sm font-semibold ${activeTab === 'Team' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                >
                    {t('contacts.tab_team', { count: teamMembers.length })}
                </button>
                <button type="button" 
                    onClick={() => setActiveTab('Subcontractors')} 
                    className={`px-4 py-2 text-sm font-semibold ${activeTab === 'Subcontractors' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                >
                    {t('contacts.tab_trade_partners', { count: subcontractors.length })}
                </button>
            </div>
            
            {activeTab === 'Team' ? (
                <div className="p-6 bg-white rounded-xl shadow-xs border border-gray-200" data-onboarding="contacts-list">
                    <h2 className="text-xl font-bold mb-4">
                        {t('contacts.team_members_heading', { count: filteredContacts.length })}
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
                                onDeactivate={handleDeactivateContact}
                                onMessage={handleMessageContact}
                            />
                        ))}
                    </ul>
                    {filteredContacts.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            {searchTerm || statusFilter !== 'All' 
                                ? t('contacts.no_match') 
                                : t('contacts.no_team')
                            }
                        </div>
                    )}
                </div>
            ) : (
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
                                onDeactivate={handleDeactivateContact}
                                onMessage={handleMessageContact}
                            />
                        ))}
                    </ul>
                    {filteredContacts.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            {searchTerm || statusFilter !== 'All' 
                                ? t('contacts.no_match') 
                                : t('contacts.no_trade_partners')
                            }
                        </div>
                    )}
                </div>
            )}

            {/* Contact Modal */}
            {showAddModal && (
                <AddContactModal 
                    onClose={() => {
                        setShowAddModal(false);
                        setEditingContact(null);
                    }} 
                    onSave={handleSaveContact} 
                    contact={editingContact}
                    isLoading={isCreatingContact || isUpdatingContact} 
                />
            )}

            {/* Delete Confirmation */}
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

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-6">{t('contacts.import_title')}</h2>
                        <p className="text-gray-600 mb-6">
                            {t('contacts.import_description')}
                        </p>
                        <div className="flex justify-end gap-4">
                            <button type="button" 
                                onClick={() => setShowImportModal(false)}
                                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button type="button" 
                                onClick={handleImportContacts}
                                className="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                {t('contacts.choose_file')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-6">{t('contacts.export_title')}</h2>
                        <p className="text-gray-600 mb-6">
                            {activeTab === 'Team' ? t('contacts.export_description_team') : t('contacts.export_description_trade')}
                        </p>
                        <div className="flex justify-end gap-4">
                            <button type="button" 
                                onClick={() => setShowExportModal(false)}
                                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button type="button" 
                                onClick={handleExportContacts}
                                className="px-6 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                            >
                                {t('contacts.export')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign to Project Modal */}
            {showAssignModal && assignContact && (() => {
                // Get projects the contact is already assigned to
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
                            
                            {/* Show currently assigned projects */}
                            {assignedProjects.length > 0 && (
                                <div className="mb-6">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        {t('contacts.currently_assigned', { count: assignedProjects.length })}
                                    </label>
                                    <div className="space-y-2">
                                        {assignedProjects.map(project => (
                                            <div
                                                key={project.id}
                                                className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg"
                                            >
                                                <span className="text-sm font-medium text-blue-900">{project.name}</span>
                                                <span className="text-xs text-blue-600 font-semibold">{t('contacts.assigned_badge')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* Select new project to assign */}
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
                                        <option key={project.id} value={String(project.id)}>
                                            {project.name}
                                        </option>
                                    ))}
                                </select>
                                {unassignedProjects.length === 0 && assignedProjects.length > 0 && (
                                    <p className="text-sm text-gray-500 mt-2">
                                        {t('contacts.already_all_projects')}
                                    </p>
                                )}
                                {assignContact && projects.length === 0 && (
                                    <p className="text-sm text-amber-600 mt-2">{t('contacts.create_project_hint')}</p>
                                )}
                            </div>
                            
                            <div className="flex justify-end gap-3">
                                <button type="button"
                                    onClick={closeAssignModal}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                                >
                                    {t('common.close')}
                                </button>
                                <button type="button"
                                    onClick={handleConfirmAssign}
                                    disabled={isAssigningContact || !selectedAssignProject || unassignedProjects.length === 0}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                                >
                                    {isAssigningContact ? t('contacts.assigning') : t('contacts.assign')}
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
