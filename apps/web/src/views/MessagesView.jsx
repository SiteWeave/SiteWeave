import React from 'react'
import { useAppContext, supabaseClient } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import LoadingSpinner from '../components/LoadingSpinner'
import ProjectTeamPanel from '../components/ProjectTeamPanel'
import { fetchChannelMessages, sendMessage, fetchUnreadCounts, getTypingUsers, markMessageAsRead, uploadFile, fetchMessageWithUserInfo, blockUser } from '@siteweave/core-logic'
import ReportContentModal from '../components/moderation/ReportContentModal'

export default function MessagesView({ embedded = false, onOpenDirectory = null }) {
  const { state, dispatch } = useAppContext()
  const { addToast } = useToast()
  const [newMessage, setNewMessage] = React.useState('')
  const [typingUsers, setTypingUsers] = React.useState([])
  const [unreadCounts, setUnreadCounts] = React.useState({})
  const [sending, setSending] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const fileInputRef = React.useRef(null)
  const messagesEndRef = React.useRef(null)
  const [reportTarget, setReportTarget] = React.useState(null)

  const channels = state.messageChannels || []
  const activeChannel = channels.find((channel) => channel.id === state.selectedChannelId)

  const reloadChannelMessages = React.useCallback(async () => {
    if (!activeChannel?.id || !state.user?.id) return
    const rows = await fetchChannelMessages(supabaseClient, activeChannel.id, state.user.id)
    dispatch({ type: 'SET_CHANNEL_MESSAGES', payload: { channelId: activeChannel.id, messages: rows || [] } })
  }, [activeChannel?.id, state.user?.id, dispatch])

  const handleBlockUser = React.useCallback(async (message) => {
    if (!state.user?.id || !message?.user_id) return
    const name = message.user?.name || message.user_name || 'this user'
    if (!window.confirm(`Block ${name}? Their messages will be hidden from you.`)) return
    try {
      await blockUser(supabaseClient, state.user.id, message.user_id)
      addToast(`${name} has been blocked.`, 'success')
      await reloadChannelMessages()
    } catch (error) {
      console.error('Error blocking user:', error)
      addToast('Failed to block user. Please try again.', 'error')
    }
  }, [state.user?.id, addToast, reloadChannelMessages])
  const projectById = React.useMemo(() => {
    const map = new Map()
    ;(state.projects || []).forEach((project) => map.set(project.id, project))
    return map
  }, [state.projects])
  const channelMessages = React.useMemo(
    () => (state.messages || []).filter((message) => message.channel_id === state.selectedChannelId && !message.parent_message_id),
    [state.messages, state.selectedChannelId],
  )
  const project = projectById.get(activeChannel?.project_id)
  const projectContacts = React.useMemo(
    () => (state.contacts || []).filter(
      (contact) => Array.isArray(contact.project_contacts) &&
      contact.project_contacts.some((pc) => String(pc.project_id) === String(project?.id)),
    ),
    [state.contacts, project?.id],
  )

  React.useEffect(() => {
    if (!state.selectedChannelId && channels.length > 0) {
      dispatch({ type: 'SET_CHANNEL', payload: channels[0].id })
    }
  }, [state.selectedChannelId, channels, dispatch])

  React.useEffect(() => {
    if (!activeChannel?.id || !state.user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await fetchChannelMessages(supabaseClient, activeChannel.id, state.user.id)
        if (!cancelled) {
          dispatch({ type: 'SET_CHANNEL_MESSAGES', payload: { channelId: activeChannel.id, messages: rows || [] } })
        }
      } catch (error) {
        if (!cancelled) addToast(`Error loading messages: ${error.message}`, 'error')
      }
    })()
    return () => { cancelled = true }
  }, [activeChannel?.id, state.user?.id, dispatch, addToast])

  React.useEffect(() => {
    if (channels.length === 0 || !state.user?.id) return
    fetchUnreadCounts(supabaseClient, state.user.id, channels.map((channel) => channel.id))
      .then((counts) => setUnreadCounts(counts || {}))
      .catch((error) => console.error('Unread count error:', error))
  }, [channels, state.user?.id, state.messages.length])

  React.useEffect(() => {
    if (!activeChannel?.id || !state.user?.id) return
    const timer = setInterval(async () => {
      try {
        const users = await getTypingUsers(supabaseClient, activeChannel.id, state.user.id)
        setTypingUsers(users || [])
      } catch (error) {
        console.error('Typing user error:', error)
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [activeChannel?.id, state.user?.id])

  React.useEffect(() => {
    if (!activeChannel?.id) return
    const realtimeChannel = supabaseClient
      .channel(`messages:${activeChannel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${activeChannel.id}`,
      }, async (payload) => {
        try {
          const enriched = await fetchMessageWithUserInfo(supabaseClient, payload.new)
          dispatch({ type: 'ADD_MESSAGE', payload: enriched })
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        } catch {
          dispatch({ type: 'ADD_MESSAGE', payload: payload.new })
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${activeChannel.id}`,
      }, (payload) => {
        dispatch({ type: 'UPDATE_MESSAGE', payload: payload.new })
      })
      .subscribe()

    return () => {
      supabaseClient.removeChannel(realtimeChannel)
    }
  }, [activeChannel?.id, dispatch])

  React.useEffect(() => {
    if (!activeChannel?.id || channelMessages.length === 0 || !state.user?.id) return
    const latest = channelMessages[channelMessages.length - 1]
    if (latest?.id) {
      markMessageAsRead(supabaseClient, latest.id, state.user.id).catch(() => {})
    }
  }, [activeChannel?.id, channelMessages, state.user?.id])

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [channelMessages.length])

  const handleSend = async (event, file = null) => {
    if (event) event.preventDefault()
    if (!activeChannel?.id || !state.user?.id || (!newMessage.trim() && !file)) return

    setSending(true)
    try {
      const payload = {
        channel_id: activeChannel.id,
        user_id: state.user.id,
        content: newMessage.trim(),
        type: 'text',
        topic: 'General',
        extension: 'txt',
      }

      if (file) {
        setIsUploading(true)
        const filePath = `messages/${activeChannel.id}/${Date.now()}_${file.name}`
        await uploadFile(supabaseClient, 'message_files', filePath, file)
        payload.file_url = supabaseClient.storage.from('message_files').getPublicUrl(filePath).data.publicUrl
        payload.file_name = file.name
        payload.type = file.type?.startsWith('image/') ? 'image' : 'file'
      }

      await sendMessage(supabaseClient, payload)
      setNewMessage('')
    } catch (error) {
      addToast(`Error sending message: ${error.message}`, 'error')
    } finally {
      setSending(false)
      setIsUploading(false)
    }
  }

  if (state.isLoading) {
    return (
      <div className={embedded ? 'mt-0' : 'mt-16'}>
        <LoadingSpinner size="lg" text="Loading messages..." />
      </div>
    )
  }

  return (
    <div className={embedded ? '' : 'mx-auto max-w-7xl px-2 sm:px-4 py-4 space-y-4'}>
      {!embedded && (
        <div className="app-card p-4 sm:p-5">
          <h1 className="app-section-title">Messages</h1>
          <p className="app-section-subtitle mt-1">Project-based communication with realtime updates and attachments.</p>
        </div>
      )}
      <div className={`${embedded ? 'h-[calc(100vh-14rem)]' : 'h-[calc(100vh-13rem)]'} app-card overflow-hidden flex`}>
        <aside className="w-80 border-r border-slate-200 bg-slate-50/80 p-2.5 space-y-1 overflow-y-auto">
          {onOpenDirectory ? (
            <button
              type="button"
              onClick={onOpenDirectory}
              className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 shadow-xs hover:bg-slate-50"
            >
              Open directory
            </button>
          ) : null}
          {channels.map((channel) => {
            const project = projectById.get(channel.project_id)
            return (
              <button
                key={channel.id}
                onClick={() => dispatch({ type: 'SET_CHANNEL', payload: channel.id })}
                className={`w-full text-left rounded-lg px-3 py-2.5 ${channel.id === state.selectedChannelId ? 'bg-blue-100/80 text-blue-800 border border-blue-200' : 'hover:bg-slate-100 text-slate-700 border border-transparent'}`}
              >
                <p className="font-medium truncate">{project?.name || channel.name}</p>
                <p className="text-xs text-slate-500 truncate">{channel.name}</p>
                {unreadCounts[channel.id] ? <p className="text-xs text-red-600 mt-1">{unreadCounts[channel.id]} unread</p> : null}
              </button>
            )
          })}
        </aside>
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-white">
            {channelMessages.map((message) => {
              const isCurrentUser = message.user_id === state.user?.id
              return (
              <div key={message.id} className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-600 font-medium">{message.user?.name || message.user_name || 'Team member'}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isCurrentUser && (
                      <>
                        <button type="button" onClick={() => setReportTarget(message)} className="text-xs text-amber-700 hover:text-amber-800 font-medium">Report</button>
                        <button type="button" onClick={() => handleBlockUser(message)} className="text-xs text-red-600 hover:text-red-700 font-medium">Block</button>
                      </>
                    )}
                    <p className="text-xs text-slate-400">{new Date(message.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-900 whitespace-pre-wrap mt-1">{message.content}</p>
                {message.file_url ? (
                  <a href={message.file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:text-blue-700 underline mt-2 inline-block">
                    {message.file_name || 'View attachment'}
                  </a>
                ) : null}
              </div>
            )})}
            {typingUsers.length > 0 ? (
              <p className="text-xs text-gray-500 italic">
                {typingUsers.length === 1 ? `${typingUsers[0]?.name || 'Someone'} is typing...` : `${typingUsers[0]?.name || 'Someone'} and others are typing...`}
              </p>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
          <form className="border-t border-slate-200 p-3 sm:p-4 flex gap-2 items-center bg-white" onSubmit={handleSend}>
            <input
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              disabled={sending || isUploading}
            />
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleSend(null, file)
              }}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 app-action-secondary" disabled={sending || isUploading}>
              Attach
            </button>
            <button type="submit" disabled={sending || isUploading || !newMessage.trim()} className="px-4 py-2.5 rounded-lg disabled:opacity-60 app-action-primary">
              {sending || isUploading ? 'Sending...' : 'Send'}
            </button>
          </form>
        </main>
        {embedded && (
          <aside className="hidden min-w-0 shrink-0 border-l border-gray-200 xl:flex xl:w-96 xl:flex-col 2xl:w-[28rem]">
            <ProjectTeamPanel
              project={project}
              contacts={projectContacts}
              onOpenDirectory={onOpenDirectory || (() => dispatch({ type: 'SET_VIEW', payload: 'Contacts' }))}
            />
          </aside>
        )}
      </div>

      <ReportContentModal
        show={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        contentType="message"
        contentId={reportTarget?.id}
        reportedUserId={reportTarget?.user_id}
        reportedUserName={reportTarget?.user?.name || reportTarget?.user_name}
      />
    </div>
  )
}
