import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import PermissionGuard from './PermissionGuard';
import DateRangePicker from './DateRangePicker';
import { addDaysIso, localDateIso } from '../utils/dateHelpers';
import { hasPermission } from '../utils/permissions';
import useProjectPhases from '../hooks/useProjectPhases';
import {
    buildPhasesWithDerivedProgress,
    calculateOverallPhaseProgress,
} from '../utils/projectPhasesUtils';
import { supabaseClient } from '../context/AppContext';

const schedulePresetChipClass =
    'rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-xs transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

function ScheduleDatePresets({ t, onSelectRange }) {
    return (
        <>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    onSelectRange(todayIso, todayIso);
                }}
                className={schedulePresetChipClass}
            >
                {t('common.today')}
            </button>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    onSelectRange(todayIso || '', addDaysIso(todayIso, 7) || todayIso);
                }}
                className={schedulePresetChipClass}
            >
                {t('common.plus_one_week')}
            </button>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    onSelectRange(todayIso || '', addDaysIso(todayIso, 14) || todayIso);
                }}
                className={schedulePresetChipClass}
            >
                {t('common.plus_two_weeks')}
            </button>
        </>
    );
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * @param {object} props
 * @param {{ id: string, name?: string, organization_id?: string }} props.project
 * @param {ReturnType<typeof useProjectPhases>|null} [props.phaseControl] — shared hook from parent (avoids duplicate fetch)
 * @param {() => void} [props.onPhasesChange] — called after any mutation (parent can sync)
 * @param {boolean} [props.embedded] — hide duplicate header actions when parent provides toolbar
 * @param {boolean} [props.hideEmbeddedToolbar] — parent renders Add Phase / Edit in its own header
 * @param {boolean} [props.isEditing]
 * @param {(next: boolean) => void} [props.onEditingChange]
 * @param {() => void} [props.onAddPhase]
 * @param {Array} [props.tasks] — when provided, phase % is derived from tasks (not stale DB progress)
 */
