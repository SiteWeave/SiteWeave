import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import LoadingSpinner from './LoadingSpinner';
import DateDropdown from './DateDropdown';
import DateRangePicker from './DateRangePicker';
import TaskDependencyCombobox from './TaskDependencyCombobox';
import { validateRecurrence } from '../utils/recurrenceService';
import { addDaysIso, localDateIso } from '../utils/dateHelpers';
import PermissionGuard from './PermissionGuard';

const fieldClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-xs transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1.5';
const selectClass = `${fieldClass} cursor-pointer appearance-none bg-white`;
const chipClass =
    'rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-xs transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

function formatUsPhoneInput(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length < 4) return `(${digits}`;
    if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function TaskModal({
    project,
    projectPhases = [],
    defaultPhaseId = '',
    onSetupPhases,
    onClose,
    onSave,
    isLoading = false,
    allTasks = [],
}) {
    const { t } = useTranslation();
    const { state } = useAppContext();
    const [text, setText] = useState('');
    const [startDate, setStartDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [percentComplete, setPercentComplete] = useState(0);
    const [phaseId, setPhaseId] = useState(defaultPhaseId || '');

    useEffect(() => {
        setPhaseId(defaultPhaseId || '');
    }, [defaultPhaseId]);
    const [assigneeId, setAssigneeId] = useState('');
    const [assigneeEmail, setAssigneeEmail] = useState('');
    const [assigneePhone, setAssigneePhone] = useState('');
    const [sendAssignmentEmail, setSendAssignmentEmail] = useState(false);

    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrencePattern, setRecurrencePattern] = useState('weekly');
    const [recurrenceInterval, setRecurrenceInterval] = useState(1);
    const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState([1, 3, 5]);
    const [recurrenceEndType, setRecurrenceEndType] = useState('never');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
    const [recurrenceOccurrences, setRecurrenceOccurrences] = useState(10);
    const [selectedPredecessorTaskIds, setSelectedPredecessorTaskIds] = useState([]);

    const contacts = state.contacts || [];

    const projectContacts = contacts.filter(contact =>
        contact.project_contacts && contact.project_contacts.some(pc => pc.project_id === project.id)
    );
    
    const orgAdmins = contacts.filter(contact =>
        contact.is_internal &&
        contact.organization_id === project.organization_id &&
        contact.role_name &&
        contact.role_name.toLowerCase() === 'org admin'
    );
    
    const allAssignableContacts = [
        ...projectContacts,
        ...orgAdmins.filter(admin => !projectContacts.some(pc => pc.id === admin.id))
    ];

    const assigneeHasEmail = useMemo(() => {
        if (assigneeId && String(assigneeId).trim()) {
            const c = allAssignableContacts.find((x) => x.id === assigneeId);
            return Boolean(c?.email && String(c.email).includes('@'));
        }
        const ne = assigneeEmail.trim().toLowerCase();
        return ne.includes('@');
    }, [assigneeId, assigneeEmail, allAssignableContacts]);

    const orgDefaultSend = state.currentOrganization?.default_send_assignment_email === true;
    const prevValidFreeEmailRef = useRef(false);

    useEffect(() => {
        if (!assigneeHasEmail) {
            setSendAssignmentEmail(false);
            prevValidFreeEmailRef.current = false;
            return;
        }
        if (assigneeId && String(assigneeId).trim()) {
            setSendAssignmentEmail(orgDefaultSend);
        }
    }, [assigneeHasEmail, orgDefaultSend, assigneeId]);

    useEffect(() => {
        if (assigneeId && String(assigneeId).trim()) {
            prevValidFreeEmailRef.current = false;
            return;
        }
        const ne = assigneeEmail.trim().toLowerCase();
        const valid = ne.includes('@');
        if (!valid) {
            setSendAssignmentEmail(false);
            prevValidFreeEmailRef.current = false;
            return;
        }
        if (!prevValidFreeEmailRef.current) {
            prevValidFreeEmailRef.current = true;
            setSendAssignmentEmail(orgDefaultSend);
        }
    }, [assigneeEmail, assigneeId, orgDefaultSend]);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        let recurrenceJson = null;
        if (isRecurring) {
            const recurrence = {
                pattern: recurrencePattern,
                interval: recurrenceInterval,
                daysOfWeek: recurrencePattern === 'weekly' ? recurrenceDaysOfWeek : undefined,
                endType: recurrenceEndType,
                endDate: recurrenceEndType === 'until' ? recurrenceEndDate : undefined,
                occurrences: recurrenceEndType === 'after' ? recurrenceOccurrences : undefined
            };
            
            const validation = validateRecurrence(recurrence);
            if (!validation.valid) {
                alert(t(validation.errorKey));
                return;
            }
            
            recurrenceJson = JSON.stringify(recurrence);
        }
        
        let validAssigneeId = null;
        if (assigneeId && assigneeId.trim() !== '') {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(assigneeId)) {
                const contactExists = allAssignableContacts.some(c => c.id === assigneeId);
                if (contactExists) {
                    validAssigneeId = assigneeId;
                } else {
                    console.warn('Selected assignee not found in project contacts, setting to null');
                }
            }
        }
        
        const normalizedAssigneeEmail = assigneeEmail.trim().toLowerCase();
        const hasEmailAssignee = normalizedAssigneeEmail.includes('@');
        const trimmedAssigneePhone = assigneePhone.trim();

        const boundedPercent = Math.max(0, Math.min(100, Number(percentComplete) || 0));

        onSave({
            project_id: project.id,
            text,
            start_date: startDate || null,
            due_date: dueDate || null,
            priority,
            project_phase_id: phaseId || null,
            percent_complete: boundedPercent,
            assignee_id: validAssigneeId,
            assignee_email: validAssigneeId ? null : (hasEmailAssignee ? normalizedAssigneeEmail : null),
            assignee_phone: validAssigneeId ? null : (trimmedAssigneePhone || null),
            recurrence: recurrenceJson,
            completed: boundedPercent >= 100,
            predecessor_task_ids: selectedPredecessorTaskIds,
            send_assignment_email: assigneeHasEmail && sendAssignmentEmail,
        });
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
                className={chipClass}
            >
                {t('common.today')}
            </button>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    setStartDate((s) => s || todayIso);
                    setDueDate(addDaysIso(todayIso, 7) || todayIso);
                }}
                className={chipClass}
            >
                {t('common.plus_one_week')}
            </button>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    setStartDate((s) => s || todayIso);
                    setDueDate(addDaysIso(todayIso, 14) || todayIso);
                }}
                className={chipClass}
            >
                {t('common.plus_two_weeks')}
            </button>
        </>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 p-4 backdrop-blur-[2px]">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl sm:p-8">
                <h2 className="mb-6 text-xl font-semibold tracking-tight text-gray-900">
                    {t('taskModal.create_title', { project: project.name })}
                </h2>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-8 lg:grid-cols-[1fr,minmax(280px,340px)]">
                        <div className="min-w-0 space-y-5">
                            <div>
                                <label className={labelClass} htmlFor="task-modal-description">{t('taskModal.task_description')}</label>
                                <input
                                    id="task-modal-description"
                                    type="text"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    className={fieldClass}
                                    required
                                />
                            </div>

                            <DateRangePicker
                                label={t('tasks.schedule')}
                                startValue={startDate}
                                endValue={dueDate}
                                onChange={({ start, end }) => {
                                    setStartDate(start);
                                    setDueDate(end);
                                }}
                                presets={datePresets}
                            />

                        </div>

                        <aside className="h-fit space-y-4 rounded-xl border border-gray-200 bg-gray-50/90 p-5 lg:sticky lg:top-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t('taskModal.details')}</p>

                            <PermissionGuard permission="can_assign_tasks">
                                <div>
                                    <label className={labelClass} htmlFor="task-modal-assignee">{t('taskModal.assignee')}</label>
                                    <select
                                        id="task-modal-assignee"
                                        value={assigneeId}
                                        onChange={(e) => {
                                            setAssigneeId(e.target.value);
                                            if (e.target.value) {
                                                setAssigneeEmail('');
                                                setAssigneePhone('');
                                            }
                                        }}
                                        className={selectClass}
                                    >
                                        <option value="">{t('common.unassigned')}</option>
                                        {allAssignableContacts.length > 0 ? (
                                            allAssignableContacts.map(contact => (
                                                <option key={contact.id} value={contact.id}>
                                                    {contact.name}
                                                    {orgAdmins.some(admin => admin.id === contact.id) && !projectContacts.some(pc => pc.id === contact.id) && t('taskModal.admin_suffix')}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="" disabled>{t('taskModal.no_team_members')}</option>
                                        )}
                                    </select>
                                    {allAssignableContacts.length === 0 && (
                                        <p className="mt-1.5 text-xs text-gray-500">
                                            {t('taskModal.add_team_members_hint')}
                                        </p>
                                    )}
                                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
                                        <div className="min-w-0">
                                            <label className={labelClass} htmlFor="task-modal-assignee-email">{t('taskModal.assignee_email')}</label>
                                            <input
                                                id="task-modal-assignee-email"
                                                type="email"
                                                value={assigneeEmail}
                                                onChange={(e) => {
                                                    setAssigneeEmail(e.target.value);
                                                    if (e.target.value.trim()) {
                                                        setAssigneeId('');
                                                    }
                                                }}
                                                className={fieldClass}
                                                placeholder={t('taskModal.email_placeholder')}
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <label className={labelClass} htmlFor="task-modal-assignee-phone">{t('taskModal.assignee_phone')}</label>
                                            <input
                                                id="task-modal-assignee-phone"
                                                type="tel"
                                                inputMode="tel"
                                                autoComplete="tel"
                                                value={assigneePhone}
                                                onChange={(e) => {
                                                    const formatted = formatUsPhoneInput(e.target.value);
                                                    setAssigneePhone(formatted);
                                                    if (e.target.value.trim()) {
                                                        setAssigneeId('');
                                                    }
                                                }}
                                                className={fieldClass}
                                                placeholder={t('taskModal.phone_placeholder')}
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                                        <label className="flex cursor-pointer items-start gap-2.5">
                                            <input
                                                type="checkbox"
                                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={sendAssignmentEmail}
                                                disabled={!assigneeHasEmail}
                                                onChange={(e) => setSendAssignmentEmail(e.target.checked)}
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-gray-800">{t('taskModal.send_email_notification')}</span>
                                                <span className="mt-0.5 block text-xs text-gray-500">{t('taskModal.send_email_hint')}</span>
                                                {!assigneeHasEmail && (
                                                    <span className="mt-1 block text-xs text-amber-700">{t('taskModal.send_email_no_email')}</span>
                                                )}
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </PermissionGuard>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
                                <div className="min-w-0">
                                    <label className={labelClass} htmlFor="task-modal-phase">{t('taskModal.phase')}</label>
                                    {projectPhases.length > 0 ? (
                                        <select
                                            id="task-modal-phase"
                                            value={phaseId}
                                            onChange={(e) => setPhaseId(e.target.value)}
                                            className={selectClass}
                                        >
                                            <option value="">{t('common.unassigned')}</option>
                                            {projectPhases.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-sm text-gray-600">
                                            {t('tasks.unassigned')}
                                            {onSetupPhases && (
                                                <>
                                                    {' · '}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            onClose();
                                                            onSetupPhases();
                                                        }}
                                                        className="text-blue-600 font-medium hover:underline"
                                                    >
                                                        {t('projectDetail.setup_phases_link')}
                                                    </button>
                                                </>
                                            )}
                                        </p>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <label className={labelClass} htmlFor="task-modal-priority">{t('taskModal.priority')}</label>
                                    <select
                                        id="task-modal-priority"
                                        value={priority}
                                        onChange={(e) => setPriority(e.target.value)}
                                        className={selectClass}
                                    >
                                        <option value="Low">{t('tasks.priority_low')}</option>
                                        <option value="Medium">{t('tasks.priority_medium')}</option>
                                        <option value="High">{t('tasks.priority_high')}</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
                                <div className="min-w-0">
                                    <label className={labelClass} htmlFor="task-modal-percent-complete">{t('tasks.percent_complete')}</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            id="task-modal-percent-complete"
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="5"
                                            value={Math.max(0, Math.min(100, Number(percentComplete) || 0))}
                                            onChange={(e) => setPercentComplete(Number(e.target.value))}
                                            className="w-full"
                                        />
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={Math.max(0, Math.min(100, Number(percentComplete) || 0))}
                                            onChange={(e) => setPercentComplete(Number(e.target.value))}
                                            className="w-16 shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm tabular-nums [-moz-appearance:textfield] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                            aria-label={t('tasks.percent_complete')}
                                        />
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <TaskDependencyCombobox
                                        allTasks={allTasks}
                                        selectedIds={selectedPredecessorTaskIds}
                                        onChange={setSelectedPredecessorTaskIds}
                                        inputClassName={fieldClass}
                                    />
                                </div>
                            </div>
                        </aside>
                    </div>
                    
                    <div className="mt-8 space-y-4 border-t border-gray-200 pt-6">
                        <div className="flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                id="isRecurringTask" 
                                checked={isRecurring} 
                                onChange={(e) => setIsRecurring(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="isRecurringTask" className="text-sm font-medium text-gray-600">{t('taskModal.repeat')}</label>
                        </div>

                        {isRecurring && (
                            <div className="ml-0 space-y-4 rounded-lg border border-gray-200 bg-gray-50/80 p-4 sm:ml-6">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className={labelClass}>{t('taskModal.pattern')}</label>
                                        <select 
                                            value={recurrencePattern} 
                                            onChange={(e) => setRecurrencePattern(e.target.value)}
                                            className={selectClass}
                                        >
                                            <option value="daily">{t('taskModal.pattern_daily')}</option>
                                            <option value="weekly">{t('taskModal.pattern_weekly')}</option>
                                            <option value="monthly">{t('taskModal.pattern_monthly')}</option>
                                            <option value="yearly">{t('taskModal.pattern_yearly')}</option>
                                            <option value="weekdays">{t('taskModal.pattern_weekdays')}</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className={labelClass}>{t('taskModal.repeat_every')}</label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                min="1" 
                                                value={recurrenceInterval} 
                                                onChange={(e) => setRecurrenceInterval(parseInt(e.target.value, 10) || 1)}
                                                className={`${fieldClass} w-20`}
                                            />
                                            <span className="text-sm text-gray-600">
                                                {recurrencePattern === 'daily' ? t('taskModal.interval_day') : 
                                                 recurrencePattern === 'weekly' ? t('taskModal.interval_week') :
                                                 recurrencePattern === 'monthly' ? t('taskModal.interval_month') :
                                                 recurrencePattern === 'yearly' ? t('taskModal.interval_year') : t('taskModal.interval_time')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {recurrencePattern === 'weekly' && (
                                    <div>
                                        <label className={`${labelClass} mb-2`}>{t('taskModal.days_of_week')}</label>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { value: 0, label: t('taskModal.day_sun') },
                                                { value: 1, label: t('taskModal.day_mon') },
                                                { value: 2, label: t('taskModal.day_tue') },
                                                { value: 3, label: t('taskModal.day_wed') },
                                                { value: 4, label: t('taskModal.day_thu') },
                                                { value: 5, label: t('taskModal.day_fri') },
                                                { value: 6, label: t('taskModal.day_sat') }
                                            ].map(day => (
                                                <button
                                                    key={day.value}
                                                    type="button"
                                                    onClick={() => {
                                                        if (recurrenceDaysOfWeek.includes(day.value)) {
                                                            setRecurrenceDaysOfWeek(recurrenceDaysOfWeek.filter(d => d !== day.value));
                                                        } else {
                                                            setRecurrenceDaysOfWeek([...recurrenceDaysOfWeek, day.value].sort());
                                                        }
                                                    }}
                                                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                                                        recurrenceDaysOfWeek.includes(day.value)
                                                            ? 'bg-blue-600 text-white'
                                                            : 'border border-gray-200 bg-white text-gray-700 shadow-xs hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {day.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className={labelClass}>{t('taskModal.recurrence_end')}</label>
                                    <select 
                                        value={recurrenceEndType} 
                                        onChange={(e) => setRecurrenceEndType(e.target.value)}
                                        className={`${selectClass} mb-2`}
                                    >
                                        <option value="never">{t('taskModal.recurrence_never')}</option>
                                        <option value="until">{t('taskModal.recurrence_until')}</option>
                                        <option value="after">{t('taskModal.recurrence_after')}</option>
                                    </select>

                                    {recurrenceEndType === 'until' && (
                                        <DateDropdown
                                            value={recurrenceEndDate}
                                            onChange={setRecurrenceEndDate}
                                            label={t('taskModal.until_date')}
                                            className="mt-1"
                                            compact
                                        />
                                    )}

                                    {recurrenceEndType === 'after' && (
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                min="1" 
                                                value={recurrenceOccurrences} 
                                                onChange={(e) => setRecurrenceOccurrences(parseInt(e.target.value, 10) || 1)}
                                                className={`${fieldClass} w-24`}
                                                required
                                            />
                                            <span className="text-sm text-gray-600">{t('taskModal.occurrences')}</span>
                                        </div>
                                    )}
                                </div>
                                
                                <p className="text-xs text-gray-500">
                                    {t('taskModal.recurrence_auto_create_hint')}
                                </p>
                            </div>
                        )}
                    </div>
                    
                    <div className="mt-8 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-xs transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <>
                                    <LoadingSpinner size="sm" text="" />
                                    {t('taskModal.saving')}
                                </>
                            ) : (
                                t('taskModal.add_task')
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default TaskModal;
