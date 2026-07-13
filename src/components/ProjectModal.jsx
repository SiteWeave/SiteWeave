import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedProjectStatus, PROJECT_STATUS_CANONICAL } from '@siteweave/i18n';
import { useAppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { duplicateProject } from '../utils/projectDuplicationService';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from './LoadingSpinner';
import DateDropdown from './DateDropdown';
import DateRangePicker from './DateRangePicker';
import Avatar from './Avatar';
import PermissionGuard from './PermissionGuard';
import MsProjectImportModal from './MsProjectImportModal';
import { addDaysIso, localDateIso } from '../utils/dateHelpers';

const DEFAULT_SMART_NOTIFICATION_FIELDS = {
    task_notifications_use_org_defaults: false,
    task_start_notifications_enabled: false,
    task_start_notification_lead_days: null,
    notification_email_batching_enabled: true,
    notification_batch_window_minutes: 5,
    dependency_notifications_enabled: true,
};

const PROJECT_STATUS_OPTIONS = [
    PROJECT_STATUS_CANONICAL.planning,
    PROJECT_STATUS_CANONICAL.in_progress,
    PROJECT_STATUS_CANONICAL.on_hold,
    PROJECT_STATUS_CANONICAL.completed,
];

const PROJECT_TYPE_OPTIONS = [
    { value: 'Residential', labelKey: 'projectModal.type_residential' },
    { value: 'Commercial', labelKey: 'projectModal.type_commercial' },
    { value: 'Industrial', labelKey: 'projectModal.type_industrial' },
    { value: 'Infrastructure', labelKey: 'projectModal.type_infrastructure' },
    { value: 'Multi-family', labelKey: 'projectModal.type_multifamily' },
    { value: 'Other', labelKey: 'projectModal.type_other' },
];

function ProjectModal({ onClose, onSave, isLoading = false, project = null }) {
    const { t } = useTranslation();
    const { state } = useAppContext();
    const { addToast } = useToast();
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [project_number, setProjectNumber] = useState('');
    const [project_type, setProjectType] = useState('Residential');
    const [project_type_custom, setProjectTypeCustom] = useState('');
    const [status, setStatus] = useState('Planning');
    const [start_date, setStartDate] = useState('');
    const [due_date, setDueDate] = useState('');
    const [next_milestone, setNextMilestone] = useState('');
    const [selectedContacts, setSelectedContacts] = useState([]);
    const [emailInput, setEmailInput] = useState('');
    const [emailAddresses, setEmailAddresses] = useState([]);
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [duplicateName, setDuplicateName] = useState('');
    const [duplicateStartDate, setDuplicateStartDate] = useState('');
    const [duplicateAddress, setDuplicateAddress] = useState('');
    const [duplicateProjectNumber, setDuplicateProjectNumber] = useState('');
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [showMsProjectImportModal, setShowMsProjectImportModal] = useState(false);
    const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
    const actionsMenuRef = useRef(null);

    const isEditMode = !!project;
    const isOrgAdminRole = state.userRole?.name === 'Org Admin' || state.userRole?.name === 'Admin';
    const canEditProjects = state.userRole?.permissions?.can_edit_projects === true || isOrgAdminRole;
    const canCreateProjects = state.userRole?.permissions?.can_create_projects === true || isOrgAdminRole;
    const canChangeProjectType = isEditMode ? canEditProjects : canCreateProjects;

    const contacts = state.contacts || [];
    const userEmail = state.user?.email?.trim().toLowerCase() || '';

    const resolveOwnerContactId = () => {
        if (isEditMode && project?.created_by_user_id) {
            const creatorProfile = state.profiles?.find((p) => p.id === project.created_by_user_id);
            if (creatorProfile?.contact_id) return creatorProfile.contact_id;
        }
        if (state.userContactId) return state.userContactId;
        if (userEmail) {
            const match = contacts.find((c) => c.email?.trim().toLowerCase() === userEmail);
            if (match?.id) return match.id;
        }
        return null;
    };

    const ownerContactId = resolveOwnerContactId();
    const allTeamMembers = contacts.filter((c) => c.type === 'Team');
    const teamMembers = ownerContactId
        ? allTeamMembers.filter((c) => String(c.id) !== String(ownerContactId))
        : allTeamMembers;

    useEffect(() => {
        if (project) {
            setName(project.name || '');
            setAddress(project.address || '');
            setProjectNumber(project.project_number || '');
            const projectType = project.project_type || 'Residential';
            // Check if project_type is one of the predefined options
            const predefinedTypes = ['Residential', 'Commercial', 'Industrial', 'Infrastructure', 'Multi-family'];
            if (predefinedTypes.includes(projectType)) {
                setProjectType(projectType);
                setProjectTypeCustom('');
            } else {
                setProjectType('Other');
                setProjectTypeCustom(projectType);
            }
            setStatus(project.status || 'Planning');
            setStartDate(project.start_date || '');
            setDueDate(project.due_date || '');
            setNextMilestone(project.next_milestone || '');
            
            // Load existing project contacts
            const existingContacts = state.contacts
                .filter(contact =>
                    contact.type === 'Team'
                    && contact.project_contacts?.some((pc) => pc.project_id === project.id)
                    && (!ownerContactId || String(contact.id) !== String(ownerContactId)),
                )
                .map(contact => contact.id);
            setSelectedContacts(existingContacts);
        } else {
            // Reset when creating new project
            setStartDate('');
            setProjectNumber('');
            setProjectType('Residential');
            setProjectTypeCustom('');
            setSelectedContacts([]);
            setEmailAddresses([]);
        }
    }, [project, state.contacts, state.userContactId, ownerContactId]);

    useEffect(() => {
        if (!actionsMenuOpen) return;
        const onDocMouseDown = (e) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target)) {
                setActionsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [actionsMenuOpen]);

    const handleSubmit = (e) => {
        e.preventDefault();
        // Determine the final project_type value
        const finalProjectType = project_type === 'Other' ? project_type_custom : project_type;
        
        const ownerAugmentedContacts = ownerContactId && !selectedContacts.includes(ownerContactId)
            ? [...selectedContacts, ownerContactId]
            : selectedContacts;

        const projectData = {
            name,
            address,
            project_number: project_number || null,
            ...(canChangeProjectType ? { project_type: finalProjectType || null } : {}),
            status,
            start_date: start_date || null,
            due_date: due_date || null,
            next_milestone: next_milestone || null,
            ...(isEditMode
                ? {}
                : DEFAULT_SMART_NOTIFICATION_FIELDS),
            selectedContacts: ownerAugmentedContacts,
            emailAddresses: emailAddresses.filter((email) => email !== userEmail),
        };
        
        if (isEditMode) {
            projectData.id = project.id;
        }
        
        onSave(projectData);
    };

    const handleAddEmails = () => {
        if (!emailInput.trim()) return;
        
        const emails = emailInput
            .split(/[\s,;]+/)
            .map(e => e.trim().toLowerCase())
            .filter(e => e.includes('@') && e.length > 0);
        
        const deduped = Array.from(new Set(emails));
        const rejectedOwnEmail = userEmail && deduped.includes(userEmail);
        const newEmails = deduped.filter(
            (email) => email !== userEmail
            && !emailAddresses.includes(email)
            && !allTeamMembers.some((contact) => contact.email?.toLowerCase() === email),
        );

        if (rejectedOwnEmail) {
            addToast(t('projectModal.auto_added_toast'), 'info');
        }

        if (newEmails.length > 0) {
            setEmailAddresses((prev) => [...prev, ...newEmails]);
            setEmailInput('');
        }
    };

    const handleRemoveEmail = (emailToRemove) => {
        setEmailAddresses(prev => prev.filter(email => email !== emailToRemove));
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddEmails();
        }
    };

    const toggleContact = (contactId) => {
        setSelectedContacts(prev => 
            prev.includes(contactId) 
                ? prev.filter(id => id !== contactId)
                : [...prev, contactId]
        );
    };

    const handleDuplicateProject = async () => {
        if (!duplicateName || !duplicateStartDate) {
            addToast(t('projectModal.duplicate_name_date_required'), 'error');
            return;
        }

        if (!state.currentOrganization?.id) {
            addToast(t('projectModal.org_context_missing'), 'error');
            return;
        }

        setIsDuplicating(true);
        try {
            const result = await duplicateProject(
                supabaseClient,
                project.id,
                duplicateName,
                state.currentOrganization.id,
                duplicateStartDate,
                { address: duplicateAddress || undefined, project_number: duplicateProjectNumber || undefined },
                state.user?.id
            );

            if (result.success) {
                addToast(t('projectModal.duplicated_success'), 'success');
                setShowDuplicateDialog(false);
                onClose();
                // Refresh the page or trigger data reload
                window.location.reload();
            } else {
                addToast(result.error || t('projectModal.duplicate_failed'), 'error');
            }
        } catch (error) {
            console.error('Error duplicating project:', error);
            addToast(t('projectModal.duplicate_failed'), 'error');
        } finally {
            setIsDuplicating(false);
        }
    };

    const datePresets = (
        <>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    setStartDate(todayIso);
                    setDueDate(todayIso);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
                {t('projectModal.today')}
            </button>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    setStartDate((s) => s || todayIso);
                    setDueDate(addDaysIso(todayIso, 7) || todayIso);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
                {t('projectModal.plus_one_week')}
            </button>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    setStartDate((s) => s || todayIso);
                    setDueDate(addDaysIso(todayIso, 14) || todayIso);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
                {t('projectModal.plus_two_weeks')}
            </button>
        </>
    );

    if (showDuplicateDialog) {
        return (
            <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                    <h2 className="text-2xl font-bold mb-6">{t('projectModal.duplicate_title')}</h2>
                    <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.duplicate_name_label')}</label>
                        <input 
                            type="text" 
                            value={duplicateName} 
                            onChange={e => setDuplicateName(e.target.value)} 
                            className="w-full p-2 border rounded-lg" 
                            placeholder={`${project.name}${t('projectModal.copy_suffix')}`}
                            required 
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.duplicate_address_label')}</label>
                        <input type="text" value={duplicateAddress} onChange={e => setDuplicateAddress(e.target.value)} className="w-full p-2 border rounded-lg" placeholder={t('projectModal.same_as_original')} />
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.duplicate_number_label')}</label>
                        <input type="text" value={duplicateProjectNumber} onChange={e => setDuplicateProjectNumber(e.target.value)} className="w-full p-2 border rounded-lg" placeholder={t('projectModal.same_as_original')} />
                    </div>
                    <DateDropdown 
                        value={duplicateStartDate} 
                        onChange={setDuplicateStartDate} 
                        label={t('projectModal.duplicate_start_date')}
                        className="mb-6"
                        required
                    />
                    <p className="text-sm text-gray-600 mb-6">
                        {t('projectModal.duplicate_description')}
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setShowDuplicateDialog(false)}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            disabled={isDuplicating}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleDuplicateProject}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            disabled={isDuplicating}
                        >
                            {isDuplicating ? t('projectModal.duplicating') : t('projectModal.duplicate')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                    <h2 className="text-2xl font-bold min-w-0">{isEditMode ? t('projectModal.edit_project') : t('projectModal.create_project')}</h2>
                    {isEditMode && (
                    <div className="relative shrink-0" ref={actionsMenuRef}>
                        <button
                            type="button"
                            onClick={() => setActionsMenuOpen((o) => !o)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
                            aria-expanded={actionsMenuOpen}
                            aria-haspopup="menu"
                        >
                            {t('projectModal.actions')}
                            <span className="text-gray-500" aria-hidden>▾</span>
                        </button>
                        {actionsMenuOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 z-30 mt-1 min-w-[14rem] rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg"
                            >
                                <PermissionGuard permission="can_create_projects">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="w-full px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                                        onClick={() => {
                                            setDuplicateName(`${project.name}${t('projectModal.copy_suffix')}`);
                                            setDuplicateAddress(project.address || '');
                                            setDuplicateProjectNumber(project.project_number || '');
                                            setDuplicateStartDate('');
                                            setShowDuplicateDialog(true);
                                            setActionsMenuOpen(false);
                                        }}
                                    >
                                        {t('projectModal.duplicate_project')}
                                    </button>
                                </PermissionGuard>
                            </div>
                        )}
                    </div>
                    )}
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[7fr_3fr] lg:grid-cols-1">
                        <div className="min-w-0 lg:col-span-1">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.project_name')}</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 border rounded-lg" required />
                        </div>
                        <div className="min-w-0 lg:hidden">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.project_number')}</label>
                            <input
                                type="text"
                                value={project_number}
                                onChange={(e) => setProjectNumber(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                placeholder={t('projectModal.optional')}
                            />
                        </div>
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.address')}</label>
                        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full p-2 border rounded-lg" />
                    </div>
                    <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[3fr_7fr]">
                        <div className="min-w-0">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.project_type')}</label>
                            <select
                                value={project_type}
                                onChange={(e) => setProjectType(e.target.value)}
                                disabled={!canChangeProjectType}
                                className="w-full p-2 border rounded-lg bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                            >
                                {PROJECT_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="min-w-0 hidden lg:block">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.project_number')}</label>
                            <input
                                type="text"
                                value={project_number}
                                onChange={(e) => setProjectNumber(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                placeholder={t('projectModal.optional')}
                            />
                        </div>
                    </div>
                    {project_type === 'Other' && (
                        <div className="mb-4">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.custom_project_type')}</label>
                            <input
                                type="text"
                                value={project_type_custom}
                                onChange={(e) => setProjectTypeCustom(e.target.value)}
                                placeholder={t('projectModal.custom_type_placeholder')}
                                disabled={!canChangeProjectType}
                                className="w-full p-2 border rounded-lg disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                            />
                        </div>
                    )}
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[3fr_7fr]">
                        <div className="min-w-0">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.status')}</label>
                            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                                {PROJECT_STATUS_OPTIONS.map((statusValue) => (
                                    <option key={statusValue} value={statusValue}>
                                        {getLocalizedProjectStatus(statusValue, t)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="min-w-0">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">{t('projectModal.next_milestone')}</label>
                            <input
                                type="text"
                                value={next_milestone}
                                onChange={(e) => setNextMilestone(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                placeholder={t('projectModal.milestone_placeholder')}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 -mt-2 mb-4">{t('projectModal.status_color_hint')}</p>
                    <DateRangePicker
                        label={t('projectModal.schedule')}
                        startValue={start_date}
                        endValue={due_date}
                        onChange={({ start, end }) => {
                            setStartDate(start);
                            setDueDate(end);
                        }}
                        presets={datePresets}
                        className="mb-4"
                    />

                    <div className="mb-6">
                        <label className="block text-sm font-semibold mb-2 text-gray-600">
                            {isEditMode ? t('projectModal.team_members') : t('projectModal.add_team_members')} {t('projectModal.optional_paren')}
                        </label>
                        
                        {/* Add email addresses input */}
                        <div className="mb-4">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder={t('projectModal.email_input_placeholder')}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddEmails}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                                >
                                    {t('projectModal.add')}
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {t('projectModal.email_invite_hint')}
                                {ownerContactId && t('projectModal.auto_added_hint')}
                            </p>
                        </div>

                        {/* Display added email addresses */}
                        {emailAddresses.length > 0 && (
                            <div className="mb-4 flex flex-wrap gap-2">
                                {emailAddresses.map((email, index) => (
                                    <span
                                        key={index}
                                        className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                                    >
                                        {email}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveEmail(email)}
                                            className="text-blue-700 hover:text-blue-900"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Existing team members list */}
                        {teamMembers.length > 0 && (
                            <div className="border border-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto">
                                {teamMembers.map(contact => (
                                    <label key={contact.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedContacts.includes(contact.id)}
                                            onChange={() => toggleContact(contact.id)}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div className="flex items-center gap-2 flex-1">
                                            {contact.avatar_url ? (
                                                <img 
                                                    src={contact.avatar_url} 
                                                    alt={contact.name}
                                                    className="w-8 h-8 rounded-full"
                                                />
                                            ) : (
                                                <Avatar name={contact.name} size="md" />
                                            )}
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">{contact.name}</div>
                                                <div className="text-xs text-gray-500">{contact.role}</div>
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                        {ownerContactId && (
                            <p className="mt-2 text-xs italic text-gray-500">
                                {isEditMode
                                    ? t('projectModal.owner_always_on')
                                    : t('projectModal.auto_on_team')}
                            </p>
                        )}

                        {(selectedContacts.length > 0 || emailAddresses.length > 0) && (
                            <p className="text-xs text-gray-500 mt-2">
                                {t(selectedContacts.length === 1 ? 'projectModal.contacts_selected_one' : 'projectModal.contacts_selected_other', { count: selectedContacts.length })}
                                {emailAddresses.length > 0 && t(emailAddresses.length === 1 ? 'projectModal.emails_to_invite_one' : 'projectModal.emails_to_invite_other', { count: emailAddresses.length })}
                            </p>
                        )}
                    </div>
                    <div className="flex justify-end gap-4">
                        {!isEditMode && (
                            <button
                                type="button"
                                onClick={() => setShowMsProjectImportModal(true)}
                                disabled={isLoading}
                                className="px-6 py-2 bg-gray-100 text-gray-800 rounded-lg disabled:opacity-50 hover:bg-gray-200"
                            >
                                {t('projectModal.import_ms_project')}
                            </button>
                        )}
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg disabled:opacity-50">{t('common.cancel')}</button>
                        <button type="submit" disabled={isLoading} className="px-6 py-2 text-white bg-blue-600 rounded-lg disabled:opacity-50 flex items-center gap-2">
                            {isLoading ? (
                                <>
                                    <LoadingSpinner size="sm" text="" />
                                    {isEditMode ? t('projectModal.updating') : t('projectModal.creating')}
                                </>
                            ) : (
                                isEditMode ? t('projectModal.update_project') : t('projectModal.create_project_btn')
                            )}
                        </button>
                    </div>
                </form>
            </div>
            {showMsProjectImportModal && !isEditMode && (
                <MsProjectImportModal
                    context="newProject"
                    onClose={() => setShowMsProjectImportModal(false)}
                    onSuccess={() => {
                        setShowMsProjectImportModal(false);
                        onClose();
                    }}
                />
            )}
        </div>
    );
}

export default ProjectModal;