function BuildPath({
  project,
  phaseControl = null,
  onPhasesChange,
  embedded = false,
  hideEmbeddedToolbar = false,
  isEditing: isEditingProp,
  onEditingChange,
  onAddPhase,
  tasks = null,
}) {
    const { t } = useTranslation();
    const { state } = useAppContext();
    const internalControl = useProjectPhases(phaseControl ? null : project?.id, project);
    const control = phaseControl || internalControl;

    const {
        phases,
        isMutating,
        addPhase,
        updatePhase,
        deletePhase,
        reorderPhases,
    } = control;

    const displayPhases = useMemo(
        () => (Array.isArray(tasks) ? buildPhasesWithDerivedProgress(phases, tasks) : phases),
        [phases, tasks],
    );

    const [isEditingInternal, setIsEditingInternal] = useState(false);
    const isEditing = typeof isEditingProp === 'boolean' ? isEditingProp : isEditingInternal;
    const setIsEditing = (next) => {
        const value = typeof next === 'function' ? next(isEditing) : next;
        if (onEditingChange) onEditingChange(value);
        if (typeof isEditingProp !== 'boolean') setIsEditingInternal(value);
    };
    const [editingPhase, setEditingPhase] = useState(null);
    const [showPhaseModal, setShowPhaseModal] = useState(false);
    const openAddPhase = () => {
        if (onAddPhase) onAddPhase();
        else setShowPhaseModal(true);
    };
    const [editingValues, setEditingValues] = useState({});
    const [canEditProjects, setCanEditProjects] = useState(false);
    const [draggedPhase, setDraggedPhase] = useState(null);
    const [dragOverPhase, setDragOverPhase] = useState(null);
    const [dragOverPosition, setDragOverPosition] = useState(null);
    const [editingNamePhaseId, setEditingNamePhaseId] = useState(null);
    const handlePhaseUpdateRef = useRef(null);

    useEffect(() => {
        if (!state.user?.id || !state.currentOrganization?.id) {
            setCanEditProjects(false);
            return;
        }
        hasPermission(
            supabaseClient,
            state.user.id,
            'can_edit_projects',
            state.currentOrganization.id,
        )
            .then(setCanEditProjects)
            .catch(() => setCanEditProjects(false));
    }, [state.user?.id, state.currentOrganization?.id]);

    const isAuthorized = () => canEditProjects;
    const isLoading = isMutating;

    const handlePhaseUpdate = useCallback(
        async (phaseId, updates, options) => {
            const ok = await updatePhase(phaseId, updates, options);
            if (ok && onPhasesChange) onPhasesChange();
            return ok;
        },
        [updatePhase, onPhasesChange],
    );

    useEffect(() => {
        handlePhaseUpdateRef.current = handlePhaseUpdate;
    }, [handlePhaseUpdate]);

    const handleInputChange = (phaseId, field, value) => {
        setEditingValues((prev) => ({
            ...prev,
            [`${phaseId}_${field}`]: value,
        }));
    };

    const debouncedUpdate = React.useCallback(
        debounce(async (phaseId, field, value) => {
            if (handlePhaseUpdateRef.current) {
                await handlePhaseUpdateRef.current(phaseId, { [field]: value }, { silent: true });
            }
        }, 1000),
        [],
    );

    const handleAddPhase = async (phaseData) => {
        const data = await addPhase(phaseData);
        if (data && onPhasesChange) onPhasesChange();
    };

    const handleDeletePhase = async (phaseId) => {
        const ok = await deletePhase(phaseId);
        if (ok && onPhasesChange) onPhasesChange();
    };

    const resetDragState = () => {
        setDraggedPhase(null);
        setDragOverPhase(null);
        setDragOverPosition(null);
    };

    const handleDragStart = (e, phaseId) => {
        setDraggedPhase(phaseId);
        setDragOverPhase(null);
        setDragOverPosition(null);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnd = () => resetDragState();

    const handleDragOver = (e, phaseId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        const position = offset < rect.height / 2 ? 'top' : 'bottom';
        if (dragOverPhase !== phaseId || dragOverPosition !== position) {
            setDragOverPhase(phaseId);
            setDragOverPosition(position);
        }
    };

    const handleDragLeave = () => {
        setDragOverPhase(null);
        setDragOverPosition(null);
    };

    const handleDrop = async (e, targetPhaseId) => {
        e.preventDefault();
        if (!draggedPhase || draggedPhase === targetPhaseId) {
            resetDragState();
            return;
        }
        const draggedIndex = phases.findIndex((p) => p.id === draggedPhase);
        const targetIndex = phases.findIndex((p) => p.id === targetPhaseId);
        if (draggedIndex === -1 || targetIndex === -1) {
            resetDragState();
            return;
        }
        const newPhases = [...phases];
        const [draggedPhaseData] = newPhases.splice(draggedIndex, 1);
        let insertIndex = newPhases.findIndex((p) => p.id === targetPhaseId);
        if (insertIndex === -1) {
            resetDragState();
            return;
        }
        if ((dragOverPosition || 'bottom') === 'bottom') insertIndex += 1;
        newPhases.splice(insertIndex, 0, draggedPhaseData);
        await reorderPhases(newPhases);
        if (onPhasesChange) onPhasesChange();
        resetDragState();
    };

    const overallPct = calculateOverallPhaseProgress(displayPhases);

    return (
        <div className="h-full flex flex-col">
            {!embedded && (
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">{t('build_path.progress_status')}</h3>
                    {isAuthorized() && (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={openAddPhase}
                                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                + {t('build_path.add_phase')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsEditing(!isEditing)}
                                className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                            >
                                {isEditing ? t('common.done') : t('common.edit')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {embedded && isAuthorized() && !hideEmbeddedToolbar && (
                <div className="flex justify-end gap-2 mb-3">
                    <button
                        type="button"
                        onClick={openAddPhase}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                        + {t('build_path.add_phase')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsEditing(!isEditing)}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                        {isEditing ? t('common.done') : t('common.edit')}
                    </button>
                </div>
            )}

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm">{t('build_path.overall_progress')}</span>
                    <span className="text-sm font-bold">{overallPct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                    <div
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${overallPct}%` }}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {displayPhases.map((phase) => {
                    const isDragTarget = dragOverPhase === phase.id;
                    return (
                        <div key={phase.id}>
                            {isDragTarget && dragOverPosition === 'top' && (
                                <div className="h-2 -mb-1 rounded border-2 border-dashed border-blue-400 bg-blue-50" />
                            )}
                            <div
                                className={`relative border border-gray-200 rounded-lg p-3 transition-all duration-150 ${draggedPhase === phase.id ? 'opacity-50' : ''} ${draggedPhase ? 'cursor-move' : ''} ${isDragTarget ? 'ring-2 ring-blue-400 bg-blue-50/40' : ''}`}
                                draggable={!isLoading}
                                onDragStart={(e) => handleDragStart(e, phase.id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, phase.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, phase.id)}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-gray-400 cursor-move shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                        </svg>
                                        {editingNamePhaseId === phase.id && isAuthorized() ? (
                                            <input
                                                type="text"
                                                value={
                                                    editingValues[`${phase.id}_name`] !== undefined
                                                        ? editingValues[`${phase.id}_name`]
                                                        : phase.name
                                                }
                                                onChange={(e) => handleInputChange(phase.id, 'name', e.target.value)}
                                                onBlur={() => {
                                                    const value =
                                                        editingValues[`${phase.id}_name`] !== undefined
                                                            ? editingValues[`${phase.id}_name`]
                                                            : phase.name;
                                                    if (value.trim()) {
                                                        debouncedUpdate(phase.id, 'name', value.trim());
                                                    }
                                                    setEditingNamePhaseId(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') e.target.blur();
                                                    else if (e.key === 'Escape') {
                                                        setEditingValues((prev) => {
                                                            const next = { ...prev };
                                                            delete next[`${phase.id}_name`];
                                                            return next;
                                                        });
                                                        setEditingNamePhaseId(null);
                                                    }
                                                }}
                                                className="flex-1 px-2 py-1 text-sm font-semibold border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                                autoFocus
                                                disabled={isLoading}
                                            />
                                        ) : (
                                            <h4
                                                className={`font-semibold text-sm flex items-center gap-1 ${isAuthorized() ? 'cursor-pointer hover:text-blue-600' : ''}`}
                                                onClick={isAuthorized() ? () => setEditingNamePhaseId(phase.id) : undefined}
                                                title={isAuthorized() ? t('common.click_to_edit') : undefined}
                                            >
                                                {editingValues[`${phase.id}_name`] !== undefined
                                                    ? editingValues[`${phase.id}_name`]
                                                    : phase.name}
                                            </h4>
                                        )}
                                    </div>
                                    {isEditing && isAuthorized() && (
                                        <button
                                            type="button"
                                            onClick={() => handleDeletePhase(phase.id)}
                                            className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
                                        >
                                            {t('common.delete')}
                                        </button>
                                    )}
                                </div>
                                <div className="mb-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs text-gray-600">{t('common.progress')}</span>
                                        <span className="text-xs font-semibold">
                                            {Math.max(0, Math.min(100, phase.progress ?? 0))}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                            className="h-2 rounded-full transition-all duration-300"
                                            style={{
                                                width: `${Math.max(0, Math.min(100, phase.progress ?? 0))}%`,
                                                backgroundColor:
                                                    (phase.progress ?? 0) >= 100 ? '#10B981' : '#22c55e',
                                            }}
                                        />
                                    </div>
                                </div>
                                {isEditing && (
                                    <PermissionGuard permission="can_edit_projects">
                                        <div className={`mt-3 ${isLoading ? 'pointer-events-none opacity-60' : ''}`}>
                                            <DateRangePicker
                                                size="sm"
                                                compact
                                                label={t('tasks.schedule')}
                                                startValue={phase.start_date || ''}
                                                endValue={phase.end_date || ''}
                                                onChange={({ start, end }) =>
                                                    handlePhaseUpdate(phase.id, {
                                                        start_date: start || null,
                                                        end_date: end || null,
                                                    })
                                                }
                                            />
                                        </div>
                                    </PermissionGuard>
                                )}
                            </div>
                            {isDragTarget && dragOverPosition === 'bottom' && (
                                <div className="h-2 mt-1 rounded border-2 border-dashed border-blue-400 bg-blue-50" />
                            )}
                        </div>
                    );
                })}
            </div>

            {showPhaseModal && (
                <PhaseModal
                    phase={editingPhase}
                    onClose={() => {
                        setShowPhaseModal(false);
                        setEditingPhase(null);
                    }}
                    onSave={
                        editingPhase
                            ? (data) => handlePhaseUpdate(editingPhase.id, data)
                            : handleAddPhase
                    }
                    isLoading={isLoading}
                />
            )}
        </div>
    );
}

export function PhaseModal({ phase, onClose, onSave, isLoading }) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        name: phase?.name || '',
        start_date: phase?.start_date || '',
        end_date: phase?.end_date || '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...formData,
            start_date: formData.start_date || null,
            end_date: formData.end_date || null,
        });
        onClose();
    };

    const applyScheduleRange = (start, end) => {
        setFormData((prev) => ({ ...prev, start_date: start, end_date: end }));
    };

    return (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-black/40 flex items-start justify-center overflow-y-auto py-8 z-[60] p-4">
            <div
                className="bg-white rounded-xl p-6 w-full max-w-md mx-4 max-h-[min(90dvh,90vh)] overflow-y-auto shadow-2xl"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-bold mb-4">
                    {phase ? t('build_path.edit_phase') : t('build_path.add_new_phase')}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('taskModal.phase')}
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <DateRangePicker
                        label={t('tasks.schedule')}
                        startValue={formData.start_date}
                        endValue={formData.end_date}
                        onChange={({ start, end }) => applyScheduleRange(start, end)}
                        elevated
                        presets={
                            <ScheduleDatePresets t={t} onSelectRange={applyScheduleRange} />
                        }
                    />
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {isLoading ? t('common.saving') : phase ? t('common.update') : t('common.add')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default BuildPath;
