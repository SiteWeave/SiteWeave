import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import PermissionGuard from './PermissionGuard';
import { parseMsProjectXml } from '../utils/msProjectXmlParser.js';
import {
    SW_TARGET,
    mergeWithSuggestedMappings,
    buildScheduleFromMappedRows,
    getImportBlockingIssues,
    getImportWarnings,
} from '../utils/msProjectImportMapping.js';
import { importMsProjectXmlSchedule, fetchScheduleImportTemplates, saveScheduleImportTemplate } from '../utils/msProjectImportService.js';
import { ensureOrganizationForWrites } from '../utils/organizationContext';
import { translateImportMessage } from '@siteweave/i18n';

/**
 * @param {{
 *   onClose: () => void,
 *   context: 'newProject' | 'existing',
 *   projectId?: string,
 *   projectName?: string,
 *   onSuccess?: (projectId: string) => void,
 * }} props
 */
export default function MsProjectImportModal({ onClose, context, projectId: existingProjectId, projectName, onSuccess }) {
    const { t } = useTranslation();
    const { state, dispatch } = useAppContext();
    const tasksState = state.tasks || [];
    const { addToast } = useToast();
    const fileInputRef = useRef(null);

    const orgId = state.currentOrganization?.id;
    const userId = state.user?.id;

    const [fileName, setFileName] = useState('');
    const [xmlText, setXmlText] = useState('');
    const [parseError, setParseError] = useState('');
    const [parsed, setParsed] = useState(null);

    // Advanced state (hidden by default)
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [mappings, setMappings] = useState({});
    const [rowStrategy, setRowStrategy] = useState('summary_to_phase');
    const [skipOutline0, setSkipOutline0] = useState(true);
    const [skipUid0, setSkipUid0] = useState(true);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [saveTemplateName, setSaveTemplateName] = useState('');
    const [templatesLoading, setTemplatesLoading] = useState(true);

    // Project / schedule fields
    const [newProjectName, setNewProjectName] = useState('');
    const [newAddress, setNewAddress] = useState('');
    const [scheduleMode, setScheduleMode] = useState('replace');

    const [busy, setBusy] = useState(false);

    const targetOptions = useMemo(() => [
        { value: '', label: t('ms_import.target_not_mapped') },
        { value: SW_TARGET.ROW_NAME, label: t('ms_import.target_row_name') },
        { value: SW_TARGET.TASK_START, label: t('ms_import.target_task_start') },
        { value: SW_TARGET.TASK_DUE, label: t('ms_import.target_task_due') },
        { value: SW_TARGET.TASK_DURATION, label: t('ms_import.target_task_duration') },
        { value: SW_TARGET.TASK_PERCENT, label: t('ms_import.target_task_percent') },
        { value: SW_TARGET.TASK_MILESTONE, label: t('ms_import.target_task_milestone') },
        { value: SW_TARGET.TASK_PREDECESSORS, label: t('ms_import.target_task_predecessors') },
        { value: SW_TARGET.ROW_SUMMARY, label: t('ms_import.target_row_summary') },
        { value: SW_TARGET.IGNORE, label: t('ms_import.target_ignore') },
    ], [t]);

    useEffect(() => {
        if (!orgId) return;
        (async () => {
            const { templates: fetched } = await fetchScheduleImportTemplates(supabaseClient, orgId);
            setTemplates(fetched || []);
            setTemplatesLoading(false);
        })();
    }, [orgId]);

    const mergedMappings = useMemo(() => mergeWithSuggestedMappings(mappings), [mappings]);

    const rowRules = useMemo(() => ({
        strategy: rowStrategy,
        skipOutlineLevel0: skipOutline0,
        skipUid0: skipUid0,
    }), [rowStrategy, skipOutline0, skipUid0]);

    const preview = useMemo(() => {
        if (!parsed?.rows?.length) return null;
        return buildScheduleFromMappedRows({
            rows: parsed.rows,
            sourceFieldMappings: mergedMappings,
            rowRules,
            minutesPerDay: parsed.minutesPerDay,
        });
    }, [parsed, mergedMappings, rowRules]);

    const blockingIssues = useMemo(
        () => getImportBlockingIssues(mergedMappings, { strategy: rowStrategy }),
        [mergedMappings, rowStrategy]
    );

    const mappingWarnings = useMemo(
        () => getImportWarnings(mergedMappings),
        [mergedMappings]
    );

    const allWarnings = useMemo(
        () => [...mappingWarnings, ...(preview?.warnings || [])],
        [mappingWarnings, preview]
    );

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParseError('');
        setFileName(file.name);
        try {
            const text = await file.text();
            setXmlText(text);
            const res = parseMsProjectXml(text);
            if (res.error) {
                setParseError(res.error);
                setParsed(null);
                return;
            }
            setParsed(res.project);
            setNewProjectName((res.project.title || file.name.replace(/\.xml$/i, '')).trim());
        } catch (err) {
            setParseError(err?.message || t('ms_import.could_not_read_file'));
            setParsed(null);
        }
    };

    const applyTemplateConfig = (config) => {
        if (!config || typeof config !== 'object') return;
        if (config.sourceFieldMappings) setMappings(config.sourceFieldMappings);
        if (config.rowRules) {
            if (config.rowRules.strategy) setRowStrategy(config.rowRules.strategy);
            if (typeof config.rowRules.skipOutlineLevel0 === 'boolean') setSkipOutline0(config.rowRules.skipOutlineLevel0);
            if (typeof config.rowRules.skipUid0 === 'boolean') setSkipUid0(config.rowRules.skipUid0);
        }
    };

    const onSelectTemplate = (id) => {
        setSelectedTemplateId(id);
        const tmpl = templates.find((x) => x.id === id);
        if (tmpl?.config) applyTemplateConfig(tmpl.config);
    };

    const handleImport = async () => {
        if (!userId) { addToast(t('ms_import.missing_org_user'), 'error'); return; }
        if (!xmlText) { addToast(t('ms_import.upload_xml_first'), 'error'); return; }
        if (context === 'newProject' && !newProjectName.trim()) { addToast(t('ms_import.enter_project_name'), 'error'); return; }
        if (blockingIssues.length > 0) { addToast(translateImportMessage(blockingIssues[0], t), 'error'); return; }
        if (context === 'existing' && scheduleMode === 'replace') {
            const ok = window.confirm(t('ms_import.replace_confirm'));
            if (!ok) return;
        }

        setBusy(true);
        try {
            const orgContext = await ensureOrganizationForWrites(supabaseClient, {
                userId,
                accountIntent: state.accountIntent,
                currentOrganization: state.currentOrganization,
                dispatch,
            });
            if (!orgContext.ok) {
                addToast(orgContext.error || t('ms_import.missing_org_user'), 'error');
                return;
            }
            const result = await importMsProjectXmlSchedule(supabaseClient, {
                xmlText,
                organizationId: orgContext.organizationId,
                userId,
                sourceFieldMappings: mappings,
                rowRules,
                dependencyStrategy: 'full',
                mode: context === 'existing' ? scheduleMode : 'replace',
                projectId: context === 'existing' ? existingProjectId : undefined,
                createNewProject: context === 'newProject',
                newProjectName: newProjectName.trim(),
                newProjectAddress: newAddress.trim() || undefined,
            });

            if (!result.success) { addToast(result.error || t('ms_import.import_failed'), 'error'); return; }
            if (result.warnings?.length) result.warnings.forEach((w) => addToast(translateImportMessage(w, t), 'warning'));

            if (result.metrics) {
                const {
                    importedTaskCount = 0,
                    importedDependencyCount = 0,
                    startDatedTaskCount = 0,
                } = result.metrics;
                addToast(
                    t('ms_import.imported_metrics', { tasks: importedTaskCount, dependencies: importedDependencyCount }),
                    'info'
                );
                if (startDatedTaskCount > 0) {
                    addToast(
                        t('ms_import.start_dates_hint', { count: startDatedTaskCount }),
                        'warning'
                    );
                }
            }

            addToast(t('ms_import.import_success'), 'success');

            if (saveTemplateName.trim() && orgId) {
                const saveRes = await saveScheduleImportTemplate(supabaseClient, {
                    organization_id: orgId,
                    name: saveTemplateName.trim(),
                    source_type: 'ms_project_xml',
                    config: { sourceFieldMappings: mappings, rowRules },
                    created_by_user_id: userId,
                });
                if (!saveRes.success) addToast(saveRes.error || t('ms_import.could_not_save_template'), 'warning');
            }

            const pid = result.projectId;
            if (pid) {
                const { data: proj } = await supabaseClient.from('projects').select('*').eq('id', pid).single();
                if (proj) {
                    if (context === 'newProject') dispatch({ type: 'ADD_PROJECT', payload: proj });
                    else dispatch({ type: 'UPDATE_PROJECT', payload: proj });
                    dispatch({ type: 'SET_PROJECT', payload: pid });
                }
                const { data: taskList } = await supabaseClient
                    .from('tasks')
                    .select('*, contacts(name, avatar_url), task_photos(*)')
                    .eq('project_id', pid)
                    .order('due_date', { ascending: true, nullsFirst: false });
                const other = tasksState.filter((t) => String(t.project_id) !== String(pid));
                dispatch({ type: 'MERGE_TASKS', payload: [...other, ...(taskList || [])] });
                onSuccess?.(pid);
            }
            onClose();
        } finally {
            setBusy(false);
        }
    };

    const discovered = parsed?.discoveredFields || [];
    const canImport = parsed && preview && blockingIssues.length === 0 && (preview.tasks.length > 0 || preview.phases.length > 0);

    const phaseNames = preview?.phases.slice(0, 4).map((p) => p.name) || [];
    const taskNames = preview?.tasks.slice(0, 4).map((t) => t.text.replace(/ \[Imported at.*?\]$/, '')) || [];
    const morePhases = (preview?.phases.length || 0) - phaseNames.length;
    const moreTasks = (preview?.tasks.length || 0) - taskNames.length;

    return (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">{t('ms_import.title')}</h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                </div>

                <div className="overflow-y-auto px-6 py-5 flex-1 space-y-5">

                    {/* ── Step 1: File picker ── */}
                    <div>
                        <p className="text-sm text-gray-600 mb-3">
                            <Trans i18nKey="ms_import.intro" components={{ strong: <strong key="ms-import-strong" /> }} />
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xml,text/xml,application/xml"
                            className="hidden"
                            onChange={handleFile}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 w-full text-center transition-colors"
                        >
                            {fileName ? `✓ ${fileName}` : t('ms_import.choose_file')}
                        </button>
                        {parseError && <p className="text-sm text-red-600 mt-2">{parseError}</p>}
                    </div>

                    {parsed && (
                        <>
                            {/* ── Step 2: Project info / schedule mode ── */}
                            {context === 'newProject' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">{t('ms_import.project_name')}</label>
                                        <input
                                            type="text"
                                            value={newProjectName}
                                            onChange={(e) => setNewProjectName(e.target.value)}
                                            className="w-full p-2 border rounded-lg text-sm"
                                            placeholder={t('ms_import.project_name_placeholder')}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">{t('ms_import.address_optional')}</label>
                                        <input
                                            type="text"
                                            value={newAddress}
                                            onChange={(e) => setNewAddress(e.target.value)}
                                            className="w-full p-2 border rounded-lg text-sm"
                                        />
                                    </div>
                                </div>
                            )}

                            {context === 'existing' && (
                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                                    <p className="text-xs font-semibold text-gray-600 mb-2">
                                        {t('ms_import.adding_to')} <span className="text-gray-900">{projectName || t('ms_import.current_project')}</span>
                                    </p>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                                            <input type="radio" name="schedMode" checked={scheduleMode === 'replace'} onChange={() => setScheduleMode('replace')} />
                                            {t('ms_import.replace_schedule')}
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                                            <input type="radio" name="schedMode" checked={scheduleMode === 'append'} onChange={() => setScheduleMode('append')} />
                                            {t('ms_import.append_schedule')}
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* ── Step 3: Preview ── */}
                            {preview && (
                                <div className={`rounded-xl border px-4 py-4 space-y-3 ${blockingIssues.length > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                                    {blockingIssues.length === 0 ? (
                                        <>
                                            <p className="text-sm font-semibold text-green-800">
                                                {t('ms_import.ready_to_import')}
                                            </p>
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div className="bg-white rounded-lg py-2 shadow-xs">
                                                    <div className="text-xl font-bold text-gray-900">{preview.phases.length}</div>
                                                    <div className="text-xs text-gray-500">{t('ms_import.phases_label')}</div>
                                                </div>
                                                <div className="bg-white rounded-lg py-2 shadow-xs">
                                                    <div className="text-xl font-bold text-gray-900">{preview.tasks.length}</div>
                                                    <div className="text-xs text-gray-500">{t('ms_import.tasks_label')}</div>
                                                </div>
                                                <div className="bg-white rounded-lg py-2 shadow-xs">
                                                    <div className="text-xl font-bold text-gray-900">{preview.dependencyEdges.length}</div>
                                                    <div className="text-xs text-gray-500">{t('ms_import.dependencies_label')}</div>
                                                </div>
                                            </div>
                                            {phaseNames.length > 0 && (
                                                <div className="text-xs text-gray-600">
                                                    <span className="font-medium">{t('ms_import.phases_heading')} </span>
                                                    {phaseNames.join(' · ')}
                                                    {morePhases > 0 && <span className="text-gray-400"> {t('ms_import.more_count', { count: morePhases })}</span>}
                                                </div>
                                            )}
                                            {taskNames.length > 0 && (
                                                <div className="text-xs text-gray-600">
                                                    <span className="font-medium">{t('ms_import.tasks_heading')} </span>
                                                    {taskNames.join(' · ')}
                                                    {moreTasks > 0 && <span className="text-gray-400"> {t('ms_import.more_count', { count: moreTasks })}</span>}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div>
                                            <p className="text-sm font-semibold text-red-700 mb-1">{t('ms_import.cannot_import')}</p>
                                            <ul className="space-y-1 text-sm text-red-700">
                                                {blockingIssues.map((i, idx) => (
                                                    <li key={idx}>• {translateImportMessage(i, t)}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Warnings (non-blocking) */}
                            {allWarnings.length > 0 && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                    <p className="text-xs font-semibold text-amber-800 mb-1">{t('ms_import.heads_up')}</p>
                                    <ul className="space-y-1 text-xs text-amber-700">
                                        {allWarnings.map((w, idx) => (
                                            <li key={idx}>• {translateImportMessage(w, t)}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* ── Advanced options (collapsed by default) ── */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvanced((v) => !v)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 text-left"
                                >
                                    <span>{t('ms_import.advanced_options')}</span>
                                    <span className="text-gray-400 text-xs">{showAdvanced ? t('ms_import.hide') : t('ms_import.show')}</span>
                                </button>

                                {showAdvanced && (
                                    <div className="px-4 py-4 space-y-5 border-t border-gray-200">

                                        {/* Saved templates */}
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 mb-1">{t('ms_import.saved_mapping_template')}</label>
                                            {templatesLoading ? (
                                                <p className="text-xs text-gray-500">{t('ms_import.loading')}</p>
                                            ) : (
                                                <select
                                                    value={selectedTemplateId}
                                                    onChange={(e) => onSelectTemplate(e.target.value)}
                                                    className="w-full p-2 border rounded-lg text-sm bg-white"
                                                >
                                                    <option value="">{t('ms_import.none')}</option>
                                                    {templates.map((tmpl) => (
                                                        <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>

                                        {/* Row strategy */}
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 mb-1">{t('ms_import.row_strategy')}</label>
                                            <select
                                                value={rowStrategy}
                                                onChange={(e) => setRowStrategy(e.target.value)}
                                                className="w-full p-2 border rounded-lg text-sm"
                                            >
                                                <option value="summary_to_phase">{t('ms_import.strategy_summary_to_phase')}</option>
                                                <option value="all_tasks">{t('ms_import.strategy_all_tasks')}</option>
                                            </select>
                                        </div>

                                        {/* Skip options */}
                                        <div className="space-y-2">
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <input type="checkbox" checked={skipOutline0} onChange={(e) => setSkipOutline0(e.target.checked)} />
                                                {t('ms_import.skip_summary_row')}
                                            </label>
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <input type="checkbox" checked={skipUid0} onChange={(e) => setSkipUid0(e.target.checked)} />
                                                {t('ms_import.skip_system_rows')}
                                            </label>
                                        </div>

                                        {/* Field mapping table */}
                                        <div>
                                            <p className="text-xs font-semibold text-gray-600 mb-2">{t('ms_import.field_mapping')}</p>
                                            <p className="text-xs text-gray-500 mb-2">
                                                {t('ms_import.field_mapping_hint')}
                                            </p>
                                            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-gray-50 sticky top-0">
                                                        <tr>
                                                            <th className="text-left p-2 font-semibold">{t('ms_import.source_field')}</th>
                                                            <th className="text-left p-2 font-semibold">{t('ms_import.maps_to')}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {discovered.map((f) => (
                                                            <tr key={f.key} className="border-t border-gray-100">
                                                                <td className="p-2 align-top">
                                                                    <div className="font-mono text-gray-800">{f.key}</div>
                                                                    <div className="text-gray-400">{f.label}</div>
                                                                    {Array.isArray(f.samples) && f.samples.length > 0 && (
                                                                        <div className="text-gray-400 mt-0.5">{t('ms_import.eg_samples', { samples: f.samples.slice(0, 2).join(', ') })}</div>
                                                                    )}
                                                                </td>
                                                                <td className="p-2">
                                                                    <select
                                                                        value={mergedMappings[f.key] ?? ''}
                                                                        onChange={(e) => setMappings((prev) => ({ ...prev, [f.key]: e.target.value }))}
                                                                        className="w-full p-1 border rounded text-xs"
                                                                    >
                                                                        {targetOptions.map((o) => (
                                                                            <option key={o.value || 'empty'} value={o.value}>{o.label}</option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Save as template */}
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                                                {t('ms_import.save_template_optional')}
                                            </label>
                                            <input
                                                type="text"
                                                value={saveTemplateName}
                                                onChange={(e) => setSaveTemplateName(e.target.value)}
                                                className="w-full p-2 border rounded-lg text-sm"
                                                placeholder={t('ms_import.template_name_placeholder')}
                                            />
                                        </div>

                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                        disabled={busy}
                    >
                        {t('common.cancel')}
                    </button>
                    <PermissionGuard permission={context === 'newProject' ? 'can_create_projects' : 'can_edit_projects'}>
                        <button
                            type="button"
                            onClick={handleImport}
                            disabled={busy || !canImport}
                            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {busy
                                ? t('ms_import.importing')
                                : preview
                                    ? t('ms_import.import_tasks', { count: preview.tasks.length })
                                    : t('ms_import.import')}
                        </button>
                    </PermissionGuard>
                </div>
            </div>
        </div>
    );
}
