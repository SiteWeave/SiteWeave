import React from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { ROUTE_PATHS } from '../config/routes'

function notificationLink(item) {
  const meta = item?.metadata || {}
  if (item?.source_type === 'calendar_invite') {
    if (typeof meta.screen === 'string' && meta.screen.startsWith('/')) {
      return meta.screen
    }
    return ROUTE_PATHS.calendar
  }
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
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState([])
  const [unreadCount, setUnreadCount] = React.useState(0)

  const loadNotifications = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('user_notifications')
      .select('id,title,body,created_at,read_at,project_id,metadata,source_type')
      .order('created_at', { ascending: false })
      .limit(50)

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

  const setReadState = async (id, read) => {
    const userRes = await supabase.auth.getUser()
    const userId = userRes.data?.user?.id || null
    const { error } = await supabase.functions.invoke('dispatch-notification', {
      body: {
        action: 'notification_action',
        notificationId: id,
        userId,
        actionType: read ? 'mark_read' : 'mark_unread',
      },
    })
    if (error) {
      console.error('notification read toggle failed:', error)
      return
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, read_at: read ? new Date().toISOString() : null }
          : item,
      ),
    )
    setUnreadCount((prev) => {
      const row = items.find((item) => item.id === id)
      if (!row) return prev
      if (read && !row.read_at) return Math.max(0, prev - 1)
      if (!read && row.read_at) return prev + 1
      return prev
    })
  }

  const handleNotificationClick = async (item) => {
    setOpen(false)
    if (!item.read_at) {
      await setReadState(item.id, true)
    }
    navigate(notificationLink(item))
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-700"
        aria-label="Open notifications"
        data-testid="notification-center-bell"
      >
        <span className="text-lg" aria-hidden>🔔</span>
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] text-center text-[10px] leading-4 bg-red-600 text-white rounded-full px-1">
            {unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-96 app-card shadow-xl z-30 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50/80">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-stretch border-b border-slate-100 last:border-b-0 ${
                  item.read_at ? '' : 'bg-blue-50/50'
                }`}
              >
                <button
                  type="button"
                  className="flex-1 px-3 py-2.5 text-left hover:bg-slate-50 min-w-0"
                  onClick={() => handleNotificationClick(item)}
                >
                  <p className="text-sm font-medium text-slate-900">{item.title || 'Update'}</p>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{item.body || 'You have a new notification'}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{new Date(item.created_at).toLocaleString()}</p>
                </button>
                <button
                  type="button"
                  className="shrink-0 px-2 text-[11px] font-semibold text-blue-700 hover:bg-slate-50"
                  onClick={(e) => {
                    e.stopPropagation()
                    setReadState(item.id, !item.read_at)
                  }}
                >
                  {item.read_at ? 'Unread' : 'Read'}
                </button>
              </div>
            ))}
            {items.length === 0 ? <p className="p-3 text-sm text-slate-500">No notifications yet.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
