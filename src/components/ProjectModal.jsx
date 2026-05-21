import React, { useState, useEffect, useRef } from 'react';
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

function ProjectModal({ onClose, onSave, isLoading = false, project = null }) {
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
    const [taskNotifUseOrgDefaults, setTaskNotifUseOrgDefaults] = useState(false);
    const [taskNotifEnabled, setTaskNotifEnabled] = useState(false);
    const [taskNotifLeadDays, setTaskNotifLeadDays] = useState('14, 7');
    const [projectBatchingEnabled, setProjectBatchingEnabled] = useState(true);
    const [projectBatchWindowMinutes, setProjectBatchWindowMinutes] = useState(5);
    const [dependencyNotifEnabled, setDependencyNotifEnabled] = useState(true);
    const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
    const [smartTaskNotifOpen, setSmartTaskNotifOpen] = useState(false);
    const actionsMenuRef = useRef(null);

    const isEditMode = !!project;

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
            setTaskNotifUseOrgDefaults(project.task_notifications_use_org_defaults !== false);
            setTaskNotifEnabled(project.task_start_notifications_enabled !== false);
            setProjectBatchingEnabled(project.notification_email_batching_enabled !== false);
            setProjectBatchWindowMinutes(
                Number.isFinite(Number(project.notification_batch_window_minutes))
                    ? Math.max(1, Math.min(60, Number(project.notification_batch_window_minutes)))
                    : 5
            );
            setDependencyNotifEnabled(project.dependency_notifications_enabled !== false);
            const leadDays = Array.isArray(project.task_start_notification_lead_days) && project.task_start_notification_lead_days.length > 0
                ? project.task_start_notification_lead_days
                : [14, 7];
            setTaskNotifLeadDays(leadDays.join(', '));
            
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
            setTaskNotifUseOrgDefaults(false);
            setTaskNotifEnabled(false);
            setTaskNotifLeadDays('14, 7');
            setProjectBatchingEnabled(true);
            setProjectBatchWindowMinutes(5);
            setDependencyNotifEnabled(true);
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

    const parseLeadDays = (raw) => {
        const values = String(raw || '')
            .split(',')
            .map((part) => parseInt(part.trim(), 10))
            .filter((num) => Number.isFinite(num) && num >= 0 && num <= 365);
        const deduped = Array.from(new Set(values));
        return deduped.length > 0 ? deduped.sort((a, b) => b - a) : [14, 7];
    };

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
            project_type: finalProjectType || null,
            status,
            start_date: start_date || null,
            due_date: due_date || null,
            next_milestone: next_milestone || null,
            task_notifications_use_org_defaults: taskNotifUseOrgDefaults,
            task_start_notifications_enabled: taskNotifUseOrgDefaults ? null : taskNotifEnabled,
            task_start_notification_lead_days: taskNotifUseOrgDefaults ? null : parseLeadDays(taskNotifLeadDays),
            notification_email_batching_enabled: projectBatchingEnabled,
            notification_batch_window_minutes: Math.max(1, Math.min(60, Number(projectBatchWindowMinutes) || 5)),
            dependency_notifications_enabled: dependencyNotifEnabled,
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
            addToast('You are automatically added to projects you create.', 'info');
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
            addToast('Please provide a name and start date for the duplicated project', 'error');
            return;
        }

        if (!state.currentOrganization?.id) {
            addToast('Organization context is missing', 'error');
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
                addToast('Project duplicated successfully!', 'success');
                setShowDuplicateDialog(false);
                onClose();
                // Refresh the page or trigger data reload
                window.location.reload();
            } else {
                addToast(result.error || 'Failed to duplicate project', 'error');
            }
        } catch (error) {
            console.error('Error duplicating project:', error);
            addToast('Failed to duplicate project', 'error');
        } finally {
            setIsDuplicating(false);
        }
    };

    const datePresets = (
        <>
            <button
                type="button"
                onClick={() => {
                    const t = localDateIso();
                    setStartDate(t);
                    setDueDate(t);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
                Today
            </button>
            <button
                type="button"
                onClick={() => {
                    const t = localDateIso();
                    setStartDate((s) => s || t);
                    setDueDate(addDaysIso(t, 7) || t);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
                +1 week
            </button>
            <button
                type="button"
                onClick={() => {
                    const t = localDateIso();
                    setStartDate((s) => s || t);
                    setDueDate(addDaysIso(t, 14) || t);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
                +2 weeks
            </button>
        </>
    );

    if (showDuplicateDialog) {
        return (
            <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                    <h2 className="text-2xl font-bold mb-6">Duplicate Project</h2>
                    <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1 text-gray-600">New Project Name</label>
                        <input 
                            type="text" 
                            value={duplicateName} 
                            onChange={e => setDuplicateName(e.target.value)} 
                            className="w-full p-2 border rounded-lg" 
                            placeholder={`${project.name} - Copy`}
                            required 
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1 text-gray-600">Address (optional)</label>
                        <input type="text" value={duplicateAddress} onChange={e => setDuplicateAddress(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Same as original if blank" />
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1 text-gray-600">Project Number (optional)</label>
                        <input type="text" value={duplicateProjectNumber} onChange={e => setDuplicateProjectNumber(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Same as original if blank" />
                    </div>
                    <DateDropdown 
                        value={duplicateStartDate} 
                        onChange={setDuplicateStartDate} 
                        label="New Start Date"
                        className="mb-6"
                        required
                    />
                    <p className="text-sm text-gray-600 mb-6">
                        This will create a copy of the project structure (phases, tasks, dependencies) with dates adjusted. 
                        Transactional data (comments, files, activity logs) will not be copied.
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setShowDuplicateDialog(false)}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            disabled={isDuplicating}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleDuplicateProject}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            disabled={isDuplicating}
                        >
                            {isDuplicating ? 'Duplicating...' : 'Duplicate'}
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
                    <h2 className="text-2xl font-bold min-w-0">{isEditMode ? 'Edit Project' : 'Create New Project'}</h2>
                    <div className="relative shrink-0" ref={actionsMenuRef}>
                        <button
                            type="button"
                            onClick={() => setActionsMenuOpen((o) => !o)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
                            aria-expanded={actionsMenuOpen}
                            aria-haspopup="menu"
                        >
                            Actions
                            <span className="text-gray-500" aria-hidden>▾</span>
                        </button>
                        {actionsMenuOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 z-30 mt-1 min-w-[14rem] rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg"
                            >
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="w-full px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                                    onClick={() => {
                                        setSmartTaskNotifOpen(true);
                                        setActionsMenuOpen(false);
                                    }}
                                >
                                    Smart task notifications
                                </button>
                                {isEditMode && (
                                    <PermissionGuard permission="can_create_projects">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="w-full px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                                            onClick={() => {
                                                setDuplicateName(`${project.name} - Copy`);
                                                setDuplicateAddress(project.address || '');
                                                setDuplicateProjectNumber(project.project_number || '');
                                                setDuplicateStartDate('');
                                                setShowDuplicateDialog(true);
                                                setActionsMenuOpen(false);
                                            }}
                                        >
                                            Duplicate project
                                        </button>
                                    </PermissionGuard>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <form onSubmit={handleSubmit}>
                    {isEditMode && project && state.currentOrganization && (
                        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-700">
                            <span className="font-medium text-slate-800">Smart task emails: </span>
                            {project.task_notifications_use_org_defaults !== false ? (
                                <>
                                    Using organization defaults (
                                    {state.currentOrganization.task_start_notifications_enabled !== false ? 'on' : 'off'}
                                    ).
                                </>
                            ) : project.task_start_notifications_enabled !== false ? (
                                <>On for this project.</>
                            ) : (
                                <>Off for this project.</>
                            )}{' '}
                            <button
                                type="button"
                                className="font-semibold text-blue-600 hover:text-blue-800"
                                onClick={() => setSmartTaskNotifOpen(true)}
                            >
                                Edit notification settings
                            </button>
                        </div>
                    )}
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[7fr_3fr] lg:grid-cols-1">
                        <div className="min-w-0 lg:col-span-1">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">Project Name</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 border rounded-lg" required />
                        </div>
                        <div className="min-w-0 lg:hidden">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">Project Number</label>
                            <input
                                type="text"
                                value={project_number}
                                onChange={(e) => setProjectNumber(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                placeholder="Optional"
                            />
                        </div>
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1 text-gray-600">Address</label>
                        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full p-2 border rounded-lg" />
                    </div>
                    <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[3fr_7fr]">
                        <div className="min-w-0">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">Project Type</label>
                            <select value={project_type} onChange={(e) => setProjectType(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                                <option value="Residential">Residential</option>
                                <option value="Commercial">Commercial</option>
                                <option value="Industrial">Industrial</option>
                                <option value="Infrastructure">Infrastructure</option>
                                <option value="Multi-family">Multi-family</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="min-w-0 hidden lg:block">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">Project Number</label>
                            <input
                                type="text"
                                value={project_number}
                                onChange={(e) => setProjectNumber(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                placeholder="Optional"
                            />
                        </div>
                    </div>
                    {project_type === 'Other' && (
                        <div className="mb-4">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">Custom project type</label>
                            <input
                                type="text"
                                value={project_type_custom}
                                onChange={(e) => setProjectTypeCustom(e.target.value)}
                                placeholder="Enter project type"
                                className="w-full p-2 border rounded-lg"
                            />
                        </div>
                    )}
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[3fr_7fr]">
                        <div className="min-w-0">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">Status</label>
                            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                                <option value="Planning">Planning</option>
                                <option value="In Progress">In Progress</option>
                                <option value="On Hold">On Hold</option>
                                <option value="Completed">Completed</option>
                            </select>
                        </div>
                        <div className="min-w-0">
                            <label className="block text-sm font-semibold mb-1 text-gray-600">Next Milestone</label>
                            <input
                                type="text"
                                value={next_milestone}
                                onChange={(e) => setNextMilestone(e.target.value)}
                                className="w-full p-2 border rounded-lg"
                                placeholder="e.g., Foundation Complete"
                            />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 -mt-2 mb-4">Status color will be automatically determined</p>
                    <DateRangePicker
                        label="Schedule"
                        startValue={start_date}
                        endValue={due_date}
                        onChange={({ start, end }) => {
                            setStartDate(start);
                            setDueDate(end);
                        }}
                        presets={datePresets}
                        className="mb-4"
                    />

                    {smartTaskNotifOpen && (
                    <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                        <div className="mb-3 flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-800">Smart Task Notifications</h3>
                            <button
                                type="button"
                                onClick={() => setSmartTaskNotifOpen(false)}
                                className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                            >
                                Close
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">
                            Smart notifications email assignees before task start dates and when dependencies unlock so crews can prepare in advance.
                        </p>
                        <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                            <input
                                type="checkbox"
                                checked={taskNotifUseOrgDefaults}
                                onChange={(e) => setTaskNotifUseOrgDefaults(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Use organization defaults
                        </label>
                        {!taskNotifUseOrgDefaults && (
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={taskNotifEnabled}
                                        onChange={(e) => setTaskNotifEnabled(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Email assignees before task start
                                </label>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Lead days before start (comma-separated)</label>
                                    <input
                                        type="text"
                                        value={taskNotifLeadDays}
                                        onChange={(e) => setTaskNotifLeadDays(e.target.value)}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        placeholder="14, 7"
                                    />
                                </div>
                            </div>
                        )}
                        <div className="space-y-2 mt-3 pt-3 border-t border-gray-200">
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={projectBatchingEnabled}
                                    onChange={(e) => setProjectBatchingEnabled(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Batch low-urgency notifications for this project
                            </label>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Batch window (minutes)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="60"
                                    value={projectBatchWindowMinutes}
                                    onChange={(e) => setProjectBatchWindowMinutes(e.target.value)}
                                    className="w-full p-2 border rounded-lg text-sm"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={dependencyNotifEnabled}
                                    onChange={(e) => setDependencyNotifEnabled(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Email assignees when dependencies unlock
                            </label>
                        </div>
                    </div>
                    )}

                    <div className="mb-6">
                        <label className="block text-sm font-semibold mb-2 text-gray-600">
                            {isEditMode ? 'Team Members' : 'Add Team Members'} (Optional)
                        </label>
                        
                        {/* Add email addresses input */}
                        <div className="mb-4">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Enter email addresses (comma or space separated)"
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddEmails}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                                >
                                    Add
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Add email addresses for people who don&apos;t have accounts yet. They&apos;ll be invited to join.
                                {ownerContactId && ' You are added to the project automatically.'}
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
                                    ? 'The project owner is always on the team and cannot be removed.'
                                    : 'You are automatically on the project team.'}
                            </p>
                        )}

                        {(selectedContacts.length > 0 || emailAddresses.length > 0) && (
                            <p className="text-xs text-gray-500 mt-2">
                                {selectedContacts.length} existing contact{selectedContacts.length !== 1 ? 's' : ''} selected
                                {emailAddresses.length > 0 && `, ${emailAddresses.length} email${emailAddresses.length !== 1 ? 's' : ''} to invite`}
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
                                Import MS Project XML
                            </button>
                        )}
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-6 py-2 text-white bg-blue-600 rounded-lg disabled:opacity-50 flex items-center gap-2">
                            {isLoading ? (
                                <>
                                    <LoadingSpinner size="sm" text="" />
                                    {isEditMode ? 'Updating...' : 'Creating...'}
                                </>
                            ) : (
                                isEditMode ? 'Update Project' : 'Create Project'
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