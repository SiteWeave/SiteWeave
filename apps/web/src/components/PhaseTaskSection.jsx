import React, { useCallback, useEffect, useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { phaseCollapseStorageKey } from '../utils/projectPhasesUtils';

/**
 * Collapsible phase header + task rows. Collapse state persists in localStorage.
 * Accepts HTML5 drag-and-drop to move tasks between phases.
 */
function PhaseTaskSection({
    projectId,
    phaseKey,
    phaseId = null,
    title,
    progressPercent,
    taskCount = 0,
    defaultExpanded = true,
    variant = 'default',
    onTaskDrop,
    onAddTaskToPhase,
    onRenamePhase,
    onDeletePhase,
    canManagePhases = false,
    children,
}) {
    const { t } = useTranslation();
    const titleId = useId();
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

    const [isDragOver, setIsDragOver] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

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

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsDragOver(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId && onTaskDrop) {
            onTaskDrop(taskId, phaseId);
        }
    };

    const taskCountLabel =
        taskCount === 1
            ? t('projectDetail.phase_task_count_one', { count: taskCount })
            : t('projectDetail.phase_task_count_other', { count: taskCount });

    const headerBg = isDragOver
        ? 'bg-blue-50'
        : isUnassigned
          ? 'bg-amber-50/80 hover:bg-amber-100/60'
          : 'bg-gray-100 hover:bg-gray-200/80';

    return (
        <section
            id={sectionDomId}
            role="region"
            aria-labelledby={titleId}
            className={`rounded-lg border overflow-hidden bg-white transition-all duration-150 ${
                isDragOver
                    ? 'border-blue-400 ring-2 ring-blue-200 shadow-md'
                    : isUnassigned
                      ? 'border-amber-200'
                      : 'border-gray-200'
            }`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div
                className={`flex items-center gap-1 border-b border-gray-200 ${headerBg} transition-colors`}
            >
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={expanded}
                    aria-controls={`${sectionDomId}-body`}
                    className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2.5 text-left"
                >
                    <Icon
                        path={expanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'}
                        className="h-4 w-4 text-gray-600 shrink-0"
                        aria-hidden
                    />
                    <span id={titleId} className="font-semibold text-gray-900 flex-1 min-w-0 ui-ellipsis-1">
                        {title}
                    </span>
                    {taskCount > 0 && (
                        <span className="text-xs font-medium text-gray-500 bg-white/80 border border-gray-200 rounded-full px-2 py-0.5 shrink-0">
                            {taskCountLabel}
                        </span>
                    )}
                    {isDragOver && (
                        <span className="text-xs text-blue-600 font-medium shrink-0">
                            {t('projectDetail.drop_here')}
                        </span>
                    )}
                    <div className="h-2 w-28 rounded-full bg-gray-200 shrink-0 overflow-hidden">
                        <div
                            className="h-2 transition-all duration-300"
                            style={{
                                width: `${pct}%`,
                                backgroundColor: complete ? '#10B981' : '#3B82F6',
                            }}
                        />
                    </div>
                    <span className="text-sm font-bold text-gray-900 shrink-0 tabular-nums">{pct}%</span>
                </button>
                {canManagePhases && !isUnassigned && phaseId && (onRenamePhase || onDeletePhase || onAddTaskToPhase) && (
                    <div className="relative shrink-0 pr-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen((o) => !o);
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:bg-white/80"
                            aria-label={title}
                            aria-expanded={menuOpen}
                        >
                            <Icon path="M6 12h.01M12 12h.01M18 12h.01" className="h-5 w-5" aria-hidden />
                        </button>
                        {menuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    aria-hidden
                                    onClick={() => setMenuOpen(false)}
                                />
                                <div className="absolute right-0 top-11 z-20 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                                    {onAddTaskToPhase && (
                                        <button
                                            type="button"
                                            className="flex w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onAddTaskToPhase(phaseId);
                                            }}
                                        >
                                            {t('projectDetail.add_task_to_phase')}
                                        </button>
                                    )}
                                    {onRenamePhase && (
                                        <button
                                            type="button"
                                            className="flex w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onRenamePhase(phaseId, title);
                                            }}
                                        >
                                            {t('projectDetail.rename_phase')}
                                        </button>
                                    )}
                                    {onDeletePhase && (
                                        <button
                                            type="button"
                                            className="flex w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                onDeletePhase(phaseId);
                                            }}
                                        >
                                            {t('projectDetail.delete_phase')}
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
            {expanded && (
                <div id={`${sectionDomId}-body`} className="divide-y divide-gray-100">
                    {children}
                </div>
            )}
            {!expanded && isDragOver && (
                <div className="px-3 py-2 text-xs text-blue-600 bg-blue-50/60 text-center">
                    {t('projectDetail.drop_to_phase', { name: title })}
                </div>
            )}
        </section>
    );
}

export default PhaseTaskSection;
