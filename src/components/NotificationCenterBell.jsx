import React from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { ROUTE_PATHS } from '../config/routes'

function notificationLink(item) {
  const meta = item?.metadata || {}
  if (typeof meta.screen === 'string' && meta.screen.startsWith('/projects/')) {
    return meta.screen
  }
  if (item?.source_type === 'stream_post' && item.project_id) {
    return ROUTE_PATHS.projectStream.replace(':id', item.project_id)
  }
  if (item.project_id) {
    return ROUTE_PATHS.projectTasks.replace(':id', item.project_id)
  }
  return ROUTE_PATHS.home
}

export default function NotificationCenterBell() {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState([])
  const [unreadCount, setUnreadCount] = React.useState(0)

  const loadNotifications = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('user_notifications')
      .select('id,title,body,created_at,read_at,project_id,metadata,source_type')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      setItems([])
      setUnreadCount(0)
      return
    }
    const list = data || []
    setItems(list)
    setUnreadCount(list.filter((item) => !item.read_at).length)
  }, [])

  React.useEffect(() => {
    loadNotifications()
    const channel = supabase
      .channel('notification_center_bell')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_notifications' },
        () => loadNotifications(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadNotifications])

  const handleNotificationClick = async (id) => {
    setOpen(false)
    const current = items.find((item) => item.id === id)
    if (!current || current.read_at) return
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
    setUnreadCount((prev) => Math.max(0, prev - 1))
    await supabase
      .from('user_notifications')
      .update({
        read_at: new Date().toISOString(),
        read_by_user_id: (await supabase.auth.getUser()).data?.user?.id || null,
      })
      .eq('id', id)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-700"
        aria-label="Open notifications"
      >
        <span className="text-lg" aria-hidden>🔔</span>
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] text-center text-[10px] leading-4 bg-red-600 text-white rounded-full px-1">
            {unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-80 app-card shadow-xl z-30 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50/80">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <Link
                key={item.id}
                to={notificationLink(item)}
                className={`block px-3 py-2.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 ${item.read_at ? '' : 'bg-blue-50/50'}`}
                onClick={() => handleNotificationClick(item.id)}
              >
                <p className="text-sm font-medium text-slate-900">{item.title || 'Update'}</p>
                <p className="text-xs text-slate-600 mt-1">{item.body || 'You have a new notification'}</p>
                <p className="text-[11px] text-slate-400 mt-1">{new Date(item.created_at).toLocaleString()}</p>
              </Link>
            ))}
            {items.length === 0 ? <p className="p-3 text-sm text-slate-500">No notifications yet.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
