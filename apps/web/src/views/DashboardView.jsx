import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ProjectCard from '../components/ProjectCard';
import ProjectModal from '../components/ProjectModal';
import CreateFromTemplateModal from '../components/CreateFromTemplateModal';
import MyDaySidebar from '../components/MyDaySidebar';
import ConfirmDialog from '../components/ConfirmDialog';
import DashboardStats from '../components/DashboardStats';
import ProgressReportModal from '../components/ProgressReportModal';
import MsProjectImportModal from '../components/MsProjectImportModal';
import ViewSwitcher from '../components/ViewSwitcher';
import ProjectBoardView from '../components/ProjectBoardView';
import ProjectListView from '../components/ProjectListView';
import PermissionGuard from '../components/PermissionGuard';
import ProjectLimitReachedModal from '../components/ProjectLimitReachedModal';
import { useProjectShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  canCreateProject,
  isPersonalWorkspace,
  isProjectLimitError,
} from '@siteweave/core-logic';

function DashboardView() {
    const navigate = useNavigate();
    const { state, dispatch } = useAppContext();
    const { addToast } = useToast();
    const [showModal, setShowModal] = useState(false);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [isUpdatingProject, setIsUpdatingProject] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState(null);
    const [viewType, setViewType] = useState('card'); // 'card', 'list', or 'board'
    const [showCreateFromTemplateModal, setShowCreateFromTemplateModal] = useState(false);
    const [showProgressReportModal, setShowProgressReportModal] = useState(false);
    const [showMsProjectImportModal, setShowMsProjectImportModal] = useState(false);
    const [showProjectLimitModal, setShowProjectLimitModal] = useState(false);

    const isGuestOnly = state.isProjectCollaborator && !state.currentOrganization;

    const guardCanCreateProject = async () => {
        if (isGuestOnly) return false;
        if (!state.currentOrganization) return true;
        if (isPersonalWorkspace(state.currentOrganization)) {
            const allowed = await canCreateProject(supabaseClient, state.currentOrganization.id, {
                accountIntent: state.accountIntent,
                isGuestCollaborator: isGuestOnly,
            });
            if (!allowed) {
                setShowProjectLimitModal(true);
                return false;
            }
        }
        return true;
    };

    const tryOpenCreateProject = async () => {
        if (!(await guardCanCreateProject())) return;
        setShowModal(true);
    };

    const tryOpenTemplateModal = async () => {
        if (!(await guardCanCreateProject())) return;
        setShowCreateFromTemplateModal(true);
    };

    const tryOpenMsImportModal = async () => {
        if (!(await guardCanCreateProject())) return;
        setShowMsProjectImportModal(true);
    };

    // Keyboard shortcuts
    useProjectShortcuts({
        createProject: () => { tryOpenCreateProject(); },
        goToDashboard: () => dispatch({ type: 'SET_VIEW', payload: 'Dashboard' })
    });

    const handleSaveProject = async (projectData) => {
        if (editingProject) {
            setIsUpdatingProject(true);
            // Remove selectedContacts and emailAddresses from projectData as they're not columns in the projects table
            const { selectedContacts, emailAddresses, ...projectFields } = projectData;
            const projectDataWithAudit = {
                ...projectFields,
                updated_by_user_id: state.user.id,
                updated_at: new Date().toISOString()
            };
            const { data: updatedProject, error } = await supabaseClient
                .from('projects')
                .update(projectDataWithAudit)
                .eq('id', editingProject.id)
                .select()
                .single();
            if (error) {
                addToast('Error updating project: ' + error.message, 'error');
            } else {
                // Update project contacts if selectedContacts or emailAddresses is provided
                if (selectedContacts !== undefined || projectData.emailAddresses) {
                    // First, remove all existing project contacts
                    const { error: deleteError } = await supabaseClient
                        .from('project_contacts')
                        .delete()
                        .eq('project_id', editingProject.id);
                    
                    if (deleteError) {
                        console.error('Error removing existing contacts:', deleteError);
                        addToast('Project updated, but contacts could not be updated', 'warning');
                    } else {
                        // Handle email addresses - create contacts for emails that don't exist
                        const emailAddresses = projectData.emailAddresses || [];
                        const contactsToAdd = [...(selectedContacts || [])];
                        
                        if (emailAddresses.length > 0) {
                            for (const email of emailAddresses) {
                                try {
                                    // Check if contact already exists
                                    const { data: existingContact } = await supabaseClient
                                        .from('contacts')
                                        .select('id')
                                        .ilike('email', email)
                                        .maybeSingle();
                                    
                                    if (existingContact) {
                                        // Contact exists, add to list
                                        contactsToAdd.push(existingContact.id);
                                    } else {
                                        // Create new contact
                                        const { data: newContact, error: contactError } = await supabaseClient
                                            .from('contacts')
                                            .insert({
                                                name: email.split('@')[0], // Use email prefix as name
                                                email: email,
                                                type: 'Team',
                                                role: 'Team Member',
                                                status: 'Available'
                                            })
                                            .select()
                                            .single();
                                        
                                        if (contactError) {
                                            console.error(`Error creating contact for ${email}:`, contactError);
                                            addToast(`Could not create contact for ${email}`, 'warning');
                                        } else {
                                            contactsToAdd.push(newContact.id);
                                            // Refresh contacts in context
                                            dispatch({ type: 'ADD_CONTACT', payload: newContact });
                                        }
                                    }
                                } catch (error) {
                                    console.error(`Error processing email ${email}:`, error);
                                    addToast(`Error processing ${email}`, 'warning');
                                }
                            }
                        }
                        
                        // Then add the new selected contacts
                        if (contactsToAdd.length > 0) {
                            const projectContactsData = contactsToAdd.map(contactId => ({
                                project_id: editingProject.id,
                                contact_id: contactId,
                                organization_id: editingProject.organization_id || state.currentOrganization?.id
                            }));
                            const { error: contactsError } = await supabaseClient
                                .from('project_contacts')
                                .upsert(projectContactsData, {
                                    onConflict: 'project_id,contact_id',
                                    ignoreDuplicates: true
                                });
                            if (contactsError && contactsError.code !== '23505') {
                                console.error('Error adding contacts to project:', contactsError);
                                addToast('Project updated, but some contacts could not be added', 'warning');
                            }
                        }
                    }
                }
                dispatch({ type: 'UPDATE_PROJECT', payload: updatedProject });
                addToast('Project updated successfully!', 'success');
                setShowModal(false);
                setEditingProject(null);
            }
            setIsUpdatingProject(false);
        } else {
            setIsCreatingProject(true);
            // Remove selectedContacts and emailAddresses from projectData as they're not columns in the projects table
            const { selectedContacts, emailAddresses, ...projectFields } = projectData;
            
            // Ensure organization_id is included for multi-tenant RLS
            if (!state.currentOrganization?.id) {
                addToast('Error: No organization found. Please contact support.', 'error');
                setIsCreatingProject(false);
                return;
            }
            
            const projectDataWithAudit = {
                ...projectFields,
                organization_id: state.currentOrganization.id,
                project_manager_id: state.user.id,
                created_by_user_id: state.user.id,
                updated_by_user_id: state.user.id,
                updated_at: new Date().toISOString()
            };
            console.log('Creating project with data:', projectDataWithAudit);
            const { data: createdProject, error } = await supabaseClient
                .from('projects')
                .insert(projectDataWithAudit)
                .select()
                .single();
            if (error) {
                console.error('Project creation error:', error);
                if (isProjectLimitError(error)) {
                    setShowProjectLimitModal(true);
                } else {
                    addToast('Error creating project: ' + error.message, 'error');
                }
            } else {
                // Handle email addresses - create contacts for emails that don't exist
                const emailAddresses = projectData.emailAddresses || [];
                const contactsToAdd = [...(selectedContacts || [])];
                
                if (emailAddresses.length > 0) {
                    for (const email of emailAddresses) {
                        try {
                            // Check if contact already exists
                            const { data: existingContact } = await supabaseClient
                                .from('contacts')
                                .select('id')
                                .ilike('email', email)
                                .maybeSingle();
                            
                            if (existingContact) {
                                // Contact exists, add to list
                                contactsToAdd.push(existingContact.id);
                            } else {
                                // Create new contact
                                const { data: newContact, error: contactError } = await supabaseClient
                                    .from('contacts')
                                    .insert({
                                        name: email.split('@')[0], // Use email prefix as name
                                        email: email,
                                        type: 'Team',
                                        role: 'Team Member',
                                        status: 'Available',
                                        organization_id: state.currentOrganization?.id,
                                        created_by_user_id: state.user.id
                                    })
                                    .select()
                                    .single();
                                
                                if (contactError) {
                                    console.error(`Error creating contact for ${email}:`, contactError);
                                    addToast(`Could not create contact for ${email}`, 'warning');
                                } else {
                                    contactsToAdd.push(newContact.id);
                                    // Refresh contacts in context
                                    dispatch({ type: 'ADD_CONTACT', payload: newContact });
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing email ${email}:`, error);
                            addToast(`Error processing ${email}`, 'warning');
                        }
                    }
                }
                
                // Always ensure the creator is added to project_contacts
                // This ensures they can see and access the project they created
                let creatorContactId = null;
                
                // First, try to get existing contact_id from profile
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('contact_id')
                    .eq('id', state.user.id)
                    .single();
                
                creatorContactId = profile?.contact_id;
                
                // If no contact_id exists, create a contact for the creator
                if (!creatorContactId && state.user.email) {
                    console.log('Creator has no contact_id, creating contact for:', state.user.email);
                    const { data: newCreatorContact, error: creatorContactError } = await supabaseClient
                        .from('contacts')
                        .insert({
                            name: state.user.user_metadata?.full_name || state.user.email.split('@')[0] || 'User',
                            email: state.user.email,
                            type: 'Team',
                            role: 'Team Member',
                            status: 'Available',
                            organization_id: state.currentOrganization?.id,
                            created_by_user_id: state.user.id
                        })
                        .select('id')
                        .single();
                    
                    if (!creatorContactError && newCreatorContact) {
                        creatorContactId = newCreatorContact.id;
                        console.log('Created contact for creator:', creatorContactId);
                        
                        // Link the contact to the profile
                        await supabaseClient
                            .from('profiles')
                            .update({ contact_id: creatorContactId })
                            .eq('id', state.user.id);
                        
                        // Refresh contacts in context
                        dispatch({ type: 'ADD_CONTACT', payload: newCreatorContact });
                    } else {
                        console.error('Error creating contact for creator:', creatorContactError);
                    }
                }
                
                // Add creator to contacts list if we have a contact_id
                if (creatorContactId && !contactsToAdd.includes(creatorContactId)) {
                    contactsToAdd.push(creatorContactId);
                    console.log('Adding creator to project_contacts:', creatorContactId);
                } else if (!creatorContactId) {
                    console.error('CRITICAL: Could not create or find contact for project creator. Project may not be visible.');
                    addToast('Warning: Could not automatically add you to the project. Please contact support.', 'warning');
                }
                
                // Add all contacts (existing + newly created + creator) to the project
                // Insert contacts one at a time to handle RLS policy checks properly
                if (contactsToAdd.length > 0) {
                    const insertedContactIds = [];
                    const failedContacts = [];
                    
                    for (const contactId of contactsToAdd) {
                        try {
                            const { error: contactError } = await supabaseClient
                                .from('project_contacts')
                                .upsert({
                                    project_id: createdProject.id,
                                    contact_id: contactId,
                                    organization_id: state.currentOrganization?.id
                                }, { 
                                    onConflict: 'project_id,contact_id',
                                    ignoreDuplicates: true 
                                });
                            
                            // Ignore duplicate errors (23505) and empty result errors (PGRST116)
                            if (contactError && contactError.code !== '23505' && contactError.code !== 'PGRST116') {
                                console.error(`Error adding contact ${contactId} to project:`, contactError);
                                failedContacts.push(contactId);
                            } else {
                                insertedContactIds.push(contactId);
                                dispatch({ 
                                    type: 'ADD_PROJECT_CONTACT', 
                                    payload: { project_id: createdProject.id, contact_id: contactId } 
                                });
                            }
                        } catch (error) {
                            console.error(`Error adding contact ${contactId} to project:`, error);
                            failedContacts.push(contactId);
                        }
                    }
                    
                    if (failedContacts.length > 0) {
                        console.warn('Some contacts could not be added:', failedContacts);
                        if (insertedContactIds.length === 0) {
                            addToast('Project created, but contacts could not be added. You may need to add them manually.', 'warning');
                        } else {
                            addToast(`Project created. ${failedContacts.length} contact(s) could not be added automatically.`, 'warning');
                        }
                    } else {
                        console.log('Successfully added all contacts to project:', insertedContactIds);
                    }
                } else {
                    console.warn('No contacts to add to project - project may not be visible after reload');
                }
                dispatch({ type: 'ADD_PROJECT', payload: createdProject });
                addToast('Project created successfully!', 'success');
                setShowModal(false);
            }
            setIsCreatingProject(false);
        }
    };

    const handleEditProject = (project) => {
        setEditingProject(project);
        setShowModal(true);
    };

    const handleDeleteProject = (project) => {
        setProjectToDelete(project);
        setShowDeleteConfirm(true);
    };

    const confirmDeleteProject = async () => {
        if (projectToDelete) {
            const { error } = await supabaseClient.from('projects').delete().eq('id', projectToDelete.id);
            if (error) {
                addToast('Error deleting project: ' + error.message, 'error');
            } else {
                dispatch({ type: 'DELETE_PROJECT', payload: projectToDelete.id });
                addToast('Project deleted successfully!', 'success');
            }
        }
        setShowDeleteConfirm(false);
        setProjectToDelete(null);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingProject(null);
    };

    const handleProjectClick = (project) => {
        dispatch({ type: 'SET_PROJECT', payload: project.id });
        dispatch({ type: 'SET_VIEW', payload: 'Projects' });
        navigate(`/projects/${project.id}/tasks`);
    };

    return (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full">
                <div className="xl:col-span-3">
                    <header className="mb-8 app-card p-5" data-onboarding="dashboard-welcome">
                        <div className="flex min-w-0 items-center gap-4">
                            <div className="min-w-0 shrink">
                                <h1 className="app-section-title mb-0.5 text-2xl sm:text-[1.75rem]">
                                    {isGuestOnly ? 'Your projects' : 'Project Dashboard'}
                                </h1>
                                <p className="app-section-subtitle truncate">
                                    {isGuestOnly ? 'Projects shared with you' : 'Manage your construction projects'}
                                </p>
                            </div>
                            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                <ViewSwitcher compact currentView={viewType} onViewChange={setViewType} />
                                <PermissionGuard permission="can_create_projects">
                                    <button
                                        onClick={() => tryOpenCreateProject()}
                                        data-onboarding="new-project-btn"
                                        className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xs btn-smooth app-action-primary"
                                    >
                                        + New Project
                                    </button>
                                    <button
                                        onClick={() => tryOpenTemplateModal()}
                                        title="Create from template"
                                        className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xs btn-smooth app-action-secondary"
                                    >
                                        Template
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => tryOpenMsImportModal()}
                                        title="Import MS Project XML"
                                        className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xs btn-smooth bg-slate-700 text-white hover:bg-slate-800"
                                    >
                                        Import XML
                                    </button>
                                </PermissionGuard>
                                <PermissionGuard permission="can_manage_org_progress_reports">
                                    <button
                                        type="button"
                                        onClick={() => setShowProgressReportModal(true)}
                                        title="Organization progress reports"
                                        className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xs btn-smooth bg-emerald-600 text-white hover:bg-emerald-700"
                                    >
                                        Org reports
                                    </button>
                                </PermissionGuard>
                            </div>
                        </div>
                    </header>
                    
                    {/* Dashboard Statistics */}
                    <DashboardStats />
                    
                    {/* Project Views */}
                    {state.projects.length > 0 ? (
                        <div data-onboarding="project-grid">
                            {viewType === 'card' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {state.projects.map(p => (
                                        <div key={p.id} data-onboarding="project-cards">
                                            <ProjectCard 
                                                project={p} 
                                                onEdit={handleEditProject}
                                                onDelete={handleDeleteProject}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {viewType === 'list' && (
                                <ProjectListView
                                    projects={state.projects}
                                    onEdit={handleEditProject}
                                    onDelete={handleDeleteProject}
                                    onProjectClick={handleProjectClick}
                                />
                            )}
                            {viewType === 'board' && (
                                <ProjectBoardView
                                    projects={state.projects}
                                    onEdit={handleEditProject}
                                    onDelete={handleDeleteProject}
                                    onProjectClick={handleProjectClick}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 px-6 text-center app-card">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-5">
                                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                {isGuestOnly ? 'No projects shared yet' : 'No projects yet'}
                            </h3>
                            <p className="text-gray-500 mb-6 max-w-md text-sm leading-relaxed">
                                {isGuestOnly
                                    ? 'Ask your contractor to send you a project invite link or code. You can sign in with any email.'
                                    : 'Get started by creating your first construction project. Track progress, manage tasks, and collaborate with your team.'}
                            </p>
                            {!isGuestOnly && (
                            <button 
                                onClick={() => tryOpenCreateProject()}
                                className="px-6 py-3 rounded-lg transition-colors font-medium text-sm app-action-primary"
                            >
                                Create Your First Project
                            </button>
                            )}
                        </div>
                    )}
                </div>
                <aside 
                    data-onboarding="my-day-sidebar"
                    className="app-card p-5 h-fit"
                >
                    <MyDaySidebar />
                </aside>
            </div>
            {showCreateFromTemplateModal && (
                <CreateFromTemplateModal onClose={() => setShowCreateFromTemplateModal(false)} />
            )}
            {showProgressReportModal && (
                <ProgressReportModal onClose={() => setShowProgressReportModal(false)} />
            )}
            {showMsProjectImportModal && (
                <MsProjectImportModal
                    context="newProject"
                    onClose={() => setShowMsProjectImportModal(false)}
                    onSuccess={() => setShowMsProjectImportModal(false)}
                />
            )}
            {showModal && (
                <ProjectModal 
                    onClose={handleCloseModal} 
                    onSave={handleSaveProject} 
                    isLoading={isCreatingProject || isUpdatingProject}
                    project={editingProject}
                />
            )}
            <ProjectLimitReachedModal
                isOpen={showProjectLimitModal}
                onClose={() => setShowProjectLimitModal(false)}
            />
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDeleteProject}
                title="Delete Project"
                message={`Are you sure you want to delete "${projectToDelete?.name}"? This will also delete all associated tasks, files, stream posts, and task comments. This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
            />
        </>
    );
}

export default DashboardView;