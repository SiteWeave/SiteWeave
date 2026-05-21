import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import MessageItem from '../components/MessageItem';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import ProjectTeamPanel from '../components/ProjectTeamPanel';
import { 
    fetchChannelMessages, 
    sendMessage, 
    sendThreadReply,
    markMessageAsRead,
    fetchUnreadCounts,
    uploadFile,
    fetchMessageWithUserInfo,
    blockUser,
} from '@siteweave/core-logic';
import ReportContentModal from '../components/moderation/ReportContentModal';
import { 
    setTypingStatus, 
    getTypingUsers, 
    createDebouncedTypingStatus 
} from '@siteweave/core-logic';

function MessagesView({ showTeamPanel = false, onOpenDirectory = null }) {
    const { state, dispatch } = useAppContext();
    const { addToast } = useToast();

    const projects = state.projects || [];
    const contacts = state.contacts || [];
    const messageChannels = state.messageChannels || [];

    const [newMessage, setNewMessage] = useState('');
    const [showMentions, setShowMentions] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionPosition, setMentionPosition] = useState(0);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const messageInputRef = useRef(null);
    const hasAutoSelectedChannelRef = useRef(false);
    const [isUploading, setIsUploading] = useState(false);
    const [typingUsers, setTypingUsers] = useState([]);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [replyingTo, setReplyingTo] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const debouncedTypingRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const previousMessageCountRef = useRef(0);
    const isUserScrollingRef = useRef(false);
    const scrollTimeoutRef = useRef(null);
    const [reportTarget, setReportTarget] = useState(null);

    const activeChannel = state.messageChannels.find(ch => ch.id === state.selectedChannelId);

    const reloadChannelMessages = useCallback(async () => {
        if (!activeChannel?.id || !state.user?.id) return;
        try {
            const messages = await fetchChannelMessages(supabaseClient, activeChannel.id, state.user.id);
            dispatch({ type: 'SET_CHANNEL_MESSAGES', payload: { channelId: activeChannel.id, messages } });
        } catch (error) {
            console.error('Error reloading messages:', error);
        }
    }, [activeChannel?.id, state.user?.id, dispatch]);

    const handleReportMessage = useCallback((message) => {
        setReportTarget(message);
    }, []);

    const handleBlockUser = useCallback(async (message) => {
        if (!state.user?.id || !message?.user_id) return;
        const name = message.user?.name || 'this user';
        if (!window.confirm(`Block ${name}? Their messages will be hidden from you.`)) return;
        try {
            await blockUser(supabaseClient, state.user.id, message.user_id);
            addToast(`${name} has been blocked.`, 'success');
            await reloadChannelMessages();
        } catch (error) {
            console.error('Error blocking user:', error);
            addToast('Failed to block user. Please try again.', 'error');
        }
    }, [state.user?.id, addToast, reloadChannelMessages]);
    const channelMessages = state.messages.filter(msg => msg.channel_id === state.selectedChannelId && !msg.parent_message_id);

    // Message grouping logic - group consecutive messages from same user within the same minute
    const groupedMessages = React.useMemo(() => {
        if (!channelMessages.length) return [];
        
        // Sort messages by created_at to ensure chronological order
        const sortedMessages = [...channelMessages].sort((a, b) => 
            new Date(a.created_at) - new Date(b.created_at)
        );
        
        const grouped = [];
        let currentGroup = null;
        
        const getMinuteKey = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            // Create a key based on year, month, day, hour, and minute
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
        };
        
        sortedMessages.forEach((msg, index) => {
            const prevMsg = index > 0 ? sortedMessages[index - 1] : null;
            const isSameUser = prevMsg && prevMsg.user_id === msg.user_id;
            const isSameMinute = prevMsg && getMinuteKey(msg.created_at) === getMinuteKey(prevMsg.created_at);
            
            // Check if we can add to current group (same user, same minute)
            if (isSameUser && isSameMinute && currentGroup && currentGroup.user_id === msg.user_id) {
                // Same user, same minute - group it (no timestamp, no avatar)
                currentGroup.messages.push({ 
                    ...msg, 
                    isGrouped: true, 
                    showAvatar: false, 
                    showTimestamp: false 
                });
            } else {
                // Start a new group
                if (currentGroup) grouped.push(currentGroup);
                // New group - first message shows timestamp and avatar
                currentGroup = {
                    id: msg.id,
                    user_id: msg.user_id,
                    user: msg.user,
                    created_at: msg.created_at,
                    messages: [{ 
                        ...msg, 
                        isGrouped: false, 
                        showAvatar: true, 
                        showTimestamp: true 
                    }]
                };
            }
        });
        
        if (currentGroup) grouped.push(currentGroup);
        return grouped;
    }, [channelMessages]);

    const getProjectForChannel = (channelId) => projects.find(p => p.id === messageChannels.find(c => c.id === channelId)?.project_id);
    const getTeamCount = (projectId) => contacts.filter(c => c.project_contacts?.some(pc => pc.project_id === projectId)).length;
    
    // Get team members for the active channel's project
    const project = getProjectForChannel(activeChannel?.id);
    const teamMembers = contacts.filter(contact => 
        contact.project_contacts && contact.project_contacts.some(pc => pc.project_id === project?.id) && contact.type === 'Team'
    );
    const projectContacts = contacts.filter(contact =>
        Array.isArray(contact.project_contacts) &&
        contact.project_contacts.some(pc => pc.project_id === project?.id)
    );

    // Filter contacts for mentions
    const filteredContacts = contacts.filter(contact => 
        contact.name.toLowerCase().includes(mentionQuery.toLowerCase()) &&
        contact.project_contacts.some(pc => pc.project_id === activeChannel?.project_id)
    );

    useEffect(() => {
        if (!state.selectedChannelId && messageChannels.length > 0 && !hasAutoSelectedChannelRef.current) {
            const firstChannelId = messageChannels[0]?.id;
            if (firstChannelId) {
                dispatch({ type: 'SET_CHANNEL', payload: firstChannelId });
                hasAutoSelectedChannelRef.current = true;
            }
        }
        
        // Reset the ref when channel is cleared
        if (!state.selectedChannelId) {
            hasAutoSelectedChannelRef.current = false;
        }
    }, [state.messageChannels.length, state.selectedChannelId, dispatch]);

    // Load unread counts
    useEffect(() => {
        if (state.messageChannels.length > 0 && state.user?.id) {
            const channelIds = state.messageChannels.map(ch => ch.id);
            fetchUnreadCounts(supabaseClient, state.user.id, channelIds)
                .then(counts => setUnreadCounts(counts))
                .catch(err => console.error('Error fetching unread counts:', err));
        }
    }, [state.messageChannels, state.user?.id, state.messages.length]);


    // Mark messages as read when viewing
    useEffect(() => {
        if (activeChannel && channelMessages.length > 0 && state.user?.id) {
            const lastMessage = channelMessages[channelMessages.length - 1];
            if (lastMessage && !lastMessage.isRead) {
                markMessageAsRead(supabaseClient, lastMessage.id, state.user.id)
                    .catch(err => console.error('Error marking message as read:', err));
            }
        }
    }, [activeChannel?.id, channelMessages.length, state.user?.id]);

    // Typing indicator setup
    useEffect(() => {
        if (activeChannel && state.user?.id) {
            debouncedTypingRef.current = createDebouncedTypingStatus(
                supabaseClient, 
                activeChannel.id, 
                state.user.id
            );
        }
        return () => {
            if (debouncedTypingRef.current && activeChannel && state.user?.id) {
                setTypingStatus(supabaseClient, activeChannel.id, state.user.id, false);
            }
        };
    }, [activeChannel?.id, state.user?.id]);

    // Fetch typing users
    useEffect(() => {
        if (!activeChannel || !state.user?.id) return;
        
        const interval = setInterval(async () => {
            try {
                const users = await getTypingUsers(supabaseClient, activeChannel.id, state.user.id);
                setTypingUsers(users);
            } catch (err) {
                console.error('Error fetching typing users:', err);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [activeChannel?.id, state.user?.id]);

    // Load messages when channel changes (MVP pattern - last 50 messages)
    useEffect(() => {
        if (!activeChannel || !state.user?.id) return;

        const ac = new AbortController();
        const loadMessages = async () => {
            try {
                const messages = await fetchChannelMessages(supabaseClient, activeChannel.id, state.user.id);
                if (ac.signal.aborted) return;
                dispatch({ type: 'SET_CHANNEL_MESSAGES', payload: { channelId: activeChannel.id, messages } });
                // Auto-scroll to bottom after loading
                setTimeout(() => {
                    if (!ac.signal.aborted) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            } catch (error) {
                if (!ac.signal.aborted) console.error('Error loading messages:', error);
            }
        };
        loadMessages();
        return () => ac.abort();
    }, [activeChannel?.id, state.user?.id]);

    // Real-time subscriptions
    useEffect(() => {
        if (!activeChannel) return;

        // Subscribe to new messages
        const messagesChannel = supabaseClient
            .channel(`messages:${activeChannel.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `channel_id=eq.${activeChannel.id}`
            }, async (payload) => {
                if (!payload.new.parent_message_id) {
                    // Fetch user info for the new message and append directly
                    try {
                        const enrichedMessage = await fetchMessageWithUserInfo(supabaseClient, payload.new);
                        dispatch({ type: 'ADD_MESSAGE', payload: enrichedMessage });
                        // Auto-scroll to bottom when new message arrives
                        setTimeout(() => {
                            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }, 100);
                    } catch (error) {
                        console.error('Error processing new message:', error);
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `channel_id=eq.${activeChannel.id}`
            }, (payload) => {
                dispatch({ type: 'UPDATE_MESSAGE', payload: payload.new });
            })
            .subscribe();

        // Subscribe to typing indicators
        const typingChannel = supabaseClient
            .channel(`typing:${activeChannel.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'typing_indicators',
                filter: `channel_id=eq.${activeChannel.id}`
            }, async () => {
                if (state.user?.id) {
                    const users = await getTypingUsers(supabaseClient, activeChannel.id, state.user.id);
                    setTypingUsers(users);
                }
            })
            .subscribe();

        return () => {
            supabaseClient.removeChannel(messagesChannel);
            supabaseClient.removeChannel(typingChannel);
        };
    }, [activeChannel?.id, channelMessages.length, state.user?.id, dispatch]);

    // Check if user is near the bottom of the scroll container
    const isNearBottom = () => {
        if (!messagesContainerRef.current) return true;
        const container = messagesContainerRef.current;
        const threshold = 100; // pixels from bottom
        return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    };

    // Handle scroll events to detect user scrolling
    const handleScroll = useCallback(() => {
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }
        isUserScrollingRef.current = true;
        scrollTimeoutRef.current = setTimeout(() => {
            isUserScrollingRef.current = false;
        }, 150);
    }, []);

    // Auto-scroll only when appropriate
    useEffect(() => {
        const project = getProjectForChannel(state.selectedChannelId);
        if (project && project.notification_count > 0) {
            supabaseClient.from('projects').update({ notification_count: 0 }).eq('id', project.id).then(() => {}).catch(() => {});
        }

        // Check if this is a new message (count increased) or channel change
        const currentMessageCount = channelMessages.length;
        const isNewMessage = currentMessageCount > previousMessageCountRef.current;
        const isChannelChange = previousMessageCountRef.current === 0;
        
        // Only auto-scroll if:
        // 1. It's a new message AND user is near bottom (or channel just changed)
        // 2. OR channel changed (initial load)
        if ((isNewMessage && (isNearBottom() || isChannelChange)) || isChannelChange) {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
                if (!isUserScrollingRef.current || isChannelChange) {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }
        
        previousMessageCountRef.current = currentMessageCount;
    }, [channelMessages.length, state.selectedChannelId]);

    const handleSendMessage = async (file = null) => {
        const content = newMessage.trim();
        if (!activeChannel || (!content && !file)) return;

        setIsUploading(true);
        setUploadProgress(0);

        try {
            let messageData = { 
                channel_id: activeChannel.id, 
                user_id: state.user.id, 
                content, 
                type: 'text',
                topic: 'General',
                extension: 'txt'
            };

            // Handle threading
            if (replyingTo) {
                messageData.parent_message_id = replyingTo.id;
                const reply = await sendThreadReply(supabaseClient, messageData);
                dispatch({ type: 'ADD_MESSAGE', payload: reply });
                setReplyingTo(null);
            } else {
                // Handle file upload
                if (file) {
                    const fileName = `${Date.now()}_${file.name}`;
                    const filePath = `messages/${activeChannel.id}/${fileName}`;
                    
                    try {
                        setUploadProgress(30);
                        await uploadFile(supabaseClient, 'message_files', filePath, file);
                        setUploadProgress(70);
                        
                        const fileUrl = supabaseClient.storage
                            .from('message_files')
                            .getPublicUrl(filePath).data.publicUrl;
                        
                        messageData.file_url = fileUrl;
                        messageData.file_name = file.name;
                        messageData.type = file.type.startsWith('image/') ? 'image' : 'file';
                        setUploadProgress(90);
                    } catch (uploadError) {
                        addToast('Error uploading file: ' + uploadError.message, 'error');
                        setIsUploading(false);
                        setUploadProgress(0);
                        return;
                    }
                }

                await sendMessage(supabaseClient, messageData);
                // Don't add message to state - realtime subscription will handle it
            }

            // Clear typing status
            if (debouncedTypingRef.current) {
                debouncedTypingRef.current(false);
            }

            // Only clear input after successful send - realtime subscription will update UI
            setNewMessage('');
            setUploadProgress(100);
            setTimeout(() => setUploadProgress(0), 500);
        } catch (error) {
            addToast('Error sending message: ' + error.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileChange = e => e.target.files[0] && handleSendMessage(e.target.files[0]);

    const handleInputChange = (e) => {
        const value = e.target.value;
        const cursorPosition = e.target.selectionStart;
        
        setNewMessage(value);
        
        // Update typing indicator
        if (debouncedTypingRef.current && value.trim()) {
            debouncedTypingRef.current(true);
        } else if (debouncedTypingRef.current && !value.trim()) {
            debouncedTypingRef.current(false);
        }
        
        // Check for @mentions
        const textBeforeCursor = value.substring(0, cursorPosition);
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
        
        if (mentionMatch) {
            setShowMentions(true);
            setMentionQuery(mentionMatch[1]);
            setMentionPosition(cursorPosition);
        } else {
            setShowMentions(false);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleSendMessage(files[0]);
        }
    };

    const handleReply = (message) => {
        setReplyingTo(message);
        messageInputRef.current?.focus();
    };

    const handleMentionSelect = (contact) => {
        const textBeforeMention = newMessage.substring(0, mentionPosition - mentionQuery.length - 1);
        const textAfterMention = newMessage.substring(mentionPosition);
        const newText = `${textBeforeMention}@${contact.name} ${textAfterMention}`;
        
        setNewMessage(newText);
        setShowMentions(false);
        
        // Focus back to input
        setTimeout(() => {
            messageInputRef.current?.focus();
        }, 0);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
        
        if (showMentions && e.key === 'Escape') {
            setShowMentions(false);
        }
    };

    return (
        <>
        <div className="flex h-full min-h-0 min-w-0">
            <aside 
                data-onboarding="message-channels"
                className="w-72 xl:w-80 min-w-0 bg-white rounded-l-xl shadow-xs border border-gray-200 flex flex-col p-4"
            >
                <h2 className="text-xl font-bold mb-4 px-2">Projects</h2>
                <ul className="space-y-1 overflow-y-auto flex-1">
                    {state.messageChannels.map(channel => {
                        const project = getProjectForChannel(channel.id);
                        return (
                            <li key={channel.id} onClick={() => dispatch({ type: 'SET_CHANNEL', payload: channel.id })}
                                className={`flex justify-between items-center px-3 py-2 rounded-lg cursor-pointer ${state.selectedChannelId === channel.id ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'}`}>
                                <span className="font-semibold truncate flex-1 mr-2"># {project?.name || channel.name}</span>
                                {(unreadCounts[channel.id] > 0 || project?.notification_count > 0) && (
                                    <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0">
                                        {unreadCounts[channel.id] || project?.notification_count || 0}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </aside>
            <main className="flex-1 min-w-0 bg-white rounded-r-xl shadow-xs border-t border-r border-b border-gray-200 flex overflow-hidden">
                {activeChannel ? (
                    <div className="flex min-h-0 flex-1">
                    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <header className="shrink-0 border-b border-gray-200">
                            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-4 flex justify-between items-center gap-4">
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-bold text-lg truncate"># {getProjectForChannel(activeChannel.id)?.name}</h3>
                                    <p className="text-sm text-gray-500">{getTeamCount(activeChannel.project_id)} members</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {teamMembers.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <div className="flex -space-x-2">
                                            {teamMembers.slice(0, 5).map(member => (
                                                member.avatar_url ? (
                                                    <img 
                                                        key={member.id} 
                                                        src={member.avatar_url} 
                                                        title={member.name} 
                                                        alt={member.name}
                                                        className="w-8 h-8 rounded-full border-2 border-white" 
                                                    />
                                                ) : (
                                                    <Avatar key={member.id} name={member.name} size="md" className="border-2 border-white" />
                                                )
                                            ))}
                                        </div>
                                        {teamMembers.length > 5 && (
                                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 -ml-2 border-2 border-white">
                                                +{teamMembers.length - 5}
                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                            </div>
                        </header>
                        <div className="flex flex-col flex-1 min-h-0 w-full max-w-4xl mx-auto px-4 sm:px-6">
                        <div 
                            ref={messagesContainerRef}
                            data-onboarding="chat-area"
                            className="flex-1 py-6 overflow-y-auto overflow-x-hidden min-h-0 w-full"
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onScroll={handleScroll}
                        >
                            {isDragging && (
                                <div className="fixed inset-0 bg-blue-500/20 z-50 flex items-center justify-center pointer-events-none">
                                    <div className="bg-white rounded-lg p-8 shadow-lg border-2 border-blue-500 border-dashed">
                                        <p className="text-lg font-semibold text-blue-600">Drop file to upload</p>
                                    </div>
                                </div>
                            )}
                            {groupedMessages.map((group, groupIdx) => (
                                <div key={group.id} className="space-y-1">
                                    {group.messages.map((msg, idx) => {
                                        // Check if this is the very last message in the entire channel
                                        const isLastMessageInChannel = 
                                            groupIdx === groupedMessages.length - 1 && 
                                            idx === group.messages.length - 1;
                                        
                                        return (
                                            <MessageItem 
                                                key={msg.id} 
                                                message={msg} 
                                                isGrouped={msg.isGrouped}
                                                showAvatar={msg.showAvatar}
                                                showTimestamp={msg.showTimestamp}
                                                isLastInChannel={isLastMessageInChannel}
                                                onReply={handleReply}
                                                onReport={handleReportMessage}
                                                onBlock={handleBlockUser}
                                                currentUserId={state.user?.id}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                            {typingUsers.length > 0 && (
                                <div className="text-sm text-gray-500 italic mt-2">
                                    {typingUsers.length === 1 
                                        ? `${typingUsers[0]?.name || 'Someone'} is typing...`
                                        : `${typingUsers[0]?.name || 'Someone'} and ${typingUsers.length - 1} other${typingUsers.length > 2 ? 's' : ''} are typing...`
                                    }
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        {replyingTo && (
                            <div className="py-2 bg-blue-50 border-t border-blue-200 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Icon path="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.488.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.492 3.337-1.313.379-.38.708-.796.924-1.22a4.801 4.801 0 001.923-1.22 4.705 4.705 0 00.334-1.785c0-.6-.154-1.194-.432-1.641A8.98 8.98 0 0012 20.25z" className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm text-gray-700">
                                        Replying to <span className="font-semibold">{replyingTo.user?.name || 'message'}</span>
                                    </span>
                                    <span className="text-xs text-gray-500 truncate max-w-xs">{replyingTo.content}</span>
                                </div>
                                <button
                                    onClick={() => setReplyingTo(null)}
                                    className="text-gray-500 hover:text-gray-700"
                                >
                                    <Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        <div className="py-4 border-t bg-gray-50 relative">
                            {uploadProgress > 0 && uploadProgress < 100 && (
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200">
                                    <div 
                                        className="h-full bg-blue-600 transition-all duration-300"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                            )}
                            <div className="flex items-center gap-4">
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={e => e.target.files[0] && handleSendMessage(e.target.files[0])} 
                                    className="hidden" 
                                    multiple={false}
                                />
                                <button 
                                    onClick={() => fileInputRef.current.click()} 
                                    disabled={isUploading} 
                                    className="text-gray-500 hover:text-blue-600 disabled:opacity-50 transition-colors"
                                    title="Attach file"
                                >
                                    <Icon path="M18.375 2.25h-16.5A2.25 2.25 0 002.25 4.5v15a2.25 2.25 0 002.25 2.25h16.5A2.25 2.25 0 0021.75 19.5v-15a2.25 2.25 0 00-2.25-2.25zM9.75 8.25a.75.75 0 000 1.5H15M9.75 11.25a.75.75 0 000 1.5H15m-6-4.5a.75.75 0 000 1.5H15" className="w-6 h-6" />
                                </button>
                                
                                <div className="flex-1 relative">
                                    <textarea
                                        ref={messageInputRef}
                                        value={newMessage}
                                        onChange={handleInputChange}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Type a message..."
                                        data-onboarding="message-input"
                                        className="w-full p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        rows="1"
                                        disabled={isUploading}
                                        style={{ minHeight: '44px', maxHeight: '120px' }}
                                    />
                                    
                                    {/* Mentions Dropdown */}
                                    {showMentions && (
                                        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                                            {filteredContacts.length > 0 ? (
                                                filteredContacts.map(contact => (
                                                    <button
                                                        key={contact.id}
                                                        onClick={() => handleMentionSelect(contact)}
                                                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3"
                                                    >
                                                        <img 
                                                            src={contact.avatar_url} 
                                                            alt={contact.name} 
                                                            className="w-6 h-6 rounded-full" 
                                                        />
                                                        <div>
                                                            <div className="font-medium text-sm">{contact.name}</div>
                                                            <div className="text-xs text-gray-500">{contact.role}</div>
                                                        </div>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-4 py-2 text-gray-500 text-sm">
                                                    No team members found
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                <button 
                                    onClick={() => handleSendMessage()} 
                                    disabled={!newMessage.trim() || isUploading} 
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isUploading ? 'Sending...' : 'Send'}
                                </button>
                            </div>
                            
                            {/* Message Threading Indicator */}
                            <div className="mt-2 text-xs text-gray-500">
                                Press Enter to send, Shift+Enter for new line
                            </div>
                        </div>
                        </div>
                    </section>
                    {showTeamPanel && (
                        <aside className="hidden min-w-0 shrink-0 border-l border-gray-200 xl:flex xl:w-96 xl:flex-col 2xl:w-[28rem]">
                            <ProjectTeamPanel
                                project={project}
                                contacts={projectContacts}
                                onOpenDirectory={onOpenDirectory || (() => dispatch({ type: 'SET_VIEW', payload: 'Contacts' }))}
                            />
                        </aside>
                    )}
                    </div>
                ) : <div className="flex-1 flex items-center justify-center text-gray-500">Select a channel to start messaging.</div>}
            </main>
        </div>

        <ReportContentModal
            show={Boolean(reportTarget)}
            onClose={() => setReportTarget(null)}
            contentType="message"
            contentId={reportTarget?.id}
            reportedUserId={reportTarget?.user_id}
            reportedUserName={reportTarget?.user?.name}
        />
        </>
    );
}

export default MessagesView;