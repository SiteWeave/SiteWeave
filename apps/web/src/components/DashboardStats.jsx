import React, { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    fetchCompletedTasksCount,
    fetchCompletedTasksList,
    fetchOverdueTasksCount,
    fetchOverdueTasksList,
    groupTasksByProject,
    loadWithFallback,
} from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../context/AppContext';

function formatOverdueDueDate(value) {
    if (value == null || value === '') return '';
    const s = String(value).trim();
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let d;
    if (ymd) {
        const y = Number(ymd[1]);
        const m = Number(ymd[2]) - 1;
        const day = Number(ymd[3]);
        d = new Date(y, m, day);
    } else {
        d = new Date(s);
    }
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function getTaskAssigneeLabel(task, contactById, t) {
    const rel = task?.contacts;
    if (rel && typeof rel === 'object') {
        const name = Array.isArray(rel) ? rel[0]?.name : rel.name;
        if (name) return name;
    }
    if (task?.assignee_id) {
        const c = contactById.get(String(task.assignee_id));
        if (c?.name) return c.name;
    }
    return t('common.unassigned');
}

function formatStatValue(value) {
    if (value == null) return '—';
    return value;
}

function overdueGroupKey(group, index) {
    return String(group.projectId ?? group.items?.[0]?.project_id ?? `group-${index}`);
}

const DashboardStats = memo(function DashboardStats() {
    const { t } = useTranslation();
    const { state } = useAppContext();
    const [showOverdueModal, setShowOverdueModal] = useState(false);
    const [showCompletedModal, setShowCompletedModal] = useState(false);
    const [statsLoading, setStatsLoading] = useState(true);
    const [completedCount, setCompletedCount] = useState(null);
    const [overdueCount, setOverdueCount] = useState(null);
    const [overdueModalTasks, setOverdueModalTasks] = useState([]);
    const [completedModalTasks, setCompletedModalTasks] = useState([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [collapsedOverdueGroupKeys, setCollapsedOverdueGroupKeys] = useState(() => new Set());
    const [collapsedCompletedGroupKeys, setCollapsedCompletedGroupKeys] = useState(() => new Set());

    const projects = state.projects || [];
    const accessibleProjectIds = useMemo(
        () => projects.map((project) => project.id).filter(Boolean),
        [projects],
    );

    useEffect(() => {
        if (!state.user || state.authLoading) return undefined;

        let cancelled = false;

        const loadStats = async () => {
            setStatsLoading(true);
            const scope = { projectIds: accessibleProjectIds };
            const [completed, overdue] = await Promise.all([
                loadWithFallback(
                    () => fetchCompletedTasksCount(supabaseClient, state.user.id, scope),
                    null,
                ),
                loadWithFallback(
                    () => fetchOverdueTasksCount(supabaseClient, state.user.id, scope),
                    null,
                ),
            ]);
            if (!cancelled) {
                setCompletedCount(completed);
                setOverdueCount(overdue);
                setStatsLoading(false);
            }
        };

        if (typeof requestIdleCallback === 'function') {
            const idleId = requestIdleCallback(() => {
                if (!cancelled) loadStats();
            }, { timeout: 500 });
            return () => {
                cancelled = true;
                cancelIdleCallback(idleId);
            };
        }

        const timerId = setTimeout(() => {
            if (!cancelled) loadStats();
        }, 100);
        return () => {
            cancelled = true;
            clearTimeout(timerId);
        };
    }, [state.user, state.authLoading, accessibleProjectIds]);

    useEffect(() => {
        if (!showOverdueModal) return;
        setCollapsedOverdueGroupKeys(new Set());
        let cancelled = false;
        (async () => {
            setModalLoading(true);
            try {
                const rows = await fetchOverdueTasksList(supabaseClient, {
                    projectIds: accessibleProjectIds,
                });
                if (!cancelled) setOverdueModalTasks(rows);
            } catch (e) {
                console.error(e);
                if (!cancelled) setOverdueModalTasks([]);
            } finally {
                if (!cancelled) setModalLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [showOverdueModal, accessibleProjectIds]);

    useEffect(() => {
        if (!showCompletedModal) return;
        setCollapsedCompletedGroupKeys(new Set());
        let cancelled = false;
        (async () => {
            setModalLoading(true);
            try {
                const rows = await fetchCompletedTasksList(supabaseClient, {
                    projectIds: accessibleProjectIds,
                });
                if (!cancelled) setCompletedModalTasks(rows);
            } catch (e) {
                console.error(e);
                if (!cancelled) setCompletedModalTasks([]);
            } finally {
                if (!cancelled) setModalLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [showCompletedModal, accessibleProjectIds]);
    const contacts = state.contacts || [];
    const contactById = useMemo(() => {
        const m = new Map();
        contacts.forEach((c) => {
            if (c?.id != null) m.set(String(c.id), c);
        });
        return m;
    }, [contacts]);

    const activeProjects = projects.filter(p => p.status !== 'completed').length;
    const noProjectLabel = t('common.no_project');
    const overdueGroups = useMemo(
        () => groupTasksByProject(overdueModalTasks, projects, { noProjectLabel }),
        [overdueModalTasks, projects, noProjectLabel],
    );
    const completedGroups = useMemo(
        () => groupTasksByProject(completedModalTasks, projects, { noProjectLabel }),
        [completedModalTasks, projects, noProjectLabel],
    );

    const toggleOverdueGroup = (key) => {
        setCollapsedOverdueGroupKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const toggleCompletedGroup = (key) => {
        setCollapsedCompletedGroupKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const stats = [
        {
            id: 'active_projects',
            title: t('dashboard.stats_active_projects'),
            value: activeProjects,
            total: null,
            color: 'blue',
            icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
        },
        {
            id: 'tasks_completed',
            title: t('dashboard.stats_tasks_completed'),
            value: formatStatValue(completedCount),
            numericValue: completedCount ?? 0,
            total: null,
            color: 'green',
            icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
        },
        {
            id: 'overdue_tasks',
            title: t('dashboard.stats_overdue_tasks'),
            value: formatStatValue(overdueCount),
            numericValue: overdueCount ?? 0,
            total: null,
            color: (overdueCount ?? 0) > 0 ? 'red' : 'gray',
            icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
        }
    ];

    const getColorClasses = (color) => {
        const colors = {
            blue: 'bg-blue-50 text-blue-600 border-blue-200',
            green: 'bg-green-50 text-green-600 border-green-200',
            red: 'bg-red-50 text-red-600 border-red-200',
            purple: 'bg-purple-50 text-purple-600 border-purple-200',
            gray: 'bg-gray-50 text-gray-600 border-gray-200'
        };
        return colors[color] || colors.gray;
    };

    return (
        <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {stats.map((stat) => (
                <button
                    key={stat.id}
                    type="button"
                    disabled={
                        statsLoading
                        || (stat.id === 'overdue_tasks' && stat.numericValue <= 0)
                        || (stat.id === 'tasks_completed' && stat.numericValue <= 0)
                    }
                    onClick={() => {
                        if (stat.id === 'overdue_tasks' && stat.numericValue > 0) {
                            setShowOverdueModal(true);
                        }
                        if (stat.id === 'tasks_completed' && stat.numericValue > 0) {
                            setShowCompletedModal(true);
                        }
                    }}
                    className={`p-5 rounded-lg border text-left w-full btn-smooth ${
                        (stat.id === 'overdue_tasks' || stat.id === 'tasks_completed') && stat.numericValue > 0
                            ? 'cursor-pointer hover:shadow-md transition-shadow'
                            : 'cursor-default'
                    } ${getColorClasses(stat.color)}`}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium opacity-75 mb-1.5 uppercase tracking-wide">{stat.title}</p>
                            <p className="text-3xl font-bold tabular-nums">{stat.value}</p>
                            {stat.total !== null && (
                                <p className="text-xs opacity-75 mt-1">of {stat.total} total</p>
                            )}
                        </div>
                        <div className="p-2.5 rounded-lg bg-white/50">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={stat.icon} />
                            </svg>
                        </div>
                    </div>
                </button>
            ))}
        </div>
        {showOverdueModal && (
            <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-gray-200 max-h-[80vh] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.overdue_tasks_by_project')}</h3>
                        <button
                            type="button"
                            onClick={() => setShowOverdueModal(false)}
                            className="text-sm text-gray-600 hover:text-gray-900"
                        >
                            {t('common.close')}
                        </button>
                    </div>
                    <div className="p-5 overflow-y-auto max-h-[65vh] space-y-4">
                        {modalLoading ? (
                            <p className="text-sm text-gray-500">{t('dashboard.loading_tasks')}</p>
                        ) : overdueGroups.length === 0 ? (
                            <p className="text-sm text-gray-500">{t('dashboard.no_overdue_tasks')}</p>
                        ) : overdueGroups.map((group, index) => {
                            const key = overdueGroupKey(group, index);
                            const isCollapsed = collapsedOverdueGroupKeys.has(key);
                            const taskCount = group.items.length;

                            return (
                            <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => toggleOverdueGroup(key)}
                                    aria-expanded={!isCollapsed}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-800">{group.projectName}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {taskCount === 1
                                                ? t('projectDetail.phase_task_count_one', { count: taskCount })
                                                : t('projectDetail.phase_task_count_other', { count: taskCount })}
                                        </p>
                                    </div>
                                    <svg
                                        className="w-5 h-5 shrink-0 text-gray-500"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        aria-hidden
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d={isCollapsed ? 'M19 9l-7 7-7-7' : 'M5 15l7-7 7 7'}
                                        />
                                    </svg>
                                </button>
                                {!isCollapsed && (
                                <ul className="divide-y divide-gray-100">
                                    {group.items.map((task) => (
                                        <li key={task.id} className="px-4 py-3 text-sm text-gray-700">
                                            <span className="font-medium text-gray-800">{task.text}</span>
                                            <span className="mt-0.5 block text-xs text-gray-500">
                                                {t('dashboard.assigned_to', { name: getTaskAssigneeLabel(task, contactById, t) })}
                                                <span className="text-gray-400"> · </span>
                                                {t('dashboard.due_label')}{' '}
                                                <time
                                                    dateTime={typeof task.due_date === 'string' ? task.due_date : undefined}
                                                    className="font-medium text-gray-700 tabular-nums"
                                                >
                                                    {formatOverdueDueDate(task.due_date)}
                                                </time>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                )}
                            </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
        {showCompletedModal && (
            <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-gray-200 max-h-[80vh] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.completed_tasks_by_project')}</h3>
                        <button
                            type="button"
                            onClick={() => setShowCompletedModal(false)}
                            className="text-sm text-gray-600 hover:text-gray-900"
                        >
                            {t('common.close')}
                        </button>
                    </div>
                    <div className="p-5 overflow-y-auto max-h-[65vh] space-y-4">
                        {modalLoading ? (
                            <p className="text-sm text-gray-500">{t('dashboard.loading_tasks')}</p>
                        ) : completedGroups.length === 0 ? (
                            <p className="text-sm text-gray-500">{t('dashboard.no_completed_tasks')}</p>
                        ) : completedGroups.map((group, index) => {
                            const key = overdueGroupKey(group, index);
                            const isCollapsed = collapsedCompletedGroupKeys.has(key);
                            const taskCount = group.items.length;

                            return (
                            <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => toggleCompletedGroup(key)}
                                    aria-expanded={!isCollapsed}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-800">{group.projectName}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {taskCount === 1
                                                ? t('projectDetail.phase_task_count_one', { count: taskCount })
                                                : t('projectDetail.phase_task_count_other', { count: taskCount })}
                                        </p>
                                    </div>
                                    <svg
                                        className="w-5 h-5 shrink-0 text-gray-500"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        aria-hidden
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d={isCollapsed ? 'M19 9l-7 7-7-7' : 'M5 15l7-7 7 7'}
                                        />
                                    </svg>
                                </button>
                                {!isCollapsed && (
                                <ul className="divide-y divide-gray-100">
                                    {group.items.map((task) => (
                                        <li key={task.id} className="px-4 py-3 text-sm text-gray-700">
                                            <span className="font-medium text-gray-800">{task.text}</span>
                                            <span className="mt-0.5 block text-xs text-gray-500">
                                                {t('dashboard.assigned_to', { name: getTaskAssigneeLabel(task, contactById, t) })}
                                                {task.completed_at && (
                                                    <>
                                                        <span className="text-gray-400"> · </span>
                                                        {t('dashboard.completed_label')}{' '}
                                                        <time
                                                            dateTime={typeof task.completed_at === 'string' ? task.completed_at : undefined}
                                                            className="font-medium text-gray-700 tabular-nums"
                                                        >
                                                            {formatOverdueDueDate(task.completed_at)}
                                                        </time>
                                                    </>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                )}
                            </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
        </>
    );
});

export default DashboardStats;
