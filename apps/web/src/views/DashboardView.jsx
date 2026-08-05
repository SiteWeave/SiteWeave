import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAppContext, supabaseClient, useLazyDataLoader } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ProjectCard from '../components/ProjectCard';
import ProjectModal from '../components/ProjectModal';
import CreateFromTemplateModal from '../components/CreateFromTemplateModal';
import MyDaySidebar from '../components/MyDaySidebar';
import { trashProject, restoreProject } from '@siteweave/core-logic';
import ConfirmDialog from '../components/ConfirmDialog';
import DashboardStats from '../components/DashboardStats';
import ProgressReportModal from '../components/ProgressReportModal';
import MsProjectImportModal from '../components/MsProjectImportModal';
import ViewSwitcher from '../components/ViewSwitcher';
import ProjectBoardView from '../components/ProjectBoardView';
import ProjectListView from '../components/ProjectListView';
import PermissionGuard from '../components/PermissionGuard';
import ProjectLimitReachedModal from '../components/ProjectLimitReachedModal';
import UpgradeRequiredModal from '../components/UpgradeRequiredModal';
import { useProjectShortcuts } from '../hooks/useKeyboardShortcuts';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import {
  canCreateProject,
  isPersonalWorkspace,
  isProjectLimitError,
  getOrganizationBranding,
} from '@siteweave/core-logic';
import {
  ensureOrganizationForWrites,
  isOrganizationRlsError,
} from '../utils/organizationContext';
import { calculateProjectsProgressMap } from '../utils/projectHelpers';
import {
  ActivationChecklist,
  getChecklistDismissed,
  setChecklistDismissed,
  isActivationComplete,
  useOfficeActivationState,
  useBrandingPrimaryColor,
} from '@siteweave/onboarding-ui';
import { ROUTE_PATHS } from '../config/routes';
import { logProjectCreated } from '../utils/activityLogger';

const loadBrandingColor = (organizationId) =>
  getOrganizationBranding(supabaseClient, organizationId).then((b) => b?.primary_color);

