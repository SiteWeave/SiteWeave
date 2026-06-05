import React, { useState, useEffect } from 'react';
import { useAppContext, supabaseClient } from '../context/AppContext';

function NotificationBadge() {
    const { state } = useAppContext();
    const [notifications, setNotifications] = useState([]);
    const [isVisible, setIsVisible] = useState(false);
    const [busyId, setBusyId] = useState(null);

    useEffect(() => {
        if (!state.user?.email) {
            return;
        }

        const loadNotifications = async () => {
            let query = supabaseClient
                .from('user_notifications')
                .select('*')
                .is('read_at', null)
                .order('created_at', { ascending: false })
                .limit(6);
            if (state.user.id) {
                query = query.or(`recipient_email.ilike.${state.user.email},recipient_user_id.eq.${state.user.id}`);
            } else {
                query = query.ilike('recipient_email', state.user.email);
            }
            const { data, error } = await query;
            if (error) {
                console.error('Failed loading notifications:', error.message);
                return;
            }
            setNotifications(data || []);
            setIsVisible((data || []).length > 0);
        };

        loadNotifications();

        const channel = supabaseClient
            .channel(`user-notifications-${state.user.id || state.user.email}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notifications' }, (payload) => {
                const nextRow = payload.new || payload.old;
                const emailMatch = nextRow?.recipient_email?.toLowerCase?.() === state.user.email.toLowerCase();
                const userMatch = !!state.user.id && nextRow?.recipient_user_id === state.user.id;
                if (!emailMatch && !userMatch) return;

                setNotifications((prev) => {
                    if (payload.eventType === 'DELETE') {
                        return prev.filter((n) => n.id !== nextRow.id);
                    }
                    const merged = [nextRow, ...prev.filter((n) => n.id !== nextRow.id)];
                    return merged
                        .filter((n) => !n.read_at)
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .slice(0, 6);
                });
                setIsVisible(true);
            })
            .subscribe();

        return () => {
            supabaseClient.removeChannel(channel);
        };
    }, [state.user?.email, state.user?.id]);

    const runAction = async (notificationId, actionType) => {
        setBusyId(notificationId);
        try {
            const { error } = await supabaseClient.functions.invoke('dispatch-notification', {
                body: {
                    action: 'notification_action',
                    notificationId,
                    actionType,
                    userId: state.user?.id || null,
                },
            });
            if (error) throw error;
            setNotifications((prev) => {
                const next = prev.filter((row) => {
                    if (row.id !== notificationId) return true;
                    return actionType !== 'mark_read';
                });
                setIsVisible(next.length > 0);
                return next;
            });
        } catch (error) {
            console.error(`Failed notification action ${actionType}:`, error.message || error);
        } finally {
            setBusyId(null);
        }
    };

    if (!isVisible || notifications.length === 0) return null;

    return (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
                    <button type="button" 
                        onClick={() => setIsVisible(false)}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-2">
                    {notifications.slice(0, 4).map(notification => {
                        const badgeKey = notification.metadata?.batch_key;
                        return (
                        <div key={notification.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                    <p className="text-gray-900 font-medium">{notification.title}</p>
                                    <p className="text-gray-700">{notification.body}</p>
                                    {badgeKey && (
                                        <p className="text-xs text-emerald-600 mt-1">Batched by project</p>
                                    )}
                                </div>
                                <span className="text-[11px] text-gray-500">
                                    {new Date(notification.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={busyId === notification.id}
                                    onClick={() => runAction(notification.id, 'acknowledge')}
                                    className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                                >
                                    Acknowledge
                                </button>
                                <button
                                    type="button"
                                    disabled={busyId === notification.id}
                                    onClick={() => runAction(notification.id, 'mark_read')}
                                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Mark read
                                </button>
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default NotificationBadge;
