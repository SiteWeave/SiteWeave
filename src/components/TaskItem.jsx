import React, { useState, memo, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import PermissionGuard from './PermissionGuard';
import DateRangePicker from './DateRangePicker';
import { addDaysIso, localDateIso } from '../utils/dateHelpers';
import { normalizeAssigneePhone } from '@siteweave/core-logic';

/** @typedef {null | 'dates' | 'assign' | 'title'} TaskPanel */


const TaskItem = memo(function TaskItem({
    task,
    onEdit,
    onDelete,
    isSelected,
    onSelect,
    onOpenPhotos,
    onOpenDiscussion = null,
    projectPhases = [],
    assignableContacts = [],
    dependencyMeta = null,
    onOpenDependencyDrawer,
    onPingAssignee = null,
    onRequestAssigneeSmsConsent = null,
    pingingTaskId = null,
    project = null,
}) {
    const { i18n } = useTranslation();
    /** @type {[TaskPanel, (p: TaskPanel) => void]} */
    const [panel, setPanel] = useState(null);
    const [draftStart, setDraftStart] = useState(task.start_date || '');
    const [draftDue, setDraftDue] = useState(task.due_date || '');
    const [editTitle, setEditTitle] = useState(task.text);
    const [editPhaseId, setEditPhaseId] = useState(task.project_phase_id || '');
    const [editAssigneeId, setEditAssigneeId] = useState(task.assignee_id || '');
    const [editAssigneeEmail, setEditAssigneeEmail] = useState(task.contacts?.email || '');
    const [editAssigneePhone, setEditAssigneePhone] = useState(String(task.contacts?.phone || '').trim());
    const [editPriority, setEditPriority] = useState(task.priority);
    const [showAllPredecessors, setShowAllPredecessors] = useState(false);

    const rootRef = useRef(null);
    const suppressRowDragRef = useRef(false);

    const syncDraftsFromTask = useCallback(() => {
        setDraftStart(task.start_date || '');
        setDraftDue(task.due_date || '');
        setEditTitle(task.text);
        setEditPhaseId(task.project_phase_id || '');
        setEditAssigneeId(task.assignee_id || '');
        setEditAssigneeEmail(task.contacts?.email || '');
        setEditAssigneePhone(String(task.contacts?.phone || '').trim());
        setEditPriority(task.priority);
    }, [task]);

    useEffect(() => {
        if (!panel) {
            syncDraftsFromTask();
        }
    }, [task, panel, syncDraftsFromTask]);

    useEffect(() => {
        if (!panel) return undefined;
        const onDocMouseDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                setPanel(null);
            }
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [panel]);

    useEffect(() => {
        if (!panel) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') setPanel(null);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [panel]);

    const priorityClasses = {
        High: 'bg-red-100 text-red-700',
        Medium: 'bg-yellow-100 text-yellow-700',
        Low: 'bg-blue-100 text-blue-700',
    };

    const formatDateShort = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
    };

    const dateLine = () => {
        if (task.start_date && task.due_date) {
            return `${formatDateShort(task.start_date)} – ${formatDateShort(task.due_date)}`;
        }
        if (task.due_date) return formatDateShort(task.due_date);
        if (task.start_date) return formatDateShort(task.start_date);
        return 'No dates';
    };
    const progressPercent = Math.max(0, Math.min(100, Number(task.percent_complete ?? (task.completed ? 100 : 0)) || 0));
    const isComplete = task.completed || progressPercent >= 100;

    const daysSelected = () => {
        if (!draftStart || !draftDue) return null;
        const diff = Math.round(
            (new Date(`${draftDue}T00:00:00`) - new Date(`${draftStart}T00:00:00`)) / (24 * 60 * 60 * 1000)
        );
        return diff >= 0 ? diff + 1 : null;
    };

    const dateRangePresets = useMemo(
        () => (
            <>
                <button
                    type="button"
                    onClick={() => {
                        const t = localDateIso();
                        setDraftStart(t);
                        setDraftDue(t);
                    }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                >
                    Today
                </button>
                <button
                    type="button"
                    onClick={() => {
                        const t = localDateIso();
                        setDraftStart((s) => s || t);
                        setDraftDue(addDaysIso(t, 7) || t);
                    }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                >
                    +1 week
                </button>
                <button
                    type="button"
                    onClick={() => {
                        const t = localDateIso();
                        setDraftStart((s) => s || t);
                        setDraftDue(addDaysIso(t, 14) || t);
                    }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                >
                    +2 weeks
                </button>
            </>
        ),
        []
    );

    const photoCount = task.task_photos?.length || 0;

    const stop = (e) => e.stopPropagation();

    const restoreRowDrag = useCallback(() => {
        suppressRowDragRef.current = false;
        if (rootRef.current) {
            rootRef.current.draggable = true;
        }
        document.removeEventListener('mouseup', restoreRowDrag);
        document.removeEventListener('touchend', restoreRowDrag);
        document.removeEventListener('touchcancel', restoreRowDrag);
    }, []);

    const suppressRowDrag = useCallback((e) => {
        e.stopPropagation();
        suppressRowDragRef.current = true;
        if (rootRef.current) {
            rootRef.current.draggable = false;
        }
        document.addEventListener('mouseup', restoreRowDrag, { once: true });
        document.addEventListener('touchend', restoreRowDrag, { once: true });
        document.addEventListener('touchcancel', restoreRowDrag, { once: true });
    }, [restoreRowDrag]);

    /**
     * When the row is draggable, selecting text in the percent field can start a task drag.
     * `dragstart.target` is often the <li>, not the input, so use composedPath() to see where
     * the pointer actually was (per HTML drag-and-drop hit testing).
     */
    const handleTaskRowDragStart = (e) => {
        if (suppressRowDragRef.current) {
            e.preventDefault();
            return;
        }
        const path =
            typeof e.nativeEvent?.composedPath === 'function' ? e.nativeEvent.composedPath() : [e.target];
        for (const node of path) {
            if (node === e.currentTarget) break;
            if (
                node &&
                node.nodeType === Node.ELEMENT_NODE &&
                typeof node.matches === 'function' &&
                node.matches(
                    'input, textarea, select, option, button, [contenteditable="true"], a[href]',
                )
            ) {
                e.preventDefault();
                return;
            }
        }
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const openPanel = (which) => (e) => {
        e?.stopPropagation?.();
        syncDraftsFromTask();
        setPanel((prev) => (prev === which ? null : which));
    };

    const saveDates = () => {
        onEdit(task.id, {
            start_date: draftStart || null,
            due_date: draftDue || null,
        });
        setPanel(null);
    };

    const clearDates = () => {
        onEdit(task.id, { start_date: null, due_date: null });
        setPanel(null);
    };

    const saveTitle = () => {
        const trimmed = editTitle.trim();
        if (!trimmed) return;
        onEdit(task.id, { text: trimmed });
        setPanel(null);
    };

    const saveAssign = () => {
        const validAssignee =
            editAssigneeId && assignableContacts.some((c) => c.id === editAssigneeId) ? editAssigneeId : null;
        const normalizedAssigneeEmail = String(editAssigneeEmail || '').trim().toLowerCase();
        const trimmedAssigneePhone = String(editAssigneePhone || '').trim();
        onEdit(task.id, {
            assignee_id: validAssignee,
            assignee_email: validAssignee ? null : (normalizedAssigneeEmail || null),
            assignee_phone: validAssignee ? null : (trimmedAssigneePhone || null),
            priority: editPriority,
        });
        setPanel(null);
    };

    const depWarningCount =
        (dependencyMeta?.warning?.unmetPredecessors?.length ? 1 : 0) +
        (dependencyMeta?.warning?.startDateConflict ? 1 : 0);
    const depTooltip = [
        dependencyMeta?.warning?.unmetPredecessors?.length
            ? `Waiting on: ${dependencyMeta.warning.unmetPredecessors.map((r) => r.text).join(', ')}`
            : null,
        dependencyMeta?.warning?.startDateConflict
            ? `Date conflict — earliest start ${dependencyMeta.warning.earliestAllowedStart}.`
            : null,
    ]
        .filter(Boolean)
        .join(' · ');

    const formatAssigneePhone = (phone) => {
        const raw = String(phone || '').trim();
        if (!raw) return '';
        const digits = raw.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) {
            return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
        }
        if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
        return raw;
    };

    const selectedAssigneeContact = useMemo(() => {
        if (task.contacts) return task.contacts;
        if (!task.assignee_id) return null;
        return assignableContacts.find((contact) => contact.id === task.assignee_id) || null;
    }, [task.contacts, task.assignee_id, assignableContacts]);
    const assigneeName = String(selectedAssigneeContact?.name || '').trim();
    const assigneeEmail = String(selectedAssigneeContact?.email || '').trim();
    const assigneePhoneDisplay = formatAssigneePhone(selectedAssigneeContact?.phone);
    const assigneePhoneNorm = normalizeAssigneePhone(String(selectedAssigneeContact?.phone || '').trim(), {
        defaultRegion: 'US',
    });
    const assigneePhoneOkPing = assigneePhoneNorm.isValid;
    const smsConsent = task.assignee_sms_consent ?? null;
    const smsPingAllowed = assigneePhoneOkPing && smsConsent === 'confirmed';
    const smsConsentBlocked = assigneePhoneOkPing && smsConsent === 'opted_out';
    const looksLikePlaceholderName =
        /^assignee?\b/i.test(assigneeName) ||
        /^external assignee\b/i.test(assigneeName) ||
        /^asignado\s*\(/i.test(assigneeName);
    const assigneeDisplay = (
        assigneeName && !looksLikePlaceholderName ? assigneeName : ''
    ) || assigneeEmail || assigneePhoneDisplay || assigneeName || null;
    const assigneeLabel = assigneeDisplay || 'Assign';
    const predecessors = dependencyMeta?.predecessors || [];
    const successors = dependencyMeta?.successors || [];
    const depCount = predecessors.length + successors.length;
    const unmetCount = dependencyMeta?.warning?.unmetPredecessors?.length || 0;

    const visiblePredecessors = useMemo(() => (
        showAllPredecessors ? predecessors : predecessors.slice(0, 3)
    ), [predecessors, showAllPredecessors]);

    const getInitials = (name) => {
        if (!name) return '';
        return name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase())
            .join('');
    };

    const dependencyChip = (linkedTask, tone) => {
        const initials = getInitials(linkedTask.contacts?.name);
        return (
            <span
                key={linkedTask.id}
                className={`inline-flex max-w-[200px] items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
                    tone === 'complete'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : tone === 'blocked'
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-gray-200 bg-gray-50 text-gray-700'
                }`}
                title={linkedTask.text}
            >
                {initials && (
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-semibold text-gray-700">
                        {initials}
                    </span>
                )}
                <span className="min-w-0 truncate">{linkedTask.text}</span>
            </span>
        );
    };

    return (
        <li
            ref={rootRef}
            draggable
            onDragStart={handleTaskRowDragStart}
            className={`group relative transition-colors animate-slide-in border-b border-gray-100 last:border-b-0 ${
                isSelected ? 'bg-blue-50/80' : ''
            } ${isComplete ? 'bg-green-50/40' : 'bg-white hover:bg-gray-50/80'}`}
            role="listitem"
            aria-label={`Task: ${task.text}, Priority: ${task.priority}, ${dateLine()}`}
            onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    onSelect?.(task.id);
                }
            }}
        >
            <div className="px-2 py-2.5 sm:px-3">

                {/* ── Row 1: What ── */}
                <div className="flex items-start justify-between gap-3">
                    {/* Left: checkbox + task name */}
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <div className="flex items-center gap-1">
                            {unmetCount > 0 && !isComplete && (
                                <Icon
                                    path="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 0h10.5A1.5 1.5 0 0118.75 12v7.5A1.5 1.5 0 0117.25 21h-10.5A1.5 1.5 0 015.25 19.5V12a1.5 1.5 0 011.5-1.5z"
                                    className="h-3.5 w-3.5 shrink-0 text-amber-600"
                                />
                            )}
                            <PermissionGuard
                                permission="can_edit_tasks"
                                fallback={
                                    <span className="shrink-0 tabular-nums text-xs font-semibold text-gray-600 w-12 text-right" title="Percent complete">
                                        {progressPercent}%
                                    </span>
                                }
                            >
                                <label
                                    className="flex shrink-0 items-center gap-0.5"
                                    title="Percent complete (100% marks done)"
                                    onClick={stop}
                                    onMouseDown={suppressRowDrag}
                                    onTouchStart={suppressRowDrag}
                                    onDragStart={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                >
                                    <input
                                        type="number"
                                        draggable={false}
                                        min="0"
                                        max="100"
                                        value={progressPercent}
                                        onChange={(e) => {
                                            const bounded = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                            onEdit(task.id, {
                                                percent_complete: bounded,
                                                completed: bounded >= 100,
                                            });
                                        }}
                                        className="h-7 w-14 shrink-0 select-text rounded border border-gray-300 px-1 text-xs text-gray-800 [-moz-appearance:textfield] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        aria-label={`Percent complete for ${task.text}`}
                                    />
                                    <span className="text-[11px] text-gray-500">%</span>
                                </label>
                            </PermissionGuard>
                        </div>
                        <PermissionGuard
                            permission="can_edit_tasks"
                            fallback={
                                <span
                                    className={`ui-clamp-2 font-semibold text-sm sm:text-base leading-snug ${
                                        isComplete ? 'line-through text-gray-400' : 'text-gray-900'
                                    }`}
                                >
                                    {task.text}
                                </span>
                            }
                        >
                            <button
                                type="button"
                                onClick={openPanel('title')}
                                className={`ui-clamp-2 text-left font-semibold text-sm sm:text-base leading-snug hover:text-blue-700 focus:outline-none ${
                                    isComplete ? 'line-through text-gray-400' : 'text-gray-900'
                                }`}
                                title="Click to rename"
                            >
                                {task.text}
                            </button>
                        </PermissionGuard>
                    </div>

                    {/* Right: priority badge */}
                    <div className="mt-0.5 shrink-0 flex items-center gap-1.5">
                        <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                priorityClasses[task.priority] || priorityClasses.Medium
                            }`}
                        >
                            {task.priority}
                        </span>
                    </div>
                </div>

                {/* ── Row 2: When & Actions ── */}
                <div className="mt-1.5 ml-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:ml-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                        <PermissionGuard
                            permission="can_edit_tasks"
                            fallback={
                                <span className={`tabular-nums ${isComplete ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {dateLine()}
                                </span>
                            }
                        >
                            <button
                                type="button"
                                onClick={openPanel('dates')}
                                className={`tabular-nums rounded px-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                    isComplete ? 'text-gray-400' : 'text-gray-500 hover:text-blue-600 hover:underline underline-offset-2'
                                }`}
                                title="Set dates"
                            >
                                {dateLine()}
                            </button>
                        </PermissionGuard>
                            {predecessors.length > 0 && (
                                <>
                                    <span className="text-gray-300">|</span>
                                    <span className={`font-medium ${unmetCount > 0 ? 'text-amber-700' : 'text-gray-600'}`}>Blocked by:</span>
                                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                                        {visiblePredecessors.map((dep) => dependencyChip(
                                            dep.predecessorTask || { id: dep.id, text: 'Unknown task', contacts: null, completed: false },
                                            dep.predecessorTask?.completed ? 'complete' : 'blocked'
                                        ))}
                                        {!showAllPredecessors && predecessors.length > 3 && (
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setShowAllPredecessors(true);
                                                }}
                                                className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                                            >
                                                +{predecessors.length - 3} more
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                            {predecessors.length === 0 && successors.length > 0 && (
                                <>
                                    <span className="text-gray-300">|</span>
                                    <span className="font-medium text-gray-600">Unlocks:</span>
                                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                                        {successors.slice(0, 2).map((dep) => dependencyChip(
                                            dep.successorTask || { id: dep.id, text: 'Unknown task', contacts: null, completed: false },
                                            dep.successorTask?.completed ? 'complete' : 'neutral'
                                        ))}
                                        {successors.length > 2 && (
                                            <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600">
                                                +{successors.length - 2} more
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex shrink-0 flex-wrap items-center gap-0.5 sm:justify-end sm:gap-1">
                        {/* Photos */}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onOpenPhotos?.(task.id); }}
                            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                            title="Photos"
                            aria-label={`Photos for ${task.text}`}
                        >
                            <Icon
                                path="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008H12V8.25Z"
                                className="h-3.5 w-3.5 shrink-0"
                            />
                            <span className="hidden sm:inline">
                                {photoCount > 0 ? `Photos (${photoCount > 9 ? '9+' : photoCount})` : 'Photos'}
                            </span>
                            {photoCount > 0 && (
                                <span className="sm:hidden flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-600 px-0.5 text-[9px] font-bold text-white">
                                    {photoCount > 9 ? '9+' : photoCount}
                                </span>
                            )}
                        </button>

                        {/* Dependencies */}
                        <PermissionGuard
                            permission="can_edit_tasks"
                            fallback={
                                <span
                                    className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs ${
                                        depWarningCount > 0 ? 'text-amber-600' : 'text-gray-400'
                                    }`}
                                    title={depTooltip || 'Dependencies'}
                                >
                                    <Icon
                                        path="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                                        className="h-3.5 w-3.5 shrink-0"
                                    />
                                    <span className="hidden sm:inline">
                                        {depCount > 0 ? `Deps (${depCount})` : 'Deps'}
                                    </span>
                                </span>
                            }
                        >
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenDependencyDrawer?.(task.id);
                                }}
                                className={`relative flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-gray-100 ${
                                    depWarningCount > 0
                                        ? 'text-amber-600 hover:text-amber-800'
                                        : 'text-gray-500 hover:text-gray-800'
                                }`}
                                title={depTooltip || 'Dependencies'}
                                aria-label="Task dependencies"
                            >
                                <Icon
                                    path="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                                    className="h-3.5 w-3.5 shrink-0"
                                />
                                <span className="hidden sm:inline">
                                    {depCount > 0 ? `Deps (${depCount})` : 'Deps'}
                                </span>
                                {depWarningCount > 0 && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                )}
                            </button>
                        </PermissionGuard>

                        {/* Discussion */}
                        {onOpenDiscussion && project && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenDiscussion(task.id);
                                }}
                                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                                title="Discussion"
                                aria-label={`Discussion for ${task.text}`}
                            >
                                <Icon
                                    path="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                    className="h-3.5 w-3.5 shrink-0"
                                />
                                <span className="hidden sm:inline">Discussion</span>
                            </button>
                        )}

                        {/* Assignee */}
                        <PermissionGuard
                            permission="can_edit_tasks"
                            fallback={
                                <span
                                    className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs ${
                                        assigneeDisplay ? 'text-gray-600' : 'text-gray-400'
                                    }`}
                                    title={assigneeDisplay ? `Assigned: ${assigneeDisplay}` : 'Unassigned'}
                                >
                                    <Icon
                                        path="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.433-3.059M4.318 18.318a9.38 9.38 0 01-.372-2.625 9.337 9.337 0 01.952-4.121 4.125 4.125 0 017.433 3.059M12 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z"
                                        className="h-3.5 w-3.5 shrink-0"
                                    />
                                    <span className="hidden sm:inline max-w-[96px] ui-ellipsis-1">{assigneeDisplay || 'Assign'}</span>
                                </span>
                            }
                        >
                            <button
                                type="button"
                                onClick={openPanel('assign')}
                                className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-gray-100 ${
                                    assigneeName
                                        ? 'text-gray-600 hover:text-gray-900'
                                        : 'text-gray-400 hover:text-gray-600'
                                }`}
                                title={assigneeDisplay ? `Assigned: ${assigneeDisplay} — click to change` : 'Assign task'}
                                aria-label="Assignment"
                            >
                                <Icon
                                    path="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.433-3.059M4.318 18.318a9.38 9.38 0 01-.372-2.625 9.337 9.337 0 01.952-4.121 4.125 4.125 0 017.433 3.059M12 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z"
                                    className="h-3.5 w-3.5 shrink-0"
                                />
                                <span className="hidden sm:inline max-w-[96px] ui-ellipsis-1">{assigneeLabel}</span>
                            </button>
                        </PermissionGuard>

                        {onPingAssignee &&
                            task.assignee_id &&
                            (
                                (assigneeEmail && assigneeEmail.includes('@')) ||
                                Boolean(String(selectedAssigneeContact?.phone || '').trim())
                            ) && (
                                <PermissionGuard permission="can_assign_tasks">
                                    <div className="flex shrink-0 items-center gap-0.5">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onPingAssignee(task);
                                            }}
                                            disabled={pingingTaskId === task.id}
                                            className="relative flex shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-500 shadow-xs hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                            title={
                                                assigneePhoneOkPing && smsConsent !== 'confirmed' && !smsConsentBlocked
                                                    ? 'Sends email now; SMS only after assignee replies YES (use consent buttons).'
                                                    : 'Send a reminder to the assignee now'
                                            }
                                            aria-label={`Ping assignee for task: ${task.text}`}
                                        >
                                            <Icon
                                                path="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405z"
                                                className="h-3.5 w-3.5 shrink-0"
                                            />
                                            <span className="hidden sm:inline">Ping</span>
                                        </button>
                                        {onRequestAssigneeSmsConsent &&
                                            assigneePhoneOkPing &&
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
                                                    className="flex shrink-0 items-center rounded-md border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                                                    title="Send SMS consent"
                                                >
                                                    SMS OK?
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
                                                    className="flex shrink-0 items-center rounded-md border border-gray-200 bg-white px-1 py-0.5 text-[10px] text-gray-600 hover:border-blue-200 disabled:opacity-50"
                                                    title="Resend consent (24h limit)"
                                                >
                                                    Resend
                                                </button>
                                            )}
                                    </div>
                                </PermissionGuard>
                            )}

                        {/* Delete */}
                        <PermissionGuard permission="can_delete_tasks">
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                                className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete task"
                                aria-label={`Delete task: ${task.text}`}
                            >
                                <Icon
                                    path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                    className="h-3.5 w-3.5"
                                />
                            </button>
                        </PermissionGuard>
                    </div>
                </div>

                {/* ── Date popover ── */}
                {panel === 'dates' && (
                    <PermissionGuard permission="can_edit_tasks">
                        <div
                            className="mt-2 overflow-visible rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-md space-y-2"
                            onClick={stop}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-gray-700">Set dates</span>
                                {daysSelected() !== null && (
                                    <span className="shrink-0 text-[10px] text-gray-400">
                                        {daysSelected()} day{daysSelected() === 1 ? '' : 's'}
                                    </span>
                                )}
                            </div>
                            <DateRangePicker
                                size="sm"
                                compact
                                label="Schedule"
                                startValue={draftStart}
                                endValue={draftDue}
                                onChange={({ start, end }) => {
                                    setDraftStart(start);
                                    setDraftDue(end);
                                }}
                                presets={dateRangePresets}
                            />
                            <div className="flex items-center justify-between gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={clearDates}
                                    className="text-[10px] text-gray-400 hover:text-red-600 underline underline-offset-2"
                                >
                                    Clear dates
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={saveDates}
                                        className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                                    >
                                        Apply
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPanel(null)}
                                        className="rounded-md bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </PermissionGuard>
                )}

                {/* ── Assign panel ── */}
                {panel === 'assign' && (
                    <PermissionGuard permission="can_edit_tasks">
                        <div
                            className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm select-text"
                            onClick={stop}
                            onMouseDown={suppressRowDrag}
                            onTouchStart={suppressRowDrag}
                            onDragStart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                        >
                            <p className="text-xs font-semibold text-gray-800">Assignment</p>
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[96px_minmax(180px,1fr)_minmax(220px,1.2fr)_minmax(170px,1fr)] lg:items-end">
                                <label className="block text-xs text-gray-600">
                                    Priority
                                    <select
                                        value={editPriority}
                                        onChange={(e) => setEditPriority(e.target.value)}
                                        className="mt-0.5 w-full rounded border border-gray-300 bg-white p-1.5 text-sm"
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                </label>
                                <PermissionGuard permission="can_assign_tasks">
                                    <label className="block text-xs text-gray-600">
                                        Assignee
                                        <select
                                            value={editAssigneeId}
                                            onChange={(e) => {
                                                setEditAssigneeId(e.target.value);
                                                if (e.target.value) {
                                                    setEditAssigneeEmail('');
                                                    setEditAssigneePhone('');
                                                }
                                            }}
                                            className="mt-0.5 w-full rounded border border-gray-300 bg-white p-1.5 text-sm"
                                        >
                                            <option value="">Unassigned</option>
                                            {assignableContacts.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </PermissionGuard>
                                <PermissionGuard permission="can_assign_tasks">
                                    <label className="block text-xs text-gray-600">
                                        Assignee email
                                        <input
                                            type="email"
                                            value={editAssigneeEmail}
                                            onChange={(e) => {
                                                setEditAssigneeEmail(e.target.value);
                                                if (e.target.value.trim()) {
                                                    setEditAssigneeId('');
                                                }
                                            }}
                                            className="mt-0.5 w-full rounded border border-gray-300 bg-white p-1.5 text-sm"
                                            placeholder="name@example.com"
                                        />
                                    </label>
                                    <label className="block text-xs text-gray-600">
                                        Assignee phone
                                        <input
                                            type="tel"
                                            inputMode="tel"
                                            autoComplete="tel"
                                            value={editAssigneePhone}
                                            onChange={(e) => {
                                                setEditAssigneePhone(formatAssigneePhone(e.target.value));
                                                if (e.target.value.trim()) {
                                                    setEditAssigneeId('');
                                                }
                                            }}
                                            className="mt-0.5 w-full rounded border border-gray-300 bg-white p-1.5 text-sm"
                                            placeholder="(555) 123-4567"
                                        />
                                    </label>
                                </PermissionGuard>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={saveAssign}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPanel(null)}
                                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </PermissionGuard>
                )}

                {/* ── Title rename panel ── */}
                {panel === 'title' && (
                    <PermissionGuard permission="can_edit_tasks">
                        <div
                            className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm select-text"
                            onClick={stop}
                            onMouseDown={suppressRowDrag}
                            onTouchStart={suppressRowDrag}
                            onDragStart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                        >
                            <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); }}
                                className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={saveTitle}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                onClick={() => setPanel(null)}
                                className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                        </div>
                    </PermissionGuard>
                )}
            </div>
        </li>
    );
});

export default TaskItem;
