import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient, useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { logPhaseProgressChange } from '../utils/activityLogger';
import {
    calculateOverallPhaseProgress,
    DEFAULT_CONSTRUCTION_PHASES,
    DEFAULT_CONSTRUCTION_PHASE_NAMES,
} from '../utils/projectPhasesUtils';

/**
 * Shared project phase CRUD + loading for Tasks tab and BuildPath.
 * @param {string|null} projectId
 * @param {{ id: string, name?: string, organization_id?: string }|null} projectMeta — for activity logging
 */
export function useProjectPhases(projectId, projectMeta = null) {
    const { t } = useTranslation();
    const { state } = useAppContext();
    const { addToast } = useToast();
    const [phases, setPhases] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isMutating, setIsMutating] = useState(false);

    const refresh = useCallback(async () => {
        if (!projectId) {
            setPhases([]);
            return [];
        }
        setLoading(true);
        try {
            const { data, error } = await supabaseClient
                .from('project_phases')
                .select('*')
                .eq('project_id', projectId)
                .order('order', { ascending: true });
            if (error) {
                console.error('Error loading project phases:', error);
                setPhases([]);
                return [];
            }
            const rows = data || [];
            setPhases(rows);
            return rows;
        } catch (err) {
            console.error('Error loading project phases:', err);
            setPhases([]);
            return [];
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const overallProgress = useMemo(() => calculateOverallPhaseProgress(phases), [phases]);

    const notifyChange = useCallback((nextPhases) => {
        setPhases(nextPhases);
    }, []);

    const addPhase = useCallback(
        async (phaseData, { optimistic = false } = {}) => {
            if (!projectId) return null;
            setIsMutating(true);
            const order = phases.length + 1;
            const payload = {
                ...phaseData,
                project_id: projectId,
                order,
                progress: phaseData.progress ?? 0,
            };
            let rollback = null;
            if (optimistic) {
                const tempId = `temp-phase-${Date.now()}`;
                rollback = phases;
                notifyChange([...phases, { ...payload, id: tempId }]);
            }
            try {
                const { data, error } = await supabaseClient
                    .from('project_phases')
                    .insert(payload)
                    .select()
                    .single();
                if (error) {
                    if (rollback) setPhases(rollback);
                    addToast(t('toast.error_adding_phase', { message: error.message }), 'error');
                    return null;
                }
                setPhases((prev) => [
                    ...prev.filter((p) => !String(p.id).startsWith('temp-phase-')),
                    data,
                ]);
                addToast(t('toast.phase_added_successfully'), 'success');
                return data;
            } catch (err) {
                if (rollback) notifyChange(rollback);
                addToast(t('toast.error_adding_phase', { message: err.message }), 'error');
                return null;
            } finally {
                setIsMutating(false);
            }
        },
        [projectId, phases, addToast, t, notifyChange],
    );

    const addPhaseByName = useCallback(
        async (name) => {
            const trimmed = String(name || '').trim();
            if (!trimmed) return null;
            return addPhase({ name: trimmed, start_date: null, end_date: null });
        },
        [addPhase],
    );

    const updatePhase = useCallback(
        async (phaseId, updates, { silent = false } = {}) => {
            if (!projectId) return false;
            const currentPhase = phases.find((p) => p.id === phaseId);
            const oldProgress = currentPhase?.progress || 0;
            const newProgress = updates.progress !== undefined ? updates.progress : oldProgress;

            setIsMutating(true);
            try {
                const { error } = await supabaseClient
                    .from('project_phases')
                    .update(updates)
                    .eq('id', phaseId);

                if (error) {
                    addToast(t('toast.error_updating_phase', { message: error.message }), 'error');
                    return false;
                }

                const next = phases.map((p) => (p.id === phaseId ? { ...p, ...updates } : p));
                notifyChange(next);

                if (
                    updates.progress !== undefined &&
                    updates.progress !== oldProgress &&
                    state.user &&
                    projectMeta
                ) {
                    const updatedPhase = { ...currentPhase, ...updates };
                    await logPhaseProgressChange(
                        updatedPhase,
                        state.user,
                        projectMeta.id,
                        projectMeta.name,
                        oldProgress,
                        newProgress,
                        projectMeta.organization_id,
                    );
                }

                if (!silent) {
                    addToast(t('toast.phase_updated_successfully'), 'success');
                }
                return true;
            } catch (err) {
                addToast(t('toast.error_updating_phase', { message: err.message }), 'error');
                return false;
            } finally {
                setIsMutating(false);
            }
        },
        [projectId, phases, addToast, t, state.user, projectMeta, notifyChange],
    );

    const deletePhase = useCallback(
        async (phaseId) => {
            if (!projectId) return false;
            setIsMutating(true);
            try {
                const { error } = await supabaseClient
                    .from('project_phases')
                    .delete()
                    .eq('id', phaseId);

                if (error) {
                    addToast(t('toast.error_deleting_phase', { message: error.message }), 'error');
                    return false;
                }
                notifyChange(phases.filter((p) => p.id !== phaseId));
                addToast(t('toast.phase_deleted_successfully'), 'success');
                return true;
            } catch (err) {
                addToast(t('toast.error_deleting_phase', { message: err.message }), 'error');
                return false;
            } finally {
                setIsMutating(false);
            }
        },
        [projectId, phases, addToast, t, notifyChange],
    );

    const reorderPhases = useCallback(
        async (reorderedPhases) => {
            if (!projectId) return false;
            const updatedPhases = reorderedPhases.map((phase, index) => ({
                ...phase,
                order: index + 1,
            }));
            notifyChange(updatedPhases);
            setIsMutating(true);
            try {
                const updatePromises = updatedPhases.map((phase) =>
                    supabaseClient
                        .from('project_phases')
                        .update({ order: phase.order })
                        .eq('id', phase.id),
                );
                const results = await Promise.all(updatePromises);
                const hasError = results.some((result) => result.error);
                if (hasError) {
                    const errorMessages = results
                        .filter((r) => r.error)
                        .map((r) => r.error.message)
                        .join(', ');
                    addToast(t('toast.error_reordering_phases', { message: errorMessages }), 'error');
                    await refresh();
                    return false;
                }
                addToast(t('toast.phases_reordered_successfully'), 'success');
                return true;
            } catch (err) {
                addToast(t('toast.error_reordering_phases', { message: err.message }), 'error');
                await refresh();
                return false;
            } finally {
                setIsMutating(false);
            }
        },
        [projectId, addToast, t, notifyChange, refresh],
    );

    const seedDefaultPhases = useCallback(async () => {
        if (!projectId) return [];
        if (phases.length > 0) {
            addToast(t('projectDetail.phases_already_exist'), 'warning');
            return phases;
        }
        setIsMutating(true);
        try {
            const rows = DEFAULT_CONSTRUCTION_PHASES.map((phase) => ({
                ...phase,
                project_id: projectId,
            }));
            const { data, error } = await supabaseClient
                .from('project_phases')
                .insert(rows)
                .select();
            if (error) {
                addToast(t('toast.error_adding_phase', { message: error.message }), 'error');
                return [];
            }
            const inserted = data || [];
            notifyChange(inserted);
            addToast(
                t('projectDetail.construction_template_applied', {
                    names: DEFAULT_CONSTRUCTION_PHASE_NAMES.join(', '),
                }),
                'success',
            );
            return inserted;
        } catch (err) {
            addToast(t('toast.error_adding_phase', { message: err.message }), 'error');
            return [];
        } finally {
            setIsMutating(false);
        }
    }, [projectId, phases.length, addToast, t, notifyChange]);

    return {
        phases,
        loading,
        isMutating,
        overallProgress,
        refresh,
        setPhases: notifyChange,
        addPhase,
        addPhaseByName,
        updatePhase,
        deletePhase,
        reorderPhases,
        seedDefaultPhases,
        DEFAULT_CONSTRUCTION_PHASE_NAMES,
    };
}

export default useProjectPhases;
