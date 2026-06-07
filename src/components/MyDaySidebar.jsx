import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import Avatar from './Avatar';
import { formatActivityLine } from '../utils/formatActivityLine';
import PermissionGuard from './PermissionGuard';

function MyDaySidebar() {
    const { i18n, t } = useTranslation();
    const { state } = useAppContext();
    const [lastUpdate, setLastUpdate] = useState(new Date());

    const tasks = state.tasks || [];
    const calendarEvents = state.calendarEvents || [];
    const activityLog = state.activityLog || [];
    const projectNamesById = useMemo(() => {
        const m = {};
        (state.projects || []).forEach((p) => {
            m[p.id] = p.name;
        });
        return m;
    }, [state.projects]);

    useEffect(() => {
        // Update timestamp when tasks or events change
        setLastUpdate(new Date());
    }, [tasks.length, calendarEvents.length]);

    // FIXED: assignee_id stores contacts.id, NOT auth.uid()
    // Use state.userContactId (resolved from profiles.contact_id) for correct matching
    // Guard: if userContactId is null (no linked contact yet), show no tasks rather than
    // accidentally matching all unassigned tasks (where assignee_id is also null)
    const myTodos = state.userContactId
        ? tasks.filter(task => task.assignee_id === state.userContactId && !task.completed)
        : [];

    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    // Include events that overlap any part of "today", not just those starting today.
    const todayEvents = calendarEvents.filter((event) => {
        const start = event?.start_time ? new Date(event.start_time) : null;
        const end = event?.end_time ? new Date(event.end_time) : start;
        if (!start || Number.isNaN(start.getTime())) return false;
        const safeEnd = !end || Number.isNaN(end.getTime()) ? start : end;
        return start < todayEnd && safeEnd >= todayStart;
    });

    // Get recent activity from the database (filtered by RLS)
    const recentActivity = activityLog.slice(0, 4).map(activity => ({
        id: activity.id,
        user: { 
            name: activity.user_name, 
            avatar: activity.user_avatar || null // null means use default Avatar component
        },
        description: formatActivityLine(activity, t, { projectNamesById }),
        time: formatTimeAgo(activity.created_at)
    }));

    function formatTimeAgo(dateString) {
        const now = new Date();
        const activityDate = new Date(dateString);
        const diffInMinutes = Math.floor((now - activityDate) / (1000 * 60));
        if (diffInMinutes < 60) {
            return t('activityHistory.time_ago_minutes', { count: diffInMinutes });
        }
        if (diffInMinutes < 1440) {
            return t('activityHistory.time_ago_hours', { count: Math.floor(diffInMinutes / 60) });
        }
        return t('activityHistory.time_ago_days', { count: Math.floor(diffInMinutes / 1440) });
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                <h2 className="font-bold text-lg text-gray-900">{t('myDay.title')}</h2>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span>{t('myDay.live')}</span>
                </div>
            </div>
            <div className="min-w-0">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('myDay.todo_section', { count: myTodos.length })}</h3>
                <div className="space-y-2.5">
                    {myTodos.length > 0 ? myTodos.map(task => (
                        <div key={task.id} className="text-sm text-gray-700">
                            <span className="ui-clamp-2">{task.text}</span>
                        </div>
                    )) : <p className="text-sm text-center py-3 text-gray-400">{t('myDay.no_tasks_assigned')}</p>}
                </div>
            </div>
            <PermissionGuard permission="can_view_activity_history">
            <div className="min-w-0">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('myDay.recent_activity_section')}</h3>
                 <div className="space-y-2.5">
                    {recentActivity.length > 0 ? recentActivity.map(activity => (
                        <div key={activity.id} className="flex items-start gap-2.5 text-sm">
                            {activity.user.avatar ? (
                                <img src={activity.user.avatar} alt={activity.user.name} className="w-7 h-7 rounded-full flex-shrink-0" />
                            ) : (
                                <div className="flex-shrink-0">
                                    <Avatar name={activity.user.name} size="sm" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-gray-700 ui-clamp-3"><span className="font-semibold">{activity.user.name}</span> {activity.description}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{activity.time}</p>
                            </div>
                        </div>
                    )) : (
                        <p className="text-sm text-center py-3 text-gray-400">{t('myDay.no_recent_activity')}</p>
                    )}
                </div>
            </div>
            </PermissionGuard>
            <div className="min-w-0">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('myDay.todays_calendar_section', { count: todayEvents.length })}</h3>
                 <div className="space-y-2.5">
                     {todayEvents.length > 0 ? todayEvents.map(event => {
                        const startTime = new Date(event.start_time);
                        const endTime = new Date(event.end_time);
                        const timeString = startTime.toLocaleTimeString(i18n.language, { 
                            hour: 'numeric', 
                            minute: '2-digit',
                            hour12: true 
                        });
                        const location = event.location || t('myDay.no_location');
                        
                        // Determine icon based on event category or title
                        const getEventIcon = () => {
                            const title = (event.title || '').toLowerCase();
                            const category = event.category?.toLowerCase();

                            if (
                                title.includes('standup') ||
                                title.includes('meeting') ||
                                title.includes('sync') ||
                                title.includes('call') ||
                                title.includes('1:1') ||
                                category === 'meeting'
                            ) {
                                // Video camera icon for meetings
                                return "M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z";
                            } else if (title.includes('site') || title.includes('visit') || title.includes('inspection')) {
                                // Map pin icon for site visits (location/map pin - teardrop shape)
                                return "M12 2.25a8.25 8.25 0 00-8.25 8.25c0 4.5 6.75 11.25 8.25 12.75 1.5-1.5 8.25-8.25 8.25-12.75A8.25 8.25 0 0012 2.25zm0 11.25a3 3 0 110-6 3 3 0 010 6z";
                            } else if (title.includes('presentation') || title.includes('demo')) {
                                // Presentation screen icon
                                return "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l-1-3m1 3l-1-3m-16.5-3h9v2.25M6 20.25l2.25-2.25M6 20.25l-2.25-2.25M6 20.25v-2.25";
                            } else {
                                // Calendar icon for general events
                                return "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5";
                            }
                        };

                        return (
                            <div key={event.id} className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                                <div className="flex items-start gap-2.5">
                                    <div className="flex-shrink-0 mt-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="#3B82F6" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d={getEventIcon()} />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-gray-900 text-sm leading-tight ui-clamp-2">{event.title}</h4>
                                        <p className="mt-1 text-xs text-gray-500 ui-clamp-2">
                                            {event.is_all_day ? t('myDay.all_day') : timeString} • {location}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                     }) : <p className="text-sm text-center py-3 text-gray-400">{t('myDay.no_events_today')}</p>}
                </div>
            </div>
            <div className="text-xs text-gray-400 pt-3 border-t border-gray-200">
                {t('myDay.last_updated', { time: lastUpdate.toLocaleTimeString(i18n.language) })}
            </div>
        </div>
    );
}

export default MyDaySidebar;