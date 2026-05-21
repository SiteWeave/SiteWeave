import React, { memo, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';

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

function getTaskAssigneeLabel(task, contactById) {
    const rel = task?.contacts;
    if (rel && typeof rel === 'object') {
        const name = Array.isArray(rel) ? rel[0]?.name : rel.name;
        if (name) return name;
    }
    if (task?.assignee_id) {
        const c = contactById.get(String(task.assignee_id));
        if (c?.name) return c.name;
    }
    return 'Unassigned';
}

function groupTasksByProject(tasks, projects) {
    const projectById = new Map((projects || []).map((project) => [String(project.id), project]));
    const grouped = new Map();
    (tasks || []).forEach((task) => {
        const key = String(task.project_id || 'unassigned');
        const project = projectById.get(key);
        if (!grouped.has(key)) {
            grouped.set(key, {
                projectName: project?.name || 'No project',
                items: [],
            });
        }
        grouped.get(key).items.push(task);
    });
    return Array.from(grouped.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

const DashboardStats = memo(function DashboardStats() {
    const { state } = useAppContext();
    const [showOverdueModal, setShowOverdueModal] = useState(false);
    const [showCompletedModal, setShowCompletedModal] = useState(false);

    const projects = state.projects || [];
    const tasks = state.tasks || [];
    const contacts = state.contacts || [];
    const contactById = useMemo(() => {
        const m = new Map();
        contacts.forEach((c) => {
            if (c?.id != null) m.set(String(c.id), c);
        });
        return m;
    }, [contacts]);

    const activeProjects = projects.filter(p => p.status !== 'completed').length;
    const completedTasks = tasks.filter(t => t.completed).length;
    const overdueTasks = tasks.filter(task => {
        if (!task.due_date || task.completed) return false;
        return new Date(task.due_date) < new Date();
    }).length;
    const overdueGroups = useMemo(() => {
        const overdueItems = tasks.filter((task) => {
            if (!task.due_date || task.completed) return false;
            return new Date(task.due_date) < new Date();
        });
        return groupTasksByProject(overdueItems, projects);
    }, [tasks, projects]);

    const completedGroups = useMemo(() => {
        const completedItems = tasks.filter((task) => task.completed);
        return groupTasksByProject(completedItems, projects);
    }, [tasks, projects]);

    const stats = [
        {
            title: 'Active Projects',
            value: activeProjects,
            total: null,
            color: 'blue',
            icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
        },
        {
            title: 'Tasks Completed',
            value: completedTasks,
            total: null,
            color: 'green',
            icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
        },
        {
            title: 'Overdue Tasks',
            value: overdueTasks,
            total: null,
            color: overdueTasks > 0 ? 'red' : 'gray',
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
            {stats.map((stat, index) => (
                <button
                    key={index}
                    type="button"
                    disabled={
                        (stat.title === 'Overdue Tasks' && stat.value <= 0)
                        || (stat.title === 'Tasks Completed' && stat.value <= 0)
                    }
                    onClick={() => {
                        if (stat.title === 'Overdue Tasks' && stat.value > 0) {
                            setShowOverdueModal(true);
                        }
                        if (stat.title === 'Tasks Completed' && stat.value > 0) {
                            setShowCompletedModal(true);
                        }
                    }}
                    className={`app-card-soft p-5 border text-left w-full ${
                        (stat.title === 'Overdue Tasks' || stat.title === 'Tasks Completed') && stat.value > 0
                            ? 'cursor-pointer hover:shadow-md transition-shadow'
                            : 'cursor-default'
                    } ${getColorClasses(stat.color)}`}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium opacity-75 mb-1.5 uppercase tracking-wide">{stat.title}</p>
                            <p className="text-3xl font-bold">{stat.value}</p>
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
                        <h3 className="text-lg font-semibold text-gray-900">Overdue Tasks by Project</h3>
                        <button
                            type="button"
                            onClick={() => setShowOverdueModal(false)}
                            className="text-sm text-gray-600 hover:text-gray-900"
                        >
                            Close
                        </button>
                    </div>
                    <div className="p-5 overflow-y-auto max-h-[65vh] space-y-4">
                        {overdueGroups.length === 0 ? (
                            <p className="text-sm text-gray-500">No overdue tasks.</p>
                        ) : overdueGroups.map((group) => (
                            <div key={group.projectName} className="border border-gray-100 rounded-lg p-3">
                                <p className="text-sm font-semibold text-gray-800 mb-2">{group.projectName}</p>
                                <ul className="space-y-1">
                                    {group.items.map((task) => (
                                        <li key={task.id} className="text-sm text-gray-700">
                                            <span className="font-medium text-gray-800">{task.text}</span>
                                            <span className="mt-0.5 block text-xs text-gray-500">
                                                Assigned to {getTaskAssigneeLabel(task, contactById)}
                                                <span className="text-gray-400"> · </span>
                                                Due{' '}
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
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        {showCompletedModal && (
            <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-gray-200 max-h-[80vh] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900">Completed Tasks by Project</h3>
                        <button
                            type="button"
                            onClick={() => setShowCompletedModal(false)}
                            className="text-sm text-gray-600 hover:text-gray-900"
                        >
                            Close
                        </button>
                    </div>
                    <div className="p-5 overflow-y-auto max-h-[65vh] space-y-4">
                        {completedGroups.length === 0 ? (
                            <p className="text-sm text-gray-500">No completed tasks.</p>
                        ) : completedGroups.map((group) => (
                            <div key={group.projectName} className="border border-gray-100 rounded-lg p-3">
                                <p className="text-sm font-semibold text-gray-800 mb-2">{group.projectName}</p>
                                <ul className="space-y-1">
                                    {group.items.map((task) => (
                                        <li key={task.id} className="text-sm text-gray-700">
                                            <span className="font-medium text-gray-800">{task.text}</span>
                                            <span className="mt-0.5 block text-xs text-gray-500">
                                                Assigned to {getTaskAssigneeLabel(task, contactById)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        </>
    );
});

export default DashboardStats;
