import React, { useState, memo, useMemo, useCallback, useEffect, useRef } from 'react';
import Icon from './Icon';
import DateRangePicker from './DateRangePicker';
import PermissionGuard from './PermissionGuard';
import { addDaysIso, localDateIso } from '../utils/dateHelpers';
import Avatar from './Avatar';
import { normalizeAssigneePhone } from '@siteweave/core-logic';

const PERCENT_PRESETS = [0, 25, 50, 75, 100];

const percentFieldClass =
  'w-16 select-text rounded border border-gray-200 bg-white px-2 py-0.5 text-xs tabular-nums text-gray-700 [-moz-appearance:textfield] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const TaskItem = memo(function TaskItem({
    task,
    onEdit,
    onDelete,
    isSelected,
    onSelect,
    onOpenPhotos = null,
    onOpenDiscussion = null,
    onPingAssignee = null,
    onRequestAssigneeSmsConsent = null,
    pingingTaskId = null,
    project = null,
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [isAssigning, setIsAssigning] = useState(false);
    const [editText, setEditText] = useState(task.text);
    const [editStartDate, setEditStartDate] = useState(task.start_date || '');
    const [editDueDate, setEditDueDate] = useState(task.due_date || '');
    const [editPriority, setEditPriority] = useState(task.priority);
    const [editAssigneeEmail, setEditAssigneeEmail] = useState(task.contacts?.email || '');
    const [editAssigneePhone, setEditAssigneePhone] = useState(task.contacts?.phone || '');
    const [assignAssigneeEmail, setAssignAssigneeEmail] = useState(task.contacts?.email || '');
    const [assignAssigneePhone, setAssignAssigneePhone] = useState(task.contacts?.phone || '');
    
    
    const priorityClasses = {
        High: 'bg-red-100 text-red-700', 
        Medium: 'bg-yellow-100 text-yellow-700', 
        Low: 'bg-blue-100 text-blue-700'
    };
    
    const formatDate = (dateString) => {
        if (!dateString) return 'No due date';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };
    const progressPercent = Math.max(0, Math.min(100, Number(task.percent_complete ?? (task.completed ? 100 : 0)) || 0));
    const isComplete = task.completed || progressPercent >= 100;

    const assigneeEmailOk = Boolean(task.contacts?.email && String(task.contacts.email).includes('@'));
    const assigneePhoneNorm = normalizeAssigneePhone(String(task.contacts?.phone || '').trim(), { defaultRegion: 'US' });
    const assigneePhoneOk = assigneePhoneNorm.isValid;
    const smsConsent = task.assignee_sms_consent ?? null;
    const smsPingAllowed = assigneePhoneOk && smsConsent === 'confirmed';
    const smsConsentBlocked = assigneePhoneOk && smsConsent === 'opted_out';

    /** null = show committed value from task; string = in-progress edit */
    const [percentDraft, setPercentDraft] = useState(null);
    const skipPercentBlurCommitRef = useRef(false);

    const commitPercentDraft = useCallback(() => {
        const raw = percentDraft !== null ? percentDraft : String(progressPercent);
        const n = Math.max(0, Math.min(100, parseInt(String(raw).trim(), 10) || 0));
        if (n !== progressPercent) {
            onEdit(task.id, {
                percent_complete: n,
                completed: n >= 100,
            });
        }
        setPercentDraft(null);
    }, [percentDraft, progressPercent, task.id, onEdit]);

    const cancelPercentDraft = useCallback(() => {
        setPercentDraft(null);
    }, []);

    useEffect(() => {
        setPercentDraft(null);
        setIsAssigning(false);
        const em = task.contacts?.email || '';
        const ph = task.contacts?.phone || '';
        setAssignAssigneeEmail(em);
        setAssignAssigneePhone(ph);
        setEditAssigneeEmail(em);
        setEditAssigneePhone(ph);
    }, [task.id, task.assignee_id, task.contacts?.email, task.contacts?.phone]);

    const handleSaveAssign = () => {
        const normalizedAssigneeEmail = String(assignAssigneeEmail || '').trim().toLowerCase();
        const trimmedAssigneePhone = String(assignAssigneePhone || '').trim();
        onEdit(task.id, {
            assignee_id: (!normalizedAssigneeEmail && !trimmedAssigneePhone) ? null : undefined,
            assignee_email: normalizedAssigneeEmail || null,
            assignee_phone: trimmedAssigneePhone || null,
        });
        setIsAssigning(false);
    };

    const handleCancelAssign = () => {
        setAssignAssigneeEmail(task.contacts?.email || '');
        setAssignAssigneePhone(task.contacts?.phone || '');
        setIsAssigning(false);
    };

    const handleSaveEdit = () => {
        const normalizedAssigneeEmail = String(editAssigneeEmail || '').trim().toLowerCase();
        const trimmedAssigneePhone = String(editAssigneePhone || '').trim();
        onEdit(task.id, {
            text: editText,
            start_date: editStartDate || null,
            due_date: editDueDate || null,
            priority: editPriority,
            assignee_email: normalizedAssigneeEmail || null,
            assignee_phone: trimmedAssigneePhone || null,
        });
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditText(task.text);
        setEditStartDate(task.start_date || '');
        setEditDueDate(task.due_date || '');
        setEditPriority(task.priority);
        setEditAssigneeEmail(task.contacts?.email || '');
        setEditAssigneePhone(task.contacts?.phone || '');
        setIsEditing(false);
    };

    const dateRangePresets = useMemo(
        () => (
            <>
                <button
                    type="button"
                    onClick={() => {
                        const t = localDateIso();
                        setEditStartDate(t);
                        setEditDueDate(t);
                    }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                >
                    Today
                </button>
                <button
                    type="button"
                    onClick={() => {
                        const t = localDateIso();
                        setEditStartDate((s) => s || t);
                        setEditDueDate(addDaysIso(t, 7) || t);
                    }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                >
                    +1 week
                </button>
                <button
                    type="button"
                    onClick={() => {
                        const t = localDateIso();
                        setEditStartDate((s) => s || t);
                        setEditDueDate(addDaysIso(t, 14) || t);
                    }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                >
                    +2 weeks
                </button>
            </>
        ),
        []
    );

    if (isAssigning) {
        return (
            <li className="p-3 rounded-xl bg-indigo-50/90 border border-indigo-200 overflow-visible">
                <div className="space-y-3">
                    <p className="text-sm font-semibold text-gray-800">Assign task</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                            type="email"
                            value={assignAssigneeEmail}
                            onChange={(e) => setAssignAssigneeEmail(e.target.value)}
                            className="w-full p-2 border rounded-lg"
                            placeholder="Assignee email (optional)"
                        />
                        <input
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            value={assignAssigneePhone}
                            onChange={(e) => setAssignAssigneePhone(e.target.value)}
                            className="w-full p-2 border rounded-lg"
                            placeholder="Assignee phone (optional)"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSaveAssign}
                            className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                        >
                            Assign
                        </button>
                        <button
                            onClick={handleCancelAssign}
                            className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </li>
        );
    }

    if (isEditing) {
        return (
            <li className="p-3 rounded-xl bg-blue-50/90 border border-blue-200 overflow-visible">
                <div className="space-y-3">
                    <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full p-2 border rounded-lg"
                        placeholder="Task description"
                    />
                    <div className="overflow-visible">
                        <DateRangePicker
                            size="sm"
                            compact
                            label="Schedule"
                            startValue={editStartDate}
                            endValue={editDueDate}
                            onChange={({ start, end }) => {
                                setEditStartDate(start);
                                setEditDueDate(end);
                            }}
                            presets={dateRangePresets}
                        />
                    </div>
                    <div className="flex gap-3 items-end flex-wrap">
                        <select
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value)}
                            className="p-2 border rounded-lg bg-white h-[42px]"
                        >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                            type="email"
                            value={editAssigneeEmail}
                            onChange={(e) => setEditAssigneeEmail(e.target.value)}
                            className="w-full p-2 border rounded-lg"
                            placeholder="Assignee email (optional)"
                        />
                        <input
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            value={editAssigneePhone}
                            onChange={(e) => setEditAssigneePhone(e.target.value)}
                            className="w-full p-2 border rounded-lg"
                            placeholder="Assignee phone (optional)"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSaveEdit}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                            Save
                        </button>
                        <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </li>
        );
    }

    return (
        <li 
            className={`flex flex-col p-3 rounded-xl group transition-all animate-slide-in ${
                isSelected ? 'bg-blue-50 border border-blue-200' : isComplete ? '' : 'border border-slate-100 bg-white/80 hover:bg-slate-50'
            } ${isComplete ? 'bg-emerald-50/40 hover:bg-emerald-50/60 border-l-4 border-l-emerald-500' : ''}`}
            role="listitem"
            aria-label={`Task: ${task.text}, ${progressPercent}% complete, Priority: ${task.priority}, Start: ${formatDate(task.start_date)}, End: ${formatDate(task.due_date)}`}
        >
            <div className="flex items-center justify-between gap-3 min-w-0 w-full">
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <PermissionGuard
                    permission="can_edit_tasks"
                    fallback={
                        <span className="shrink-0 tabular-nums text-xs font-semibold text-gray-600 w-12 text-right" title="Percent complete">
                            {progressPercent}%
                        </span>
                    }
                >
                    <div className="flex shrink-0 flex-col gap-1" title="Percent complete (100% marks task done)">
                        <label className="flex items-center gap-1 text-xs text-gray-500">
                            <input
                                type="text"
                                draggable={false}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoComplete="off"
                                value={percentDraft !== null ? percentDraft : String(progressPercent)}
                                onFocus={() => setPercentDraft(String(progressPercent))}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    if (next !== '' && !/^\d+$/.test(next)) return;
                                    if (next.length > 3) return;
                                    if (next !== '' && Number(next) > 100) return;
                                    setPercentDraft(next);
                                }}
                                onBlur={() => {
                                    if (skipPercentBlurCommitRef.current) {
                                        skipPercentBlurCommitRef.current = false;
                                        return;
                                    }
                                    commitPercentDraft();
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        commitPercentDraft();
                                        e.currentTarget.blur();
                                    } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        skipPercentBlurCommitRef.current = true;
                                        cancelPercentDraft();
                                        e.currentTarget.blur();
                                    }
                                }}
                                className={percentFieldClass}
                                aria-label={`Percent complete for ${task.text}`}
                            />
                            <span className="text-gray-400">%</span>
                        </label>
                        <div className="flex max-w-[7.5rem] flex-nowrap gap-0.5 overflow-x-auto">
                            {PERCENT_PRESETS.map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onMouseDown={(ev) => ev.preventDefault()}
                                    onClick={(ev) => {
                                        ev.stopPropagation();
                                        onEdit(task.id, {
                                            percent_complete: p,
                                            completed: p >= 100,
                                        });
                                        setPercentDraft(null);
                                    }}
                                    className={`rounded px-1 py-0.5 text-[10px] font-medium tabular-nums transition-colors ${
                                        progressPercent === p
                                            ? 'bg-blue-600 text-white'
                                            : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                </PermissionGuard>
                <div className="flex-1 min-w-0">
                    <p className={`font-semibold transition-all ${isComplete ? 'line-through text-gray-400' : ''}`}>
                        {task.text}
                    </p>
                    <p className={`text-sm transition-all ${isComplete ? 'text-gray-400' : 'text-gray-500'}`}>
                        {task.start_date && <span>Start: {formatDate(task.start_date)}</span>}
                        {task.start_date && task.due_date && ' · '}
                        {task.due_date && <span>End: {formatDate(task.due_date)}</span>}
                        {!task.start_date && !task.due_date && 'No dates'}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
                <span className={`px-2 py-1 text-xs font-bold rounded-full ${priorityClasses[task.priority]}`}>{task.priority}</span>
                {task.contacts && (
                    task.contacts.avatar_url ? (
                        <img
                            src={task.contacts.avatar_url}
                            alt=""
                            title={task.contacts.name}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                    ) : (
                        <span title={task.contacts.name}>
                            <Avatar name={task.contacts.name} size="md" />
                        </span>
                    )
                )}
                {onPingAssignee && task.assignee_id && (assigneeEmailOk || assigneePhoneOk) && (
                        <PermissionGuard permission="can_assign_tasks">
                            <div className="flex shrink-0 items-center gap-0.5">
                                {assigneeEmailOk && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPingAssignee(task, 'email');
                                        }}
                                        disabled={pingingTaskId === task.id}
                                        className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-xs transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        title="Ping assignee by email"
                                        aria-label={`Ping assignee by email for task: ${task.text}`}
                                    >
                                        <Icon
                                            path="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                            className="h-4 w-4"
                                        />
                                    </button>
                                )}
                                {assigneePhoneOk && (
                                    <>
                                        {smsPingAllowed ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onPingAssignee(task, 'sms');
                                                }}
                                                disabled={pingingTaskId === task.id}
                                                className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-xs transition hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Ping assignee by SMS"
                                                aria-label={`Ping assignee by SMS for task: ${task.text}`}
                                            >
                                                <Icon
                                                    path="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.608-1.294.608H15a2.25 2.25 0 01-2.25-2.25v-9.75c0-1.24 1.01-2.25 2.25-2.25h.75c.525 0 1.012.232 1.294.608l.97 1.293c.271.362.733.527 1.173.417l4.423-1.105c.5-.125.852-.575.852-1.091V4.5A2.25 2.25 0 0019.5 2.25H17.25c-8.284 0-15 6.716-15 15z"
                                                    className="h-4 w-4"
                                                />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled
                                                className="shrink-0 cursor-not-allowed rounded-lg border border-gray-100 bg-gray-50 p-1.5 text-gray-300"
                                                title={
                                                    smsConsentBlocked
                                                        ? 'This number opted out of SMS.'
                                                        : 'Awaiting SMS consent — assignee must reply YES to the opt-in text.'
                                                }
                                                aria-label="SMS ping unavailable until consent"
                                            >
                                                <Icon
                                                    path="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.608-1.294.608H15a2.25 2.25 0 01-2.25-2.25v-9.75c0-1.24 1.01-2.25 2.25-2.25h.75c.525 0 1.012.232 1.294.608l.97 1.293c.271.362.733.527 1.173.417l4.423-1.105c.5-.125.852-.575.852-1.091V4.5A2.25 2.25 0 0019.5 2.25H17.25c-8.284 0-15 6.716-15 15z"
                                                    className="h-4 w-4"
                                                />
                                            </button>
                                        )}
                                        {onRequestAssigneeSmsConsent &&
                                            !smsPingAllowed &&
                                            !smsConsentBlocked &&
                                            smsConsent !== 'pending' && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRequestAssigneeSmsConsent(task, { forceResend: false });
                                                    }}
                                                    disabled={pingingTaskId === task.id}
                                                    className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-800 shadow-xs transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                    title="Send SMS consent request (reply YES required)"
                                                    aria-label={`Send SMS consent for task: ${task.text}`}
                                                >
                                                    <Icon
                                                        path="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                                        className="h-4 w-4"
                                                    />
                                                </button>
                                            )}
                                        {onRequestAssigneeSmsConsent &&
                                            smsConsent === 'pending' &&
                                            !smsConsentBlocked && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRequestAssigneeSmsConsent(task, { forceResend: true });
                                                    }}
                                                    disabled={pingingTaskId === task.id}
                                                    className="shrink-0 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-xs transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                    title="Resend consent SMS (max once per 24 hours)"
                                                    aria-label={`Resend SMS consent for task: ${task.text}`}
                                                >
                                                    <Icon
                                                        path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                                                        className="h-4 w-4"
                                                    />
                                                </button>
                                            )}
                                    </>
                                )}
                            </div>
                        </PermissionGuard>
                    )}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" role="group" aria-label="Task actions">
                    {onOpenPhotos && (
                        <button
                            onClick={() => onOpenPhotos(task.id)}
                            className="p-1 text-gray-500 hover:text-indigo-600"
                            title="Photos"
                            aria-label={`Photos for task: ${task.text}`}
                        >
                            <Icon path="M3 16.5V7.5A1.5 1.5 0 014.5 6h3.879a1.5 1.5 0 001.06-.44l1.122-1.12A1.5 1.5 0 0111.621 4H19.5A1.5 1.5 0 0121 5.5v11A1.5 1.5 0 0119.5 18h-15A1.5 1.5 0 013 16.5zM8.25 12.75l1.5 1.5 2.5-2.5 3 3" className="w-4 h-4" />
                        </button>
                    )}
                    {onOpenDiscussion && project && (
                        <button
                            onClick={() => onOpenDiscussion(task.id)}
                            className="p-1 text-gray-500 hover:text-indigo-600"
                            title="Discussion"
                            aria-label={`Discussion for task: ${task.text}`}
                        >
                            <Icon path="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" className="w-4 h-4" />
                        </button>
                    )}
                    <PermissionGuard permission="can_edit_tasks">
                        <button
                            onClick={() => {
                                setEditText(task.text);
                                setEditStartDate(task.start_date || '');
                                setEditDueDate(task.due_date || '');
                                setEditPriority(task.priority);
                                setEditAssigneeEmail(task.contacts?.email || '');
                                setEditAssigneePhone(task.contacts?.phone || '');
                                setIsEditing(true);
                            }}
                            className="p-1 text-gray-500 hover:text-blue-600"
                            title="Edit task"
                            aria-label={`Edit task: ${task.text}`}
                        >
                            <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-4 h-4" />
                        </button>
                    </PermissionGuard>
                    <PermissionGuard permission="can_assign_tasks">
                        <button
                            onClick={() => {
                                setAssignAssigneeEmail(task.contacts?.email || '');
                                setAssignAssigneePhone(task.contacts?.phone || '');
                                setIsAssigning(true);
                            }}
                            className="p-1 text-gray-500 hover:text-indigo-600"
                            title="Assign task"
                            aria-label={`Assign task: ${task.text}`}
                        >
                            <Icon path="M18 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM3.75 20.25a6.75 6.75 0 1113.5 0v.75H3.75v-.75zm14.25-8.25h3m-1.5-1.5v3" className="w-4 h-4" />
                        </button>
                    </PermissionGuard>
                    <PermissionGuard permission="can_delete_tasks">
                        <button
                            onClick={() => onDelete(task.id)}
                            className="p-1 text-gray-500 hover:text-red-600"
                            title="Delete task"
                            aria-label={`Delete task: ${task.text}`}
                        >
                            <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4" />
                        </button>
                    </PermissionGuard>
                </div>
            </div>
            </div>
        </li>
    );
});

export default TaskItem;