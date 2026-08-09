import React, { useState, memo, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import Avatar from './Avatar';
import InlineEditableText from './InlineEditableText';
import PermissionGuard from './PermissionGuard';
import DateRangePicker from './DateRangePicker';
import { addDaysIso, localDateIso, formatLocalDateOnly } from '../utils/dateHelpers';
import { normalizeAssigneePhone, isSmsNotificationsEnabled } from '@siteweave/core-logic';

/** @typedef {null | 'assign'} TaskPanel */


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
    pingLocked = false,
    onRequestAssigneeSmsConsent = null,
    onShareSmsConsentLink = null,
    onCopyGuestLink = null,
    pingingTaskId = null,
    project = null,
}) {
    const { i18n, t } = useTranslation();
    /** @type {[TaskPanel, (p: TaskPanel) => void]} */
    const [panel, setPanel] = useState(null);
    const [draftStart, setDraftStart] = useState(task.start_date || '');
    const [draftDue, setDraftDue] = useState(task.due_date || '');
    const [editPhaseId, setEditPhaseId] = useState(task.project_phase_id || '');
    const [editAssigneeId, setEditAssigneeId] = useState(task.assignee_id || '');
    const [editAssigneeEmail, setEditAssigneeEmail] = useState(task.contacts?.email || '');
    const [editAssigneePhone, setEditAssigneePhone] = useState(String(task.contacts?.phone || '').trim());
    const [editPriority, setEditPriority] = useState(task.priority);
    const [draftPercent, setDraftPercent] = useState(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [percentEditing, setPercentEditing] = useState(false);
    const [percentText, setPercentText] = useState('');
    const [hoverExpanded, setHoverExpanded] = useState(false);

    const rootRef = useRef(null);
    const suppressRowDragRef = useRef(false);
    const percentCommitLockRef = useRef(false);
    const confettiTimerRef = useRef(null);
    const percentInputRef = useRef(null);
    const hoverCloseTimerRef = useRef(null);

    const syncDraftsFromTask = useCallback(() => {
        setDraftStart(task.start_date || '');

        setDraftDue(task.due_date || '');
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
            if (rootRef.current?.contains(e.target)) return;
            // DateRangePicker portals the calendar to document.body
            if (e.target?.closest?.('[data-siteweave-date-range-popover]')) return;
            setPanel(null);
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

    const handleRowMouseEnter = useCallback(() => {
        if (hoverCloseTimerRef.current) {
            window.clearTimeout(hoverCloseTimerRef.current);
            hoverCloseTimerRef.current = null;
        }
        setHoverExpanded(true);
    }, []);

    const handleRowMouseLeave = useCallback(() => {
        if (hoverCloseTimerRef.current) window.clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = window.setTimeout(() => {
            setHoverExpanded(false);
            hoverCloseTimerRef.current = null;
        }, 60);
    }, []);

    useEffect(() => () => {
        if (hoverCloseTimerRef.current) window.clearTimeout(hoverCloseTimerRef.current);
    }, []);

    const formatDateShort = (dateString) =>
        formatLocalDateOnly(dateString, i18n.language, { month: 'short' });

    const dateLine = () => {
        if (task.start_date && task.due_date) {
            return `${formatDateShort(task.start_date)} – ${formatDateShort(task.due_date)}`;
        }
        if (task.due_date) return formatDateShort(task.due_date);
        if (task.start_date) return formatDateShort(task.start_date);
        return t('tasks.no_dates');
    };
    const progressPercent = Math.max(0, Math.min(100, Number(task.percent_complete ?? (task.completed ? 100 : 0)) || 0));
    const isComplete = task.completed || progressPercent >= 100;

    // Show the in-progress draft while editing, otherwise the saved value.
    const displayPercent = draftPercent === null ? progressPercent : draftPercent;

    const applyPercent = useCallback((rawValue) => {
        if (percentCommitLockRef.current) return;
        const bounded = Math.max(0, Math.min(100, Math.round(Number(rawValue) || 0)));
        percentCommitLockRef.current = true;
        if (bounded === progressPercent) {
            percentCommitLockRef.current = false;
            return;
        }
        const reachedComplete = bounded >= 100 && progressPercent < 100;
        onEdit(task.id, {
            percent_complete: bounded,
            completed: bounded >= 100,
        });
        if (reachedComplete) {
            const prefersReduced =
                typeof window !== 'undefined' &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!prefersReduced) {
                setShowConfetti(true);
                if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current);
                confettiTimerRef.current = window.setTimeout(() => {
                    setShowConfetti(false);
                    confettiTimerRef.current = null;
                }, 900);
            }
        }
        queueMicrotask(() => {
            percentCommitLockRef.current = false;
        });
    }, [progressPercent, onEdit, task.id]);

    // Commit slider draft once (on blur / Enter / slider release).
    const commitPercent = useCallback(() => {
        if (draftPercent === null) return;
        const next = draftPercent;
        setDraftPercent(null);
        applyPercent(next);
    }, [draftPercent, applyPercent]);

    const openPercentEdit = useCallback((e) => {
        e?.stopPropagation?.();
        setDraftPercent(null);
        setPercentText(String(displayPercent));
        setPercentEditing(true);
    }, [displayPercent]);

    const commitPercentText = useCallback(() => {
        if (!percentEditing) return;
        setPercentEditing(false);
        applyPercent(percentText);
        setPercentText('');
    }, [percentEditing, percentText, applyPercent]);

    const cancelPercentText = useCallback(() => {
        setPercentEditing(false);
        setPercentText('');
    }, []);

    useEffect(() => {
        if (!percentEditing) return undefined;
        const input = percentInputRef.current;
        if (input) {
            input.focus();
            input.select();
        }
        return undefined;
    }, [percentEditing]);

    useEffect(() => () => {
        if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current);
    }, []);

    const skipScheduleSyncOnCloseRef = useRef(false);

    const saveScheduleDraft = useCallback(
        (start, end) => {
            skipScheduleSyncOnCloseRef.current = true;
            setDraftStart(start);
            setDraftDue(end);
            onEdit(task.id, {
                start_date: start || null,
                due_date: end || null,
            });
        },
        [onEdit, task.id],
    );

    const dateRangePresets = useCallback(
        ({ goToToday }) => (
            <>
                <button
                    type="button"
                    onClick={() => {
                        const today = localDateIso();
                        setDraftStart(today);
                        setDraftDue(today);
                        goToToday();
                    }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                >
                    Today
                </button>
                <button
                    type="button"
                    onClick={() => {
                        const today = localDateIso();
                        setDraftStart((s) => s || today);
                        setDraftDue(addDaysIso(today, 7) || today);
                        goToToday();
                    }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                >
                    +1 week
                </button>
                <button
                    type="button"
                    onClick={() => {
                        const today = localDateIso();
                        setDraftStart((s) => s || today);
                        setDraftDue(addDaysIso(today, 14) || today);
                        goToToday();
                    }}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                >
                    +2 weeks
                </button>
            </>
        ),
        [],
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
        const fromList = task.assignee_id
            ? assignableContacts.find((contact) => contact.id === task.assignee_id) || null
            : null;
        if (task.contacts && fromList) {
            return {
                ...fromList,
                ...task.contacts,
                phone: task.contacts.phone || fromList.phone,
                email: task.contacts.email || fromList.email,
                name: task.contacts.name || fromList.name,
                avatar_url: task.contacts.avatar_url || fromList.avatar_url,
            };
        }
        return task.contacts || fromList;
    }, [task.contacts, task.assignee_id, assignableContacts]);
    const assigneeName = String(selectedAssigneeContact?.name || '').trim();
    const assigneeEmail = String(selectedAssigneeContact?.email || '').trim();
    const assigneePhoneDisplay = formatAssigneePhone(selectedAssigneeContact?.phone);
    const assigneePhoneNorm = normalizeAssigneePhone(String(selectedAssigneeContact?.phone || '').trim(), {
        defaultRegion: 'US',
    });
    const assigneePhoneOkPing = assigneePhoneNorm.isValid;
    const smsEnabled = isSmsNotificationsEnabled();
    const smsConsent = task.assignee_sms_consent ?? null;
    const smsPingAllowed = smsEnabled && assigneePhoneOkPing && smsConsent === 'confirmed';
    const smsConsentBlocked = assigneePhoneOkPing && smsConsent === 'opted_out';
    const looksLikePlaceholderName =
        /^assignee?\b/i.test(assigneeName) ||
        /^external assignee\b/i.test(assigneeName) ||
        /^asignado\s*\(/i.test(assigneeName);
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeName);
    const looksLikePhoneOrNumber =
        /^[\d\s()+.-]+$/.test(assigneeName) ||
        (/^\d{7,}$/.test(assigneeName.replace(/\D/g, '')) && !/[a-zA-Z]/.test(assigneeName));
    const assigneeDisplay = (
        assigneeName && !looksLikePlaceholderName ? assigneeName : ''
    ) || assigneeEmail || assigneePhoneDisplay || assigneeName || null;
    // Avatar only for a linked contact with a real person name (not email/phone/empty).
    const showAssigneeAvatar = Boolean(
        task.assignee_id &&
        assigneeName &&
        !looksLikePlaceholderName &&
        !looksLikeEmail &&
        !looksLikePhoneOrNumber,
    );
    const predecessors = dependencyMeta?.predecessors || [];
    const successors = dependencyMeta?.successors || [];
    const depCount = predecessors.length + successors.length;
    const unmetCount = dependencyMeta?.warning?.unmetPredecessors?.length || 0;

    const toggleComplete = useCallback(() => {
        if (isComplete) {
            onEdit(task.id, {
                completed: false,
                percent_complete: progressPercent >= 100 ? 0 : progressPercent,
            });
            return;
        }
        onEdit(task.id, { completed: true, percent_complete: 100 });
    }, [isComplete, onEdit, progressPercent, task.id]);

    // Completed tasks use checkbox + strikethrough only — no "Done" pill.
    const workflowStatus = isComplete
        ? null
        : unmetCount > 0
            ? 'waiting'
            : displayPercent > 0
                ? 'in_progress'
                : null;

    const workflowStatusLabel = workflowStatus === 'waiting'
        ? t('tasks.workflow_waiting')
        : workflowStatus === 'in_progress'
            ? t('tasks.workflow_in_progress')
            : null;

    const workflowStatusClass = workflowStatus === 'waiting'
        ? 'bg-[#f3e8d8] text-[#9a6b2f]'
        : workflowStatus === 'in_progress'
            ? 'bg-violet-50 text-violet-800'
            : '';

    const afterTaskName = unmetCount > 0
        ? (dependencyMeta?.warning?.unmetPredecessors?.[0]?.text || null)
        : (predecessors[0]?.predecessorTask?.text || null);

    const idleDepLabel = afterTaskName
        ? t('tasks.after_task', { name: afterTaskName })
        : (predecessors.length === 0 && successors.length > 0
            ? t('tasks.unlocks_count', { count: successors.length })
            : null);

    const assigneeAvatar = showAssigneeAvatar ? (
        <Avatar
            name={assigneeName}
            avatarUrl={selectedAssigneeContact?.avatar_url || null}
            size="sm"
            className="!h-5 !w-5 !text-[9px] shrink-0"
        />
    ) : null;

    const progressControl = (
        <div className="task-row-progress flex shrink-0 items-center gap-2">
            {assigneeAvatar}
            <PermissionGuard
                permission="can_edit_tasks"
                fallback={
                    <div className="flex items-center gap-2" title={t('tasks.percent_complete')}>
                        <div
                            className={`task-progress-track${
                                progressPercent >= 100 ? ' task-progress-track--complete' : ''
                            }`}
                            style={{ '--progress': `${progressPercent}%` }}
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progressPercent}
                            aria-label={`${t('tasks.percent_complete')} — ${task.text}`}
                        />
                        <span className="tabular-nums text-[11px] font-medium text-gray-500 w-8 text-right">
                            {progressPercent}%
                        </span>
                    </div>
                }
            >
                <label
                    className="flex items-center gap-2"
                    title={t('tasks.percent_complete_title')}
                    onClick={stop}
                    onMouseDown={suppressRowDrag}
                    onTouchStart={suppressRowDrag}
                    onDragStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <input
                        type="range"
                        draggable={false}
                        min="0"
                        max="100"
                        step="5"
                        value={displayPercent}
                        onChange={(e) => {
                            if (percentEditing) setPercentEditing(false);
                            const bounded = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                            setDraftPercent(bounded);
                        }}
                        onPointerUp={commitPercent}
                        onKeyDown={(e) => {
                            if (
                                e.shiftKey &&
                                (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
                            ) {
                                e.preventDefault();
                                const delta = e.key === 'ArrowRight' ? 1 : -1;
                                const base = draftPercent === null ? progressPercent : draftPercent;
                                setDraftPercent(Math.max(0, Math.min(100, base + delta)));
                            }
                        }}
                        onKeyUp={(e) => {
                            if (
                                e.key === 'Enter' ||
                                e.key === 'ArrowLeft' ||
                                e.key === 'ArrowRight' ||
                                e.key === 'Home' ||
                                e.key === 'End'
                            ) {
                                commitPercent();
                            } else if (e.key === 'Escape') {
                                setDraftPercent(null);
                            }
                        }}
                        className={`task-progress-slider h-3 w-28 cursor-pointer ${
                            displayPercent >= 100 ? 'task-progress-slider--complete' : ''
                        }`}
                        style={{ '--progress': `${displayPercent}%` }}
                        aria-label={`${t('tasks.percent_complete')} — ${task.text}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={displayPercent}
                    />
                    {percentEditing ? (
                        <span className="flex items-center gap-0.5 shrink-0">
                            <input
                                ref={percentInputRef}
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={100}
                                value={percentText}
                                onClick={stop}
                                onMouseDown={suppressRowDrag}
                                onTouchStart={suppressRowDrag}
                                onChange={(e) => setPercentText(e.target.value)}
                                onBlur={commitPercentText}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        commitPercentText();
                                    } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        cancelPercentText();
                                    }
                                }}
                                className="w-9 rounded border border-blue-300 bg-white px-0.5 py-0.5 text-right text-[11px] font-semibold tabular-nums text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                aria-label={t('tasks.percent_complete_exact', {
                                    defaultValue: 'Exact percent complete',
                                })}
                            />
                            <span className="text-[11px] font-medium text-gray-500">%</span>
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={openPercentEdit}
                            onMouseDown={suppressRowDrag}
                            onTouchStart={suppressRowDrag}
                            className="tabular-nums text-[11px] font-medium text-gray-500 w-8 shrink-0 text-right rounded px-0.5 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            title={t('tasks.percent_complete_exact_hint', {
                                defaultValue: 'Click to type exact %',
                            })}
                            aria-label={t('tasks.percent_complete_exact_hint', {
                                defaultValue: 'Click to type exact %',
                            })}
                        >
                            {displayPercent}%
                        </button>
                    )}
                </label>
            </PermissionGuard>
        </div>
    );

    return (
        <li
            ref={rootRef}
            draggable
            onDragStart={handleTaskRowDragStart}
            onMouseEnter={handleRowMouseEnter}
            onMouseLeave={handleRowMouseLeave}
            className={`task-row group relative border-b border-gray-100 last:border-b-0 bg-white${
                hoverExpanded ? ' task-row--hover-open' : ''
            }${panel ? ' task-row--panel-open' : ''}${
                unmetCount > 0 && !isComplete ? ' task-row--blocked' : ''
            }`}
            role="listitem"
            aria-label={`Task: ${task.text}, ${workflowStatusLabel || task.priority}, ${dateLine()}`}
            onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    onSelect?.(task.id);
                }
            }}
        >
            <div
                className={`task-row-surface relative mx-1 my-0.5 rounded-xl px-2 py-2.5 sm:mx-1.5 sm:px-3${
                    isSelected ? ' task-row-surface--selected' : ''
                }`}
            >
                {showConfetti && (
                    <div className="task-confetti-burst" aria-hidden>
                        {Array.from({ length: 12 }, (_, i) => (
                            <span
                                key={i}
                                className="task-confetti-piece"
                                style={{
                                    '--tx': `${(i % 2 === 0 ? -1 : 1) * (12 + (i % 5) * 8)}px`,
                                    '--ty': `${-28 - (i % 4) * 10}px`,
                                    '--rot': `${(i * 37) % 360}deg`,
                                    backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'][i % 5],
                                    left: `${20 + (i * 5)}%`,
                                    animationDelay: `${i * 18}ms`,
                                }}
                            />
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <PermissionGuard
                        permission="can_edit_tasks"
                        fallback={
                            <span
                                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${
                                    isComplete
                                        ? 'border-[#50C878] bg-[#50C878] text-white'
                                        : 'border-gray-300 bg-white'
                                }`}
                                aria-hidden
                            >
                                {isComplete && (
                                    <Icon path="M4.5 12.75l6 6 9-13.5" className="h-2.5 w-2.5" stroke={2.5} />
                                )}
                            </span>
                        }
                    >
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={isComplete}
                            aria-label={isComplete ? t('tasks.mark_incomplete') : t('tasks.mark_complete')}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleComplete();
                            }}
                            onMouseDown={suppressRowDrag}
                            onTouchStart={suppressRowDrag}
                            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                isComplete
                                    ? 'border-[#50C878] bg-[#50C878] text-white'
                                    : 'border-gray-300 bg-white hover:border-gray-400'
                            }`}
                        >
                            {isComplete && (
                                <Icon path="M4.5 12.75l6 6 9-13.5" className="h-2.5 w-2.5" stroke={2.5} />
                            )}
                        </button>
                    </PermissionGuard>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 sm:gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-x-2">
                                    <div className="min-w-0 shrink">
                                        <PermissionGuard
                                            permission="can_edit_tasks"
                                            fallback={
                                                <span
                                                    className={`block truncate font-semibold text-sm leading-snug ${
                                                        isComplete ? 'line-through text-gray-400' : 'text-gray-900'
                                                    }`}
                                                >
                                                    {task.text}
                                                </span>
                                            }
                                        >
                                            <InlineEditableText
                                                value={task.text}
                                                canEdit
                                                onSave={(text) => onEdit(task.id, { text })}
                                                className={`!flex-none block max-w-full truncate font-semibold text-sm leading-snug ${
                                                    isComplete ? 'line-through text-gray-400' : 'text-gray-900'
                                                }`}
                                                inputClassName="font-semibold text-sm"
                                                ariaLabel={t('tasks.click_to_rename')}
                                            />
                                        </PermissionGuard>
                                    </div>
                                    {workflowStatusLabel && (
                                        <span
                                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${workflowStatusClass}`}
                                        >
                                            {workflowStatusLabel}
                                        </span>
                                    )}
                                </div>

                                <div className="task-row-idle-meta mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-gray-500">
                                    <PermissionGuard
                                        permission="can_edit_tasks"
                                        fallback={
                                            <span className={`tabular-nums ${isComplete ? 'text-gray-400' : ''}`}>
                                                {dateLine()}
                                            </span>
                                        }
                                    >
                                        <DateRangePicker
                                            size="sm"
                                            compact
                                            label=""
                                            startValue={draftStart}
                                            endValue={draftDue}
                                            presets={dateRangePresets}
                                            clearLabel={t('tasks.clear_dates', { defaultValue: 'Clear dates' })}
                                            saveLabel={t('common.save')}
                                            onOpenChange={(next) => {
                                                if (next) {
                                                    skipScheduleSyncOnCloseRef.current = false;
                                                    syncDraftsFromTask();
                                                    setPanel(null);
                                                    return;
                                                }
                                                if (skipScheduleSyncOnCloseRef.current) {
                                                    skipScheduleSyncOnCloseRef.current = false;
                                                    return;
                                                }
                                                // Discard unsaved draft when dismissing
                                                syncDraftsFromTask();
                                            }}
                                            onChange={({ start, end }) => {
                                                setDraftStart(start);
                                                setDraftDue(end);
                                            }}
                                            onClear={() => saveScheduleDraft('', '')}
                                            onSave={({ start, end }) => saveScheduleDraft(start, end)}
                                            trigger={
                                                <button
                                                    type="button"
                                                    className={`tabular-nums rounded px-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                                        isComplete
                                                            ? 'text-gray-400'
                                                            : 'hover:text-gray-800 hover:underline underline-offset-2'
                                                    }`}
                                                    title={t('tasks.set_dates')}
                                                    onMouseDown={suppressRowDrag}
                                                    onTouchStart={suppressRowDrag}
                                                >
                                                    {dateLine()}
                                                </button>
                                            }
                                        />
                                    </PermissionGuard>
                                    {idleDepLabel && (
                                        <>
                                            <span className="text-gray-300" aria-hidden>·</span>
                                            <span
                                                className={unmetCount > 0 && !isComplete ? 'text-orange-700/80' : ''}
                                                title={depTooltip || idleDepLabel}
                                            >
                                                {idleDepLabel}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="task-row-hover-pills" aria-hidden={!hoverExpanded && !panel}>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenPhotos?.(task.id);
                                    }}
                                    className="task-row-pill"
                                    title={t('tasks.photos')}
                                    aria-label={`${t('tasks.photos')} — ${task.text}`}
                                >
                                    {t('tasks.photos')}
                                    {photoCount > 0 && (
                                        <span className="task-row-pill-count">
                                            {photoCount > 9 ? '9+' : photoCount}
                                        </span>
                                    )}
                                </button>
                                {onOpenDiscussion && project && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenDiscussion(task.id);
                                        }}
                                        className="task-row-pill"
                                        title={t('tasks.discussion')}
                                        aria-label={`${t('tasks.notes_action')} — ${task.text}`}
                                    >
                                        {t('tasks.notes_action')}
                                    </button>
                                )}
                                <PermissionGuard
                                    permission="can_edit_tasks"
                                    fallback={
                                        <span
                                            className="task-row-pill task-row-pill--muted"
                                            title={assigneeDisplay ? t('tasks.assigned_to', { name: assigneeDisplay }) : t('tasks.unassigned')}
                                        >
                                            {t('tasks.assign')}
                                        </span>
                                    }
                                >
                                    <button
                                        type="button"
                                        onClick={openPanel('assign')}
                                        className="task-row-pill"
                                        title={assigneeDisplay ? t('tasks.assigned_to_change', { name: assigneeDisplay }) : t('tasks.assign_task')}
                                        aria-label={t('tasks.assignment_aria')}
                                    >
                                        {t('tasks.assign')}
                                    </button>
                                </PermissionGuard>
                                {onPingAssignee && (
                                    <PermissionGuard permission="can_assign_tasks">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onPingAssignee(task);
                                            }}
                                            disabled={pingingTaskId === task.id}
                                            className="task-row-pill disabled:cursor-not-allowed disabled:opacity-50"
                                            title={t('tasks.ping_title_email')}
                                            aria-label={t('tasks.ping_assignee_aria', { task: task.text })}
                                        >
                                            {t('tasks.ping')}
                                        </button>
                                    </PermissionGuard>
                                )}
                                <PermissionGuard
                                    permission="can_edit_tasks"
                                    fallback={
                                        <span
                                            className={`task-row-pill ${
                                                depWarningCount > 0 ? 'task-row-pill--warn' : 'task-row-pill--muted'
                                            }`}
                                            title={depTooltip || t('tasks.dependencies')}
                                        >
                                            {depCount > 0 ? t('tasks.deps_count', { count: depCount }) : t('tasks.deps')}
                                        </span>
                                    }
                                >
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onOpenDependencyDrawer?.(task.id);
                                        }}
                                        className={`task-row-pill ${
                                            depWarningCount > 0 ? 'task-row-pill--warn' : ''
                                        }`}
                                        title={depTooltip || t('tasks.dependencies')}
                                        aria-label={t('tasks.task_dependencies_aria')}
                                    >
                                        {depCount > 0 ? t('tasks.deps_count', { count: depCount }) : t('tasks.deps')}
                                    </button>
                                </PermissionGuard>
                                {onCopyGuestLink && (
                                    <PermissionGuard permission="can_assign_tasks">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onCopyGuestLink(task);
                                            }}
                                            className="task-row-pill"
                                            title={t('tasks.guest_link_title', {
                                                defaultValue: 'Copy guest link (no account needed)',
                                            })}
                                            aria-label={t('tasks.guest_link_aria', {
                                                defaultValue: 'Copy guest link for {{task}}',
                                                task: task.text,
                                            })}
                                        >
                                            {t('tasks.guest_link_short', { defaultValue: 'Guest' })}
                                        </button>
                                    </PermissionGuard>
                                )}
                                {(smsEnabled && task.assignee_id && (
                                    onRequestAssigneeSmsConsent || onShareSmsConsentLink
                                )) && (
                                    <PermissionGuard permission="can_assign_tasks">
                                        <>
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
                                                        className="task-row-pill task-row-pill--warn disabled:opacity-50"
                                                        title={t('tasks.send_sms_consent')}
                                                    >
                                                        {t('tasks.sms_ok')}
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
                                                        className="task-row-pill disabled:opacity-50"
                                                        title={t('tasks.resend_consent')}
                                                    >
                                                        {t('tasks.resend_consent')}
                                                    </button>
                                                )}
                                            {onShareSmsConsentLink &&
                                                assigneePhoneOkPing &&
                                                smsConsent !== 'confirmed' &&
                                                smsConsent !== 'opted_out' && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onShareSmsConsentLink(task);
                                                        }}
                                                        disabled={pingingTaskId === task.id}
                                                        className="task-row-pill disabled:opacity-50"
                                                        title={t('sms.web_consent.get_consent_link')}
                                                    >
                                                        {t('sms.web_consent.share_link')}
                                                    </button>
                                                )}
                                        </>
                                    </PermissionGuard>
                                )}
                                <PermissionGuard permission="can_delete_tasks">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(task.id);
                                        }}
                                        className="task-row-pill task-row-pill--icon task-row-pill--danger"
                                        title={t('tasks.delete_task')}
                                        aria-label={`${t('tasks.delete_task')}: ${task.text}`}
                                    >
                                        <Icon
                                            path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                            className="h-3.5 w-3.5"
                                        />
                                    </button>
                                </PermissionGuard>
                            </div>

                            {progressControl}
                        </div>
                    </div>
                </div>

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
                            <p className="text-xs font-semibold text-gray-800">{t('tasks.assignment')}</p>
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[96px_minmax(180px,1fr)_minmax(220px,1.2fr)_minmax(170px,1fr)] lg:items-end">
                                <label className="block text-xs text-gray-600">
                                    Priority
                                    <select
                                        value={editPriority}
                                        onChange={(e) => setEditPriority(e.target.value)}
                                        className="mt-0.5 w-full rounded border border-gray-300 bg-white p-1.5 text-sm"
                                    >
                                        <option value="Low">{t('tasks.priority_low')}</option>
                                        <option value="Medium">{t('tasks.priority_medium')}</option>
                                        <option value="High">{t('tasks.priority_high')}</option>
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
                                            <option value="">{t('tasks.unassigned')}</option>
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

            </div>
        </li>
    );
});

export default TaskItem;
