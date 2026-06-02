import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatActivityLine } from '../utils/formatActivityLine';
import { activityLineT } from '../utils/activityLineT';

function NotificationBadge() {
    const { state } = useAppContext();
    const [notifications, setNotifications] = useState([]);
    const [isVisible, setIsVisible] = useState(false);
    const hasShownSessionRef = useRef(false);
    const lastActivityIdsRef = useRef(new Set());

    useEffect(() => {
        if (state.userRole?.permissions?.can_view_activity_history !== true) {
            return;
        }

        const activityLog = state.activityLog || [];
        const projectNamesById = {};
        (state.projects || []).forEach((p) => {
            projectNamesById[p.id] = p.name;
        });
        const line = (activity) => formatActivityLine(activity, activityLineT, { projectNamesById });

        // Only show notifications for NEW activities since last session, or once per app session
        const recentActivity = activityLog.slice(0, 4);
        
        if (recentActivity.length === 0) {
            return;
        }

        // On first load, check if we've shown notifications this session
        if (!hasShownSessionRef.current) {
            // Check localStorage for last shown activity ID
            const lastShownId = localStorage.getItem('lastShownActivityId');
            const lastActivityId = recentActivity[0]?.id;
            
            // Only show if there are new activities (different ID) or if no previous ID stored
            if (!lastShownId || lastActivityId !== lastShownId) {
                const formattedActivity = recentActivity.map(activity => ({
                    id: activity.id,
                    message: `${activity.user_name} ${line(activity)}`,
                    time: formatTimeAgo(activity.created_at),
                    type: activity.entity_type || 'general'
                }));

                setNotifications(formattedActivity);
                setIsVisible(true);
                hasShownSessionRef.current = true;
                
                // Store the latest activity ID
                if (lastActivityId) {
                    localStorage.setItem('lastShownActivityId', lastActivityId);
                }

                // Auto-hide after 5 seconds
                const timer = setTimeout(() => {
                    setIsVisible(false);
                }, 5000);

                return () => clearTimeout(timer);
            }
        } else {
            // After initial show, only show for NEW activities (not already shown)
            const newActivities = recentActivity.filter(activity => 
                !lastActivityIdsRef.current.has(activity.id)
            );
            
            if (newActivities.length > 0) {
                // Update the ref with new activity IDs
                newActivities.forEach(activity => {
                    lastActivityIdsRef.current.add(activity.id);
                });
                
                const formattedActivity = newActivities.slice(0, 4).map(activity => ({
                    id: activity.id,
                    message: `${activity.user_name} ${line(activity)}`,
                    time: formatTimeAgo(activity.created_at),
                    type: activity.entity_type || 'general'
                }));

                setNotifications(formattedActivity);
                setIsVisible(true);
                
                // Store the latest activity ID
                if (newActivities[0]?.id) {
                    localStorage.setItem('lastShownActivityId', newActivities[0].id);
                }

                // Auto-hide after 5 seconds
                const timer = setTimeout(() => {
                    setIsVisible(false);
                }, 5000);

                return () => clearTimeout(timer);
            }
        }
        
        // Initialize the ref with current activity IDs
        recentActivity.forEach(activity => {
            lastActivityIdsRef.current.add(activity.id);
        });
    }, [state.activityLog, state.projects, state.userRole]);

    // Helper function to format time ago
    function formatTimeAgo(dateString) {
        const now = new Date();
        const activityDate = new Date(dateString);
        const diffInMinutes = Math.floor((now - activityDate) / (1000 * 60));
        
        if (diffInMinutes < 60) {
            return `${diffInMinutes}m ago`;
        } else if (diffInMinutes < 1440) {
            return `${Math.floor(diffInMinutes / 60)}h ago`;
        } else {
            return `${Math.floor(diffInMinutes / 1440)}d ago`;
        }
    }

    if (state.userRole?.permissions?.can_view_activity_history !== true) {
        return null;
    }

    if (!isVisible || notifications.length === 0) return null;

    return (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-800">Recent Activity</h3>
                    <button type="button" 
                        onClick={() => setIsVisible(false)}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-2">
                    {notifications.slice(0, 3).map(notification => (
                        <div key={notification.id} className="flex items-start gap-2 text-sm">
                            <div className={`w-2 h-2 rounded-full mt-2 ${
                                notification.type === 'task' ? 'bg-blue-500' :
                                notification.type === 'project' ? 'bg-green-500' :
                                notification.type === 'file' ? 'bg-purple-500' :
                                'bg-orange-500'
                            }`} />
                            <div className="flex-1">
                                <p className="text-gray-800">{notification.message}</p>
                                <p className="text-xs text-gray-500">{notification.time}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default NotificationBadge;
