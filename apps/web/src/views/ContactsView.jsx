import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { ROUTE_PATHS } from '../config/routes';
import { useToast } from '../context/ToastContext';
import AddContactModal from '../components/AddContactModal';
import ContactCard from '../components/ContactCard';
import ConfirmDialog from '../components/ConfirmDialog';
import { logContactCreated, logContactUpdated } from '../utils/activityLogger';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import UpgradeRequiredModal from '../components/UpgradeRequiredModal';

function ContactsView({ embedded = false, defaultProjectFilter = null }) {
    const navigate = useNavigate();
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
    const roleOptions = ['All Roles', 'Estimator', 'Foreman', 'Technician'];
    const availabilityOptions = [
        { label: 'Any Availability', value: 'Any Availability' },
        { label: 'Available Now', value: 'Available' },
        { label: 'On Site', value: 'Busy' }
    ];
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
                addToast('Error updating contact: ' + error.message, 'error');
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
                            ? 'Saved. They can receive task emails once assigned to a project.'
                            : 'Saved. Add an email address if you want automated task reminders for this trade partner.',
                        'success',
                    );
                } else {
                    addToast('Contact updated successfully!', 'success');
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
                addToast('Error creating contact: ' + error.message, 'error');
            } else {
                if (contactData.type === 'Subcontractor') {
                    const hasEmail = contactData.email && String(contactData.email).includes('@');
                    addToast(
                        hasEmail
                            ? 'Saved. They can receive task emails once assigned to a project.'
                            : 'Saved. Add an email address if you want automated task reminders for this trade partner.',
                        'success',
                    );
                } else {
                    addToast('Contact created successfully!', 'success');
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
            addToast('Error deleting contact: ' + error.message, 'error');
        } else {
            addToast('Contact deleted successfully!', 'success');
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
                        
                        addToast(`Found ${contacts.length} contacts to import`, 'info');
                        // Here you would typically show a preview modal before importing
                        
                    } catch (error) {
                        addToast('Error parsing CSV file', 'error');
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
        
        addToast('Contacts exported successfully!', 'success');
        setShowExportModal(false);
    };

    const handleAssignToProject = (contact) => {
        if (projects.length === 0) {
            addToast('No projects available to assign', 'warning');
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
            addToast('Contact is already assigned to that project', 'info');
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
                addToast('Error assigning contact: ' + error.message, 'error');
            } else {
                dispatch({ 
                    type: 'ADD_PROJECT_CONTACT', 
                    payload: { project_id: selectedAssignProject, contact_id: assignContact.id } 
                });
                addToast(`${assignContact.name} assigned to project`, 'success');
                closeAssignModal();
            }
        } catch (error) {
            addToast('Error assigning contact: ' + error.message, 'error');
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
                addToast('Error deactivating contact: ' + error.message, 'error');
            } else if (data) {
                dispatch({ type: 'UPDATE_CONTACT', payload: data });
                addToast(`${contact.name} deactivated`, 'success');
            }
        } catch (error) {
            addToast('Error deactivating contact: ' + error.message, 'error');
        }
    };

    const handleMessageContact = (contact) => {
        if (!contact) return;
        const firstProjectId = contact.project_contacts?.[0]?.project_id;
        if (firstProjectId) {
            dispatch({ type: 'SET_PROJECT', payload: firstProjectId });
            dispatch({ type: 'SET_VIEW', payload: 'Projects' });
            navigate(ROUTE_PATHS.projectStream.replace(':id', firstProjectId));
            return;
        }
        addToast('Assign this contact to a project first to open the project stream.', 'info');
    };

    return (
        <>
            <header className={`flex items-center justify-between ${embedded ? 'mb-4' : 'mb-6'}`}>
                <div>
                    <h1 className={`${embedded ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900`}>
                        {embedded ? 'Directory' : 'Contacts'}
                    </h1>
                    <p className="text-gray-500">
                        {embedded
                            ? 'Manage your team members, trade partners, and project assignments'
                            : 'Manage your team members and trade partners'}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowImportModal(true)} 
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Import
                    </button>
                    <button 
                        onClick={() => setShowExportModal(true)} 
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Export
                    </button>
                    <button 
                        onClick={() => setShowAddModal(true)} 
                        data-onboarding="add-contact-btn"
                        className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-xs hover:bg-blue-700 transition-colors"
                    >
                        + Add Contact
                    </button>
                </div>
            </header>

            {/* Search and Filter */}
            <div className="mb-4 flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search contacts..."
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
                        <option value="All">All Status</option>
                        <option value="Available">Available</option>
                        <option value="Busy">Busy</option>
                        <option value="Offline">Offline</option>
                    </select>
                </div>
            </div>

            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Role</label>
                    <select
                        value={roleFilter}
                        onChange={e => setRoleFilter(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {roleOptions.map(role => (
                            <option key={role} value={role}>{role}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Project</label>
                    <select
                        value={projectFilter}
                        onChange={e => setProjectFilter(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="All Projects">All Projects</option>
                        {projects.map(project => (
                            <option key={project.id} value={String(project.id)}>{project.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Availability</label>
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
                <button 
                    onClick={() => setActiveTab('Team')} 
                    className={`px-4 py-2 text-sm font-semibold ${activeTab === 'Team' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                >
                    Team ({teamMembers.length})
                </button>
                <button 
                    onClick={() => setActiveTab('Subcontractors')} 
                    className={`px-4 py-2 text-sm font-semibold ${activeTab === 'Subcontractors' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                >
                    Trade Partners ({subcontractors.length})
                </button>
            </div>
            
            {activeTab === 'Team' ? (
                <div className="p-6 bg-white rounded-xl shadow-xs border border-gray-200" data-onboarding="contacts-list">
                    <h2 className="text-xl font-bold mb-4">
                        Team Members ({filteredContacts.length})
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
                                ? 'No contacts match your search criteria' 
                                : 'No team members found'
                            }
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-6 bg-white rounded-xl shadow-xs border border-gray-200" data-onboarding="contacts-list">
                    <h2 className="text-xl font-bold mb-4">
                        All Trade Partners ({filteredContacts.length})
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
                                ? 'No contacts match your search criteria' 
                                : 'No trade partners found'
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
                    title="Delete Contact"
                    message={`Are you sure you want to delete "${contactToDelete?.name}"? This action cannot be undone.`}
                    confirmText="Delete"
                    confirmClass="bg-red-600 hover:bg-red-700"
                    isLoading={isDeletingContact}
                />
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-6">Import Contacts</h2>
                        <p className="text-gray-600 mb-6">
                            Import contacts from a CSV file. The file should have columns: Name, Role, Type, Company, Trade, Email, Phone, Status
                        </p>
                        <div className="flex justify-end gap-4">
                            <button 
                                onClick={() => setShowImportModal(false)}
                                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleImportContacts}
                                className="px-6 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Choose File
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-6">Export Contacts</h2>
                        <p className="text-gray-600 mb-6">
                            Export {activeTab.toLowerCase()} contacts as a CSV file.
                        </p>
                        <div className="flex justify-end gap-4">
                            <button 
                                onClick={() => setShowExportModal(false)}
                                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleExportContacts}
                                className="px-6 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                            >
                                Export
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
                            <h2 className="text-2xl font-bold mb-2">Assign to Project</h2>
                            <p className="text-gray-600 text-sm mb-4">
                                Manage project assignments for <span className="font-semibold">{assignContact.name}</span>.
                            </p>
                            
                            {/* Show currently assigned projects */}
                            {assignedProjects.length > 0 && (
                                <div className="mb-6">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Currently Assigned ({assignedProjects.length})
                                    </label>
                                    <div className="space-y-2">
                                        {assignedProjects.map(project => (
                                            <div
                                                key={project.id}
                                                className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg"
                                            >
                                                <span className="text-sm font-medium text-blue-900">{project.name}</span>
                                                <span className="text-xs text-blue-600 font-semibold">Assigned</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* Select new project to assign */}
                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    {assignedProjects.length > 0 ? 'Assign to Another Project' : 'Select Project'}
                                </label>
                                <select
                                    value={selectedAssignProject}
                                    onChange={e => setSelectedAssignProject(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                    disabled={projects.length === 0 || unassignedProjects.length === 0}
                                >
                                    <option value="" disabled>
                                        {unassignedProjects.length === 0 
                                            ? 'All projects assigned' 
                                            : 'Select a project'}
                                    </option>
                                    {unassignedProjects.map(project => (
                                        <option key={project.id} value={String(project.id)}>
                                            {project.name}
                                        </option>
                                    ))}
                                </select>
                                {unassignedProjects.length === 0 && assignedProjects.length > 0 && (
                                    <p className="text-sm text-gray-500 mt-2">
                                        This contact is already assigned to all available projects.
                                    </p>
                                )}
                                {assignContact && projects.length === 0 && (
                                    <p className="text-sm text-amber-600 mt-2">Create a project to use this action.</p>
                                )}
                            </div>
                            
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={closeAssignModal}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={handleConfirmAssign}
                                    disabled={isAssigningContact || !selectedAssignProject || unassignedProjects.length === 0}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                                >
                                    {isAssigningContact ? 'Assigning...' : 'Assign'}
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
