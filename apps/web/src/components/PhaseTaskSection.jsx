import React, { useCallback, useEffect, useRef, useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import InlineEditableText from './InlineEditableText';
import { phaseCollapseStorageKey } from '../utils/projectPhasesUtils';

const PHASE_DRAG_MIME = 'application/x-siteweave-phase-id';

/**
 * Collapsible phase header + task rows. Collapse state persists in localStorage.
 */
function PhaseTaskSection({
    projectId,
    phaseKey,
    phaseId = null,
    title,
    dateRangeLabel = null,
    progressPercent,
    taskCount = 0,
    defaultExpanded = true,
    variant = 'default',
    onTaskDrop,
    onAddTaskToPhase,
    onRenamePhase,
    onDeletePhase,
    phaseOrderDraggable = false,
    isPhaseDragging = false,
    isPhaseDropTarget = false,
    phaseDropPosition = null,
    onPhaseDragStart,
    onPhaseDragEnd,
    onPhaseDragOver,
    onPhaseDrop,
    canManagePhases = false,
    children,
}) {
    const { t } = useTranslation();
    const titleId = useId();
    const titleEditRef = useRef(null);
    const isUnassigned = variant === 'unassigned';
    const sectionDomId =
        phaseKey === 'unassigned' ? `phase-unassigned-${projectId}` : `phase-${phaseKey}`;

    const [expanded, setExpanded] = useState(() => {
        if (typeof window === 'undefined') return defaultExpanded;
        try {
            const raw = window.localStorage.getItem(phaseCollapseStorageKey(projectId, phaseKey));
            if (raw === '0') return false;
            if (raw === '1') return true;
        } catch {
            /* ignore */
        }
        return defaultExpanded;
    });

    const [isTaskDragOver, setIsTaskDragOver] = useState(false);

    useEffect(() => {
        try {
            window.localStorage.setItem(
                phaseCollapseStorageKey(projectId, phaseKey),
                expanded ? '1' : '0',
            );
        } catch {
            /* ignore */
        }
    }, [projectId, phaseKey, expanded]);

    useEffect(() => {
        const handler = (e) => {
            if (e.detail?.projectId !== projectId) return;
            setExpanded(Boolean(e.detail.expanded));
        };
        window.addEventListener('siteweave:phase-collapse-all', handler);
        return () => window.removeEventListener('siteweave:phase-collapse-all', handler);
    }, [projectId]);

    const toggle = useCallback(() => {
        setExpanded((e) => !e);
    }, []);

    const pct = Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0)));
    const complete = pct >= 100;

    const handleTaskDragOver = (e) => {
        if (e.dataTransfer.types.includes(PHASE_DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleTaskDragEnter = (e) => {
        if (e.dataTransfer.types.includes(PHASE_DRAG_MIME)) return;
        e.preventDefault();
        setIsTaskDragOver(true);
    };

    const handleTaskDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsTaskDragOver(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsTaskDragOver(false);

        const phaseDragId = e.dataTransfer.getData(PHASE_DRAG_MIME);
        if (phaseDragId && onPhaseDrop) {
            onPhaseDrop(e, phaseId);
            return;
        }

        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId && onTaskDrop) {
            onTaskDrop(taskId, phaseId);
        }
    };

    const handleSectionDragOver = (e) => {
        if (e.dataTransfer.types.includes(PHASE_DRAG_MIME)) {
            onPhaseDragOver?.(e, phaseId);
            return;
        }
        handleTaskDragOver(e);
    };

    const taskCountLabel =
        taskCount === 1
            ? t('projectDetail.phase_task_count_one', { count: taskCount })
            : t('projectDetail.phase_task_count_other', { count: taskCount });

    const headerBg = isTaskDragOver
        ? 'bg-blue-50'
        : isPhaseDropTarget
          ? 'bg-blue-50/60'
          : isUnassigned
            ? 'bg-amber-50/80 hover:bg-amber-100/60'
            : 'bg-gray-100 hover:bg-gray-200/80';

    const canEditTitle = canManagePhases && !isUnassigned && phaseId && onRenamePhase;
    const showDelete = canManagePhases && !isUnassigned && phaseId && onDeletePhase;
    const showAddTaskFooter =
        expanded && canManagePhases && !isUnassigned && phaseId && onAddTaskToPhase;

    return (
        <section
            id={sectionDomId}
            role="region"
            aria-labelledby={titleId}
            className={`rounded-lg border overflow-hidden bg-white transition-all duration-150 ${
                isTaskDragOver || isPhaseDropTarget
                    ? 'border-blue-400 ring-2 ring-blue-200 shadow-md'
                    : isUnassigned
                      ? 'border-amber-200'
                      : 'border-gray-200'
            } ${isPhaseDragging ? 'opacity-50' : ''}`}
            onDragOver={handleSectionDragOver}
            onDragEnter={handleTaskDragEnter}
            onDragLeave={handleTaskDragLeave}
            onDrop={handleDrop}
        >
            {isPhaseDropTarget && phaseDropPosition === 'top' && (
                <div className="h-1 bg-blue-400" aria-hidden />
            )}
            <div
                className={`flex items-center gap-1 border-b border-gray-200 ${headerBg} transition-colors`}
            >
                {phaseOrderDraggable && phaseId && (
                    <div
                        draggable
                        onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData(PHASE_DRAG_MIME, phaseId);
                            e.dataTransfer.effectAllowed = 'move';
                            onPhaseDragStart?.(phaseId);
                        }}
                        onDragEnd={() => onPhaseDragEnd?.()}
                        className="inline-flex h-10 w-7 shrink-0 cursor-grab items-center justify-center text-gray-400 hover:text-gray-600 active:cursor-grabbing ml-0.5"
                        aria-label={t('projectDetail.move_phase')}
                        title={t('projectDetail.move_phase')}
                    >
                        <Icon path="M4 8h16M4 16h16" className="h-4 w-4" aria-hidden />
                    </div>
                )}
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={expanded}
                    aria-controls={`${sectionDomId}-body`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-gray-600 hover:bg-white/60 rounded-full ml-1"
                >
                    <Icon
                        path={expanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'}
                        className="h-4 w-4"
                        aria-hidden
                    />
                </button>
                <div className="flex flex-1 min-w-0 items-center gap-2 py-2 pr-1">
                    <InlineEditableText
                        ref={titleEditRef}
                        value={title}
                        canEdit={Boolean(canEditTitle)}
                        onSave={(name) => onRenamePhase?.(phaseId, name)}
                        className="font-semibold text-gray-900"
                        inputClassName="font-semibold text-gray-900"
                        ariaLabel={t('projectDetail.rename_phase')}
                    />
                    {!isUnassigned && (
                        <span className="hidden sm:inline text-xs text-gray-500 tabular-nums shrink-0">
                            {dateRangeLabel || t('projectDetail.phase_no_dates')}
                        </span>
                    )}
                    {taskCount > 0 && (
                        <span className="text-xs font-medium text-gray-500 bg-white/80 border border-gray-200 rounded-full px-2 py-0.5 shrink-0">
                            {taskCountLabel}
                        </span>
                    )}
                    {isTaskDragOver && (
                        <span className="text-xs text-blue-600 font-medium shrink-0">
                            {t('projectDetail.drop_here')}
                        </span>
                    )}
                    <div className="h-2 w-24 rounded-full bg-gray-200 shrink-0 overflow-hidden ml-auto">
                        <div
                            className="h-2 transition-all duration-300"
                            style={{
                                width: `${pct}%`,
                                backgroundColor: complete ? '#10B981' : '#3B82F6',
                            }}
                        />
                    </div>
                    <span className="text-sm font-bold text-gray-900 shrink-0 tabular-nums w-10 text-right">
                        {pct}%
                    </span>
                </div>
                {showDelete && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeletePhase(phaseId);
                        }}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 mr-2"
                        aria-label={t('projectDetail.delete_phase')}
                        title={t('projectDetail.delete_phase')}
                    >
                        <Icon
                            path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            className="h-4 w-4"
                            aria-hidden
                        />
                    </button>
                )}
            </div>
            {expanded && (
                <div id={`${sectionDomId}-body`} className="divide-y divide-gray-100">
                    {children}
                </div>
            )}
            {showAddTaskFooter && (
                <div className="border-t border-gray-100 bg-white px-3 py-2">
                    <button
                        type="button"
                        onClick={() => onAddTaskToPhase(phaseId)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                        + {t('projectDetail.add_task_to_phase')}
                    </button>
                </div>
            )}
            {!expanded && isTaskDragOver && (
                <div className="px-3 py-2 text-xs text-blue-600 bg-blue-50/60 text-center">
                    {t('projectDetail.drop_to_phase', { name: title })}
                </div>
            )}
            {isPhaseDropTarget && phaseDropPosition === 'bottom' && (
                <div className="h-1 bg-blue-400" aria-hidden />
            )}
        </section>
    );
}

export default PhaseTaskSection;
