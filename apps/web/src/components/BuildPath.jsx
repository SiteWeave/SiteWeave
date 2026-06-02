import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import PermissionGuard from './PermissionGuard';
import DateDropdown from './DateDropdown';
import { hasPermission } from '../utils/permissions';

// Simple debounce utility
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

function BuildPath({ project }) {
    const { t } = useTranslation();
    const { dispatch, state } = useAppContext();
    const { addToast } = useToast();
    const [phases, setPhases] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editingPhase, setEditingPhase] = useState(null);
    const [showPhaseModal, setShowPhaseModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [editingValues, setEditingValues] = useState({});
    const [canEditProjects, setCanEditProjects] = useState(false);
    const [draggedPhase, setDraggedPhase] = useState(null);
    const [dragOverPhase, setDragOverPhase] = useState(null);
    const [dragOverPosition, setDragOverPosition] = useState(null);
    const [editingNamePhaseId, setEditingNamePhaseId] = useState(null);
    const handlePhaseUpdateRef = useRef(null);

    // Default phases for construction projects
    const defaultPhases = [
        { name: 'Mobilize', progress: 0, start_date: null, end_date: null, order: 1 },
        { name: 'Clear and Grub', progress: 0, start_date: null, end_date: null, order: 2 },
        { name: 'Demo', progress: 0, start_date: null, end_date: null, order: 3 },
        { name: 'Rough Cut', progress: 0, start_date: null, end_date: null, order: 4 },
        { name: 'BP', progress: 0, start_date: null, end_date: null, order: 5 },
        { name: 'Final Grade', progress: 0, start_date: null, end_date: null, order: 6 }
    ];

    useEffect(() => {
        if (!project?.id) return;
        loadPhases();
        checkPermissions();
    }, [project?.id, state.user?.id, state.currentOrganization?.id]);

    const checkPermissions = async () => {
        if (!state.user?.id || !state.currentOrganization?.id) {
            setCanEditProjects(false);
            return;
        }
        try {
            const hasEditPermission = await hasPermission(
                supabaseClient,
                state.user.id,
                'can_edit_projects',
                state.currentOrganization.id
            );
            setCanEditProjects(hasEditPermission);
        } catch (error) {
            console.error('Error checking permissions:', error);
            setCanEditProjects(false);
        }
    };

    const isAuthorized = () => {
        return canEditProjects;
    };

    const loadPhases = async () => {
        try {
            const { data, error } = await supabaseClient
                .from('project_phases')
                .select('*')
                .eq('project_id', project.id)
                .order('order');

            if (error) {
                console.error('Error loading phases:', error);
                // If no phases exist, initialize with defaults
                if (error.code === 'PGRST116') {
                    await initializeDefaultPhases();
                }
            } else {
                setPhases(data || []);
            }
        } catch (error) {
            console.error('Error loading phases:', error);
            await initializeDefaultPhases();
        }
    };

    const initializeDefaultPhases = async () => {
        try {
            if (!project?.id) return;
            const phasesWithProjectId = defaultPhases.map(phase => ({
                ...phase,
                project_id: project.id
            }));

            const { error } = await supabaseClient
                .from('project_phases')
                .insert(phasesWithProjectId);

            if (error) {
                console.error('Error initializing phases:', error);
            } else {
                setPhases(phasesWithProjectId);
            }
        } catch (error) {
            console.error('Error initializing phases:', error);
        }
    };


    const handlePhaseUpdate = useCallback(async (phaseId, updates) => {
        setIsLoading(true);
        try {
            const { error } = await supabaseClient
                .from('project_phases')
                .update(updates)
                .eq('id', phaseId);

            if (error) {
                addToast('Error updating phase: ' + error.message, 'error');
            } else {
                setPhases(prev => prev.map(phase => 
                    phase.id === phaseId ? { ...phase, ...updates } : phase
                ));
                addToast('Phase updated successfully!', 'success');
            }
        } catch (error) {
            addToast('Error updating phase: ' + error.message, 'error');
        }
        setIsLoading(false);
    }, [addToast]);

    // Keep ref updated with latest function
    useEffect(() => {
        handlePhaseUpdateRef.current = handlePhaseUpdate;
    }, [handlePhaseUpdate]);

    // Handle input changes with local state (no immediate DB update)
    const handleInputChange = (phaseId, field, value) => {
        setEditingValues(prev => ({
            ...prev,
            [`${phaseId}_${field}`]: value
        }));
    };

    // Debounced update to database
    const debouncedUpdate = React.useCallback(
        debounce(async (phaseId, field, value) => {
            const updates = { [field]: value };
            if (handlePhaseUpdateRef.current) {
                await handlePhaseUpdateRef.current(phaseId, updates);
            }
        }, 1000),
        []
    );

    // Handle input blur (save immediately when user leaves field)
    const handleInputBlur = async (phaseId, field) => {
        const key = `${phaseId}_${field}`;
        const value = editingValues[key];
        
        if (value !== undefined) {
            const updates = { [field]: value };
            await handlePhaseUpdate(phaseId, updates);
            // Clear the editing value
            setEditingValues(prev => {
                const newValues = { ...prev };
                delete newValues[key];
                return newValues;
            });
        }
    };

    const commitPhaseDateField = (phaseId, field, iso) => {
        const val = iso || null;
        handlePhaseUpdate(phaseId, { [field]: val });
    };

    const handleAddPhase = async (phaseData) => {
        setIsLoading(true);
        try {
            const newPhase = {
                ...phaseData,
                project_id: project.id,
                order: phases.length + 1
            };

            const { data, error } = await supabaseClient
                .from('project_phases')
                .insert(newPhase)
                .select()
                .single();

            if (error) {
                addToast('Error adding phase: ' + error.message, 'error');
            } else {
                setPhases(prev => [...prev, data]);
                addToast('Phase added successfully!', 'success');
            }
        } catch (error) {
            addToast('Error adding phase: ' + error.message, 'error');
        }
        setIsLoading(false);
    };

    const handleDeletePhase = async (phaseId) => {
        setIsLoading(true);
        try {
            const { error } = await supabaseClient
                .from('project_phases')
                .delete()
                .eq('id', phaseId);

            if (error) {
                addToast('Error deleting phase: ' + error.message, 'error');
            } else {
                setPhases(prev => prev.filter(phase => phase.id !== phaseId));
                addToast('Phase deleted successfully!', 'success');
            }
        } catch (error) {
            addToast('Error deleting phase: ' + error.message, 'error');
        }
        setIsLoading(false);
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
        e.dataTransfer.setData('text/html', e.target);
    };

    const handleDragEnd = () => {
        resetDragState();
    };

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

        const draggedIndex = phases.findIndex(p => p.id === draggedPhase);
        const targetIndex = phases.findIndex(p => p.id === targetPhaseId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedPhase(null);
            return;
        }

        // Create new array with reordered phases
        const newPhases = [...phases];
        const [draggedPhaseData] = newPhases.splice(draggedIndex, 1);

        let insertIndex = newPhases.findIndex(p => p.id === targetPhaseId);
        if (insertIndex === -1) {
            resetDragState();
            return;
        }
        if ((dragOverPosition || 'bottom') === 'bottom') {
            insertIndex += 1;
        }

        newPhases.splice(insertIndex, 0, draggedPhaseData);

        // Update order values for all phases
        const updatedPhases = newPhases.map((phase, index) => ({
            ...phase,
            order: index + 1
        }));

        setPhases(updatedPhases);

        // Update all phases in the database
        setIsLoading(true);
        try {
            const updates = updatedPhases.map(phase => ({
                id: phase.id,
                order: phase.order
            }));

            const updatePromises = updates.map(update =>
                supabaseClient
                    .from('project_phases')
                    .update({ order: update.order })
                    .eq('id', update.id)
            );

            const results = await Promise.all(updatePromises);
            const hasError = results.some(result => result.error);

            if (hasError) {
                const errorMessages = results
                    .filter(r => r.error)
                    .map(r => r.error.message)
                    .join(', ');
                addToast('Error reordering phases: ' + errorMessages, 'error');
                // Reload phases on error
                loadPhases();
            } else {
                addToast('Phases reordered successfully!', 'success');
            }
        } catch (error) {
            addToast('Error reordering phases: ' + error.message, 'error');
            loadPhases();
        } finally {
            setIsLoading(false);
            resetDragState();
        }
    };

    const deriveScheduleProgress = (phase) => {
        const parseDate = (dateString) => {
            if (!dateString) return null;
            const parsed = new Date(`${dateString}T00:00:00Z`);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };
        const start = parseDate(phase.start_date);
        const end = parseDate(phase.end_date);
        const today = new Date();
        if (!start || !end) return Math.max(0, Math.min(100, phase.progress || 0));
        if (today < start) return 0;
        if (today >= end) return 100;
        const msPerDay = 24 * 60 * 60 * 1000;
        const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay));
        const elapsedDays = Math.floor((today.getTime() - start.getTime()) / msPerDay);
        return Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));
    };

    const calculateOverallProgress = () => {
        if (phases.length === 0) return 0;
        const parseDate = (dateString) => {
            if (!dateString) return null;
            const parsed = new Date(`${dateString}T00:00:00Z`);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };
        const msPerDay = 24 * 60 * 60 * 1000;
        const durations = phases.map((phase) => {
            const start = parseDate(phase.start_date);
            const end = parseDate(phase.end_date);
            if (!start || !end) return 1;
            return Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay));
        });
        const totalDuration = durations.reduce((sum, value) => sum + value, 0);
        if (totalDuration <= 0) return 0;
        const weighted = phases.reduce((sum, phase, index) => {
            return sum + ((deriveScheduleProgress(phase) * durations[index]) / totalDuration);
        }, 0);
        return Math.round(weighted);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">{t('build_path.progress_status')}</h3>
                {isAuthorized() && (
                    <div className="flex gap-2">
                        <button type="button"
                            onClick={() => setShowPhaseModal(true)}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            + Add Phase
                        </button>
                        <button type="button"
                            onClick={() => setIsEditing(!isEditing)}
                            className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                        >
                            {isEditing ? 'Done' : 'Edit'}
                        </button>
                    </div>
                )}
            </div>

            {/* Overall Progress Summary */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm">Overall Progress</span>
                    <span className="text-sm font-bold">{calculateOverallProgress()}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                    <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${calculateOverallProgress()}%` }}
                    ></div>
                </div>
            </div>

            {/* Phases List - Fixed height with scroll */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {phases.map((phase) => {
                    const isDragTarget = dragOverPhase === phase.id;
                    return (
                    <div key={phase.id}>
                        {isDragTarget && dragOverPosition === 'top' && (
                            <div className="h-2 -mb-1 rounded border-2 border-dashed border-blue-400 bg-blue-50"></div>
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
                                <svg className="w-4 h-4 text-gray-400 cursor-move" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                </svg>
                                {editingNamePhaseId === phase.id && isAuthorized() ? (
                                    <input
                                        type="text"
                                        value={editingValues[`${phase.id}_name`] !== undefined ? editingValues[`${phase.id}_name`] : phase.name}
                                        onChange={(e) => {
                                            handleInputChange(phase.id, 'name', e.target.value);
                                        }}
                                        onBlur={() => {
                                            const value = editingValues[`${phase.id}_name`] !== undefined 
                                                ? editingValues[`${phase.id}_name`] 
                                                : phase.name;
                                            if (value.trim()) {
                                                debouncedUpdate(phase.id, 'name', value.trim());
                                            }
                                            setEditingNamePhaseId(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.target.blur();
                                            } else if (e.key === 'Escape') {
                                                setEditingValues(prev => {
                                                    const newValues = { ...prev };
                                                    delete newValues[`${phase.id}_name`];
                                                    return newValues;
                                                });
                                                setEditingNamePhaseId(null);
                                            }
                                        }}
                                        className="flex-1 px-2 py-1 text-sm font-semibold border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        autoFocus
                                        disabled={isLoading}
                                    />
                                ) : (
                                    <h4 
                                        className={`font-semibold text-sm flex items-center gap-1 ${isAuthorized() ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                                        onClick={isAuthorized() ? () => setEditingNamePhaseId(phase.id) : undefined}
                                        title={isAuthorized() ? "Click to edit" : undefined}
                                    >
                                        {editingValues[`${phase.id}_name`] !== undefined ? editingValues[`${phase.id}_name`] : phase.name}
                                        {isAuthorized() && (
                                            <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        )}
                                    </h4>
                                )}
                            </div>
                            {isEditing && isAuthorized() && (
                                <button type="button"
                                    onClick={() => handleDeletePhase(phase.id)}
                                    className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
                                >
                                    Delete
                                </button>
                            )}
                        </div>

                        {/* Progress */}
                        <div className="mb-2">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-gray-600">Progress</span>
                                <span className="text-xs font-semibold">{deriveScheduleProgress(phase)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${deriveScheduleProgress(phase)}%` }}
                                ></div>
                            </div>
                        </div>

                        {isEditing && (
                            <PermissionGuard permission="can_edit_projects">
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-600 block mb-1">Start Date</label>
                                        <DateDropdown
                                            compact
                                            value={phase.start_date || ''}
                                            onChange={(v) => commitPhaseDateField(phase.id, 'start_date', v)}
                                            className={isLoading ? 'pointer-events-none opacity-60' : ''}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-600 block mb-1">End Date</label>
                                        <DateDropdown
                                            compact
                                            value={phase.end_date || ''}
                                            onChange={(v) => commitPhaseDateField(phase.id, 'end_date', v)}
                                            className={isLoading ? 'pointer-events-none opacity-60' : ''}
                                        />
                                    </div>
                                </div>
                            </PermissionGuard>
                        )}

                    </div>
                        {isDragTarget && dragOverPosition === 'bottom' && (
                            <div className="h-2 mt-1 rounded border-2 border-dashed border-blue-400 bg-blue-50"></div>
                        )}
                    </div>
                )})}
            </div>

            {/* Phase Modal */}
            {showPhaseModal && (
                <PhaseModal
                    phase={editingPhase}
                    onClose={() => {
                        setShowPhaseModal(false);
                        setEditingPhase(null);
                    }}
                    onSave={editingPhase ? 
                        (data) => handlePhaseUpdate(editingPhase.id, data) :
                        handleAddPhase
                    }
                    isLoading={isLoading}
                />
            )}
        </div>
    );
}

// Phase Modal Component
function PhaseModal({ phase, onClose, onSave, isLoading }) {
    const [formData, setFormData] = useState({
        name: phase?.name || '',
        start_date: phase?.start_date || '',
        end_date: phase?.end_date || ''
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

    return (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold mb-4">
                    {phase ? 'Edit Phase' : 'Add New Phase'}
                </h3>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Phase Name
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    <div className="space-y-4">
                        <DateDropdown
                            label="Start Date"
                            value={formData.start_date}
                            onChange={(v) => setFormData({ ...formData, start_date: v })}
                        />
                        <DateDropdown
                            label="End Date"
                            value={formData.end_date}
                            onChange={(v) => setFormData({ ...formData, end_date: v })}
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {isLoading ? 'Saving...' : (phase ? 'Update' : 'Add')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default BuildPath;