function DashboardView() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { state, dispatch } = useAppContext();
    const { loadMyDayTasksIfNeeded } = useLazyDataLoader();
    const { addToast } = useToast();
    const [showModal, setShowModal] = useState(false);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [isUpdatingProject, setIsUpdatingProject] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [projectToTrash, setProjectToTrash] = useState(null);
    const [trashingProjectId, setTrashingProjectId] = useState(null);
    const [viewType, setViewType] = useState('card'); // 'card', 'list', or 'board'
    const [cardProgressMap, setCardProgressMap] = useState({});
    const [cardProgressLoading, setCardProgressLoading] = useState(false);
    const projectIdsKey = useMemo(
        () => (state.projects || []).map((p) => p.id).join(','),
        [state.projects],
    );

    useEffect(() => {
        if (viewType !== 'card' || !state.projects?.length) {
            setCardProgressMap({});
            setCardProgressLoading(false);
            return undefined;
        }

        let cancelled = false;
        setCardProgressLoading(true);

        calculateProjectsProgressMap(state.projects, supabaseClient)
            .then((map) => {
                if (!cancelled) {
                    setCardProgressMap(map);
                    setCardProgressLoading(false);
                }
            })
            .catch((error) => {
                console.error('Error loading card progress map:', error);
                if (!cancelled) setCardProgressLoading(false);
            });

        return () => { cancelled = true; };
    }, [viewType, projectIdsKey, state.projects]);

    useEffect(() => {
        if (!state.user || state.authLoading || !state.userContactId) return undefined;

        const run = () => loadMyDayTasksIfNeeded();
        if (typeof requestIdleCallback === 'function') {
            const idleId = requestIdleCallback(run, { timeout: 800 });
            return () => cancelIdleCallback(idleId);
        }
        const timerId = setTimeout(run, 150);
        return () => clearTimeout(timerId);
    }, [state.user, state.authLoading, state.userContactId, loadMyDayTasksIfNeeded]);

    const [showCreateFromTemplateModal, setShowCreateFromTemplateModal] = useState(false);
    const [showProgressReportModal, setShowProgressReportModal] = useState(false);
    const [showMsProjectImportModal, setShowMsProjectImportModal] = useState(false);
    const [showProjectLimitModal, setShowProjectLimitModal] = useState(false);
    const [showCommsUpgrade, setShowCommsUpgrade] = useState(false);
    const [checklistDismissed, setChecklistDismissedState] = useState(() =>
        state.user?.id ? getChecklistDismissed(state.user.id) : false,
    );
    const { canProgressReports } = useWorkspaceTier();

    useEffect(() => {
        if (!state.user?.id) return;
        setChecklistDismissedState(getChecklistDismissed(state.user.id));
    }, [state.user?.id]);

    const isGuestOnly = state.isProjectCollaborator && !state.currentOrganization;

    const { completed: activationCompleted, ready: activationReady } = useOfficeActivationState(
        supabaseClient,
        state.currentOrganization?.id,
        state.projects,
        state.user?.id,
    );

    const primaryColor = useBrandingPrimaryColor(loadBrandingColor, state.currentOrganization?.id);

    const isOrgAdminForChecklist =
        state.userRole?.name === 'Org Admin' ||
        state.userRole?.permissions?.can_manage_roles === true ||
        (state.currentOrganization?.created_by_user_id != null &&
            state.currentOrganization.created_by_user_id === state.user?.id);

    const showActivationChecklist =
        activationReady &&
        !isGuestOnly &&
        isOrgAdminForChecklist &&
        state.currentOrganization &&
        !checklistDismissed &&
        !isActivationComplete(activationCompleted);

    const showActivationChecklistRestore =
        activationReady &&
        !isGuestOnly &&
        isOrgAdminForChecklist &&
        state.currentOrganization &&
        checklistDismissed &&
        !isActivationComplete(activationCompleted);

    const handleChecklistDismiss = () => {
        if (state.user?.id) setChecklistDismissed(state.user.id, true);
        setChecklistDismissedState(true);
    };

    const handleChecklistShow = () => {
        if (state.user?.id) setChecklistDismissed(state.user.id, false);
        setChecklistDismissedState(false);
    };

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

    const handleChecklistAction = async (itemId) => {
        if (itemId === 'project') {
            if (state.projects?.length === 0) {
                await tryOpenTemplateModal();
            } else {
                await tryOpenCreateProject();
            }
            return;
        }
        if (itemId === 'schedule') {
            const projectId = state.projects?.[0]?.id;
            if (!projectId) {
                await tryOpenCreateProject();
                return;
            }
            dispatch({ type: 'SET_PROJECT', payload: projectId });
            dispatch({ type: 'SET_VIEW', payload: 'Projects' });
            navigate(`/projects/${projectId}/gantt`);
            return;
        }
        if (itemId === 'team') {
            navigate(ROUTE_PATHS.organization);
            return;
        }
        if (itemId === 'report') {
            if (!canProgressReports) {
                setShowCommsUpgrade(true);
                return;
            }
            setShowProgressReportModal(true);
        }
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

            const orgContext = await ensureOrganizationForWrites(supabaseClient, {
                userId: state.user.id,
                accountIntent: state.accountIntent,
                currentOrganization: state.currentOrganization,
                dispatch,
            });
            if (!orgContext.ok) {
                addToast(orgContext.error || 'Error: No organization found. Please contact support.', 'error');
                setIsCreatingProject(false);
                return;
            }
            
            const projectDataWithAudit = {
                ...projectFields,
                organization_id: orgContext.organizationId,
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
                } else if (isOrganizationRlsError(error)) {
                    addToast(
                        'Your account is not linked to a workspace yet. Sign out and back in, or use Settings to refresh. If this persists, contact support.',
                        'error',
                    );
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
                logProjectCreated(createdProject, state.user);
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

    const handleMoveProjectToTrash = (project) => {
        if (!navigator.onLine) {
            addToast(t('projectTrash.offline_unavailable'), 'warning');
            return;
        }
        setProjectToTrash(project);
    };

    const confirmMoveProjectToTrash = async () => {
        if (!projectToTrash) {
            setProjectToTrash(null);
            return;
        }

        const project = projectToTrash;
        if (!navigator.onLine) {
            addToast(t('projectTrash.offline_unavailable'), 'warning');
            setProjectToTrash(null);
            return;
        }
        setTrashingProjectId(project.id);
        try {
            const trashed = await trashProject(supabaseClient, project.id);
            dispatch({ type: 'DELETE_PROJECT', payload: project.id });
            if (state.selectedProjectId === project.id) {
                dispatch({ type: 'SET_PROJECT', payload: null });
            }
            addToast(
                t('projectTrash.moved_to_trash', { name: project.name }),
                'success',
                8000,
                {
                    placement: 'bottom-center',
                    action: {
                        label: t('projectTrash.undo'),
                        onClick: async () => {
                            try {
                                const restored = await restoreProject(supabaseClient, project.id);
                                dispatch({ type: 'ADD_PROJECT', payload: restored || trashed });
                                addToast(t('projectTrash.restored', { name: project.name }), 'success');
                            } catch (undoError) {
                                addToast(t('projectTrash.restore_error', { message: undoError.message }), 'error');
                            }
                        },
                    },
                },
            );
        } catch (error) {
            addToast(t('projectTrash.trash_error', { message: error.message }), 'error');
        } finally {
            setTrashingProjectId(null);
            setProjectToTrash(null);
        }
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
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full view-fade-in">
                <div className="xl:col-span-3">
                    <header className="mb-8 app-card p-5" data-onboarding="dashboard-welcome" data-testid="dashboard-view">
                        <div className="flex min-w-0 items-center gap-4">
                            <div className="min-w-0 shrink">
                                <h1 className="app-section-title mb-0.5 text-2xl sm:text-[1.75rem]">
                                    {isGuestOnly ? t('dashboard.guest_title') : t('dashboard.title')}
                                </h1>
                                <p className="app-section-subtitle truncate">
                                    {isGuestOnly ? t('dashboard.guest_subtitle') : t('dashboard.subtitle')}
                                </p>
                            </div>
                            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                <ViewSwitcher compact currentView={viewType} onViewChange={setViewType} />
                                <PermissionGuard permission="can_create_projects">
                                    <button type="button"
                                        onClick={() => tryOpenTemplateModal()}
                                        title={t('dashboard.create_from_template_title')}
                                        data-onboarding="template-btn"
                                        className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xs app-action-secondary"
                                    >
                                        {t('dashboard.template')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => tryOpenMsImportModal()}
                                        title={t('dashboard.import_ms_project_title')}
                                        className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xs btn-smooth bg-slate-700 text-white hover:bg-slate-800"
                                    >
                                        {t('dashboard.import_xml')}
                                    </button>
                                </PermissionGuard>
                                <PermissionGuard permission="can_manage_org_progress_reports">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!canProgressReports) {
                                                setShowCommsUpgrade(true);
                                                return;
                                            }
                                            setShowProgressReportModal(true);
                                        }}
                                        title={t('dashboard.org_reports_title')}
                                        data-onboarding="progress-reports"
                                        className="relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xs btn-smooth bg-emerald-600 text-white hover:bg-emerald-700"
                                    >
                                        {!canProgressReports && (
                                            <svg className="w-3 h-3 absolute -top-1 -right-1 text-amber-200" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                        {t('dashboard.org_reports')}
                                    </button>
                                </PermissionGuard>
                                <PermissionGuard permission="can_create_projects">
                                    <button type="button"
                                        onClick={() => tryOpenCreateProject()}
                                        data-onboarding="new-project-btn"
                                        className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold shadow-xs app-action-primary"
                                    >
                                        + {t('dashboard.new_project')}
                                    </button>
                                </PermissionGuard>
                            </div>
                        </div>
                    </header>

                    {showActivationChecklist ? (
                        <div className="mb-6">
                            <ActivationChecklist
                                completed={activationCompleted}
                                primaryColor={primaryColor}
                                onDismiss={handleChecklistDismiss}
                                onItemAction={handleChecklistAction}
                                title={t('activation.title')}
                                dismissLabel={t('activation.dismiss')}
                                formatProgress={(done, total) =>
                                    t('activation.progress', { done, total })
                                }
                                itemCopy={{
                                    workspace: {
                                        title: t('activation.workspace_title'),
                                        hint: t('activation.workspace_hint'),
                                    },
                                    project: {
                                        title: t('activation.project_title'),
                                        hint: t('activation.project_hint'),
                                    },
                                    schedule: {
                                        title: t('activation.schedule_title'),
                                        hint: t('activation.schedule_hint'),
                                    },
                                    team: {
                                        title: t('activation.team_title'),
                                        hint: t('activation.team_hint'),
                                    },
                                    report: {
                                        title: t('activation.report_title'),
                                        hint: t('activation.report_hint'),
                                    },
                                }}
                            />
                        </div>
                    ) : showActivationChecklistRestore ? (
                        <div className="mb-6">
                            <button
                                type="button"
                                onClick={handleChecklistShow}
                                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-xs transition-[transform,background-color] duration-150 hover:bg-gray-50 active:scale-[0.98]"
                                style={{ color: primaryColor, borderColor: `${primaryColor}33` }}
                                data-testid="activation-checklist-show"
                            >
                                {t('activation.show')}
                            </button>
                        </div>
                    ) : null}
                    
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
                                                onDelete={handleMoveProjectToTrash}
                                                progressData={{
                                                    loading: cardProgressLoading,
                                                    progress: cardProgressMap[p.id]?.progress ?? 0,
                                                    phaseCount: cardProgressMap[p.id]?.phaseCount ?? 0,
                                                    completeCount: cardProgressMap[p.id]?.completeCount ?? 0,
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {viewType === 'list' && (
                                <ProjectListView
                                    projects={state.projects}
                                    onEdit={handleEditProject}
                                    onDelete={handleMoveProjectToTrash}
                                    onProjectClick={handleProjectClick}
                                />
                            )}
                            {viewType === 'board' && (
                                <ProjectBoardView
                                    projects={state.projects}
                                    onEdit={handleEditProject}
                                    onDelete={handleMoveProjectToTrash}
                                    onProjectClick={handleProjectClick}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 px-6 text-center app-card" data-testid="dashboard-empty">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-5">
                                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                {isGuestOnly ? t('dashboard.guest_no_projects_title') : t('dashboard.no_projects_yet')}
                            </h3>
                            <p className="text-gray-500 mb-6 max-w-md text-sm leading-relaxed">
                                {isGuestOnly
                                    ? t('dashboard.guest_no_projects_description')
                                    : t('dashboard.no_projects_description')}
                            </p>
                            {!isGuestOnly && (
                            <button type="button" 
                                onClick={() => tryOpenCreateProject()}
                                className="px-6 py-3 rounded-lg font-medium text-sm app-action-primary"
                                data-testid="dashboard-create-first-project"
                            >
                                {t('dashboard.create_first_project')}
                            </button>
                            )}
                        </div>
                    )}
                    <PermissionGuard permission="can_delete_projects">
                        <div className="mt-8">
                            <Link
                                to={ROUTE_PATHS.projectsTrash}
                                className="app-card group flex items-center justify-between gap-4 p-4 sm:p-5 hover:bg-slate-50 transition-colors"
                                title={t('projectTrash.title')}
                            >
                                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-slate-200 transition-colors">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0 text-left">
                                        <p className="text-sm font-semibold text-gray-900">{t('projectTrash.footer_link')}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{t('projectTrash.footer_hint')}</p>
                                    </div>
                                </div>
                                <svg className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                        </div>
                    </PermissionGuard>
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
            <UpgradeRequiredModal
                isOpen={showCommsUpgrade}
                onClose={() => setShowCommsUpgrade(false)}
                feature="progress_reports"
            />
            <ConfirmDialog
                isOpen={Boolean(projectToTrash)}
                onClose={() => setProjectToTrash(null)}
                onConfirm={confirmMoveProjectToTrash}
                title={t('projectTrash.move_to_trash_title')}
                message={t('projectTrash.move_to_trash_message', { name: projectToTrash?.name })}
                confirmText={trashingProjectId ? t('common.loading') : t('projectTrash.move_to_trash_confirm')}
                cancelText={t('common.cancel')}
            />
        </>
    );
}

export default DashboardView;