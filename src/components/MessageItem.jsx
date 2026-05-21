import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Icon from './Icon';
import Avatar from './Avatar';
import { fetchThreadReplies, getThreadReplyCount, fetchMessageWithUserInfo } from '@siteweave/core-logic';

function MessageItem({ message, onEdit, onDelete, isGrouped = false, showAvatar = true, showTimestamp = false, isLastInChannel = false, onReply, onThreadExpand, onReport, onBlock, currentUserId }) {
    const { i18n } = useTranslation();
    const { state } = useAppContext();
    const { addToast } = useToast();

    const contacts = state.contacts || [];
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(message.content || '');
    const [isUpdatingMessage, setIsUpdatingMessage] = useState(false);
    const [isDeletingMessage, setIsDeletingMessage] = useState(false);
    const [showThread, setShowThread] = useState(false);
    const [threadReplies, setThreadReplies] = useState([]);
    const [loadingThread, setLoadingThread] = useState(false);
    const [messageWithUser, setMessageWithUser] = useState(message);
    const [avatarLoadError, setAvatarLoadError] = useState(false);
    
    // Ensure user info (including avatar) is always available for the message sender
    useEffect(() => {
        const ensureUserInfo = async () => {
            // If message doesn't have user info, fetch it
            if (!messageWithUser.user && messageWithUser.user_id) {
                try {
                    const enriched = await fetchMessageWithUserInfo(supabaseClient, messageWithUser);
                    setMessageWithUser(enriched);
                } catch (error) {
                    console.error('Error fetching user info for message:', error);
                }
            }
        };
        
        ensureUserInfo();
    }, [message.user_id, message.user]);
    
    // Update messageWithUser when message prop changes
    useEffect(() => {
        setMessageWithUser(message);
        setAvatarLoadError(false); // Reset error state when message changes
    }, [message]);
    
    const isCurrentUser = messageWithUser.user_id === state.user.id;
    // Always use the sender's user info (with avatar_url)
    const user = messageWithUser.user || null;

    const formatTime = (isoString) => new Date(isoString).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' });
    const formatDate = (isoString) => new Date(isoString).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });

    const handleEditMessage = async () => {
        if (!editContent.trim()) return;
        
        setIsUpdatingMessage(true);
        const { error } = await supabaseClient
            .from('messages')
            .update({ content: editContent.trim(), edited_at: new Date().toISOString() })
            .eq('id', messageWithUser.id);
        
        if (error) {
            addToast('Error updating message: ' + error.message, 'error');
        } else {
            addToast('Message updated successfully!', 'success');
            setIsEditing(false);
        }
        setIsUpdatingMessage(false);
    };

    const handleDeleteMessage = async () => {
        setIsDeletingMessage(true);
        const { error } = await supabaseClient
            .from('messages')
            .delete()
            .eq('id', messageWithUser.id);
        
        if (error) {
            addToast('Error deleting message: ' + error.message, 'error');
        } else {
            addToast('Message deleted successfully!', 'success');
        }
        setIsDeletingMessage(false);
    };


    const handleLoadThread = async () => {
        if (showThread) {
            setShowThread(false);
            return;
        }

        setLoadingThread(true);
        try {
            const replies = await fetchThreadReplies(supabaseClient, messageWithUser.id, currentUserId || state.user?.id);
            setThreadReplies(replies);
            setShowThread(true);
            if (onThreadExpand) onThreadExpand(messageWithUser.id);
        } catch (error) {
            addToast('Error loading thread: ' + error.message, 'error');
        } finally {
            setLoadingThread(false);
        }
    };

    const handleMention = (content) => {
        // Extract @mentions from content
        const mentionRegex = /@(\w+)/g;
        const mentions = [];
        let match;
        
        while ((match = mentionRegex.exec(content)) !== null) {
            mentions.push(match[1]);
        }
        
        return mentions;
    };

    const renderContentWithMentions = (content) => {
        if (!content) return null;
        
        const mentionRegex = /@(\w+)/g;
        const parts = content.split(mentionRegex);
        
        return parts.map((part, index) => {
            if (index % 2 === 1) {
                // This is a mention
                const contact = contacts.find(c => c.name.toLowerCase().includes(part.toLowerCase()));
                return (
                    <span key={index} className="bg-blue-100 text-blue-800 px-1 rounded font-medium">
                        @{part}
                    </span>
                );
            }
            return part;
        });
    };

    // Handle special "Imported from Outlook" message
    if (messageWithUser.content?.startsWith('RE:')) {
        return (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg my-2 max-w-[90%] mx-auto break-words">
                <p className="text-sm font-semibold text-blue-800">Imported from Outlook <span className="font-normal text-gray-500 text-xs ml-2">{formatTime(messageWithUser.created_at)}</span></p>
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words overflow-wrap-anywhere">{messageWithUser.content}</p>
            </div>
        );
    }
    
    return (
        <div className={`flex items-start gap-3 group ${isGrouped ? 'my-1' : 'my-4'} ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
            {/* Always show avatar for current user, or show for others when showAvatar is true */}
            {/* Use the sender's avatar from contacts.avatar_url (fetched via fetchMessageWithUserInfo) */}
            {/* This matches the pattern used in TeamDirectory, DirectoryManagementModal, and ContactCard */}
            {(showAvatar || isCurrentUser) && (
                user?.avatar_url && !avatarLoadError ? (
                    <img 
                        src={user.avatar_url} 
                        alt={user.name || 'User'} 
                        className="w-10 h-10 rounded-full flex-shrink-0 object-cover" 
                        onError={() => setAvatarLoadError(true)}
                    />
                ) : (
                    <Avatar 
                        name={user?.name || 'User'} 
                        size="lg" 
                        className="flex-shrink-0"
                    />
                )
            )}
            {!showAvatar && !isCurrentUser && <div className="w-10 flex-shrink-0" />}
            <div className={`flex flex-col gap-1 w-fit max-w-[70%] min-w-0 ${isCurrentUser ? 'items-end' : ''}`}>
                {showTimestamp && (
                    <div className={`flex items-baseline gap-2 ${isCurrentUser ? 'self-end' : ''}`}>
                        {!isCurrentUser && <span className="font-bold text-sm truncate">{user?.name}</span>}
                        <span className="text-xs text-gray-400 flex-shrink-0">
                            {formatTime(messageWithUser.created_at)}
                            {messageWithUser.edited_at && (
                                <span className="ml-1 italic text-gray-300">(edited)</span>
                            )}
                        </span>
                    </div>
                )}
                
                <div className={`p-3 rounded-lg relative break-words overflow-wrap-anywhere ${isCurrentUser ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                    {isEditing ? (
                        <div className="space-y-2">
                            <textarea
                                value={editContent}
                                onChange={e => setEditContent(e.target.value)}
                                className="w-full p-2 border rounded-lg text-gray-900 resize-none"
                                rows="3"
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleEditMessage}
                                    disabled={isUpdatingMessage || !editContent.trim()}
                                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                    {isUpdatingMessage ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditContent(messageWithUser.content || '');
                                    }}
                                    className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {messageWithUser.content && (
                                <p className="text-sm whitespace-pre-wrap break-words overflow-wrap-anywhere">
                                    {renderContentWithMentions(messageWithUser.content)}
                                </p>
                            )}
                            
                            {messageWithUser.type === 'image' && messageWithUser.file_url && (
                                <img 
                                    src={messageWithUser.file_url} 
                                    alt={messageWithUser.file_name || 'Attached image'} 
                                    className="mt-2 rounded-lg max-w-full cursor-pointer" 
                                    onClick={() => window.open(messageWithUser.file_url, '_blank')} 
                                />
                            )}
                            
                            {messageWithUser.type === 'file' && messageWithUser.file_url && (
                                <a href={messageWithUser.file_url} target="_blank" rel="noopener noreferrer" 
                                   className={`flex items-center gap-2 mt-2 p-2 rounded-md ${isCurrentUser ? 'bg-blue-700 hover:bg-blue-800' : 'bg-gray-200 hover:bg-gray-300'}`}>
                                    <Icon path="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" className="w-5 h-5 flex-shrink-0" />
                                    <span className="text-sm font-medium truncate">{messageWithUser.file_name}</span>
                                </a>
                            )}

                            {/* Message Actions */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className={`flex gap-1 rounded-lg p-1 ${isCurrentUser ? 'bg-black/20' : 'bg-white shadow-sm border border-gray-200'}`}>
                                    <button
                                        onClick={() => onReply && onReply(messageWithUser)}
                                        className="p-1 hover:bg-white/20 rounded"
                                        title="Reply"
                                    >
                                        <Icon path="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.488.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.492 3.337-1.313.379-.38.708-.796.924-1.22a4.801 4.801 0 001.923-1.22 4.705 4.705 0 00.334-1.785c0-.6-.154-1.194-.432-1.641A8.98 8.98 0 0012 20.25z" className="w-4 h-4" />
                                    </button>
                                    {!isCurrentUser && onReport && (
                                        <button
                                            onClick={() => onReport(messageWithUser)}
                                            className="p-1 hover:bg-white/20 rounded text-amber-200 hover:text-amber-100"
                                            title="Report message"
                                        >
                                            <Icon path="M3 3v1.5M3 16.5V18M7.5 3h1.5m-7.5 7.5h1.5M16.5 3h1.5M12 3H12.75M3 7.5v1.5m13.5-1.5v1.5M7.5 12h1.5m-7.5 3.75h1.5M16.5 12h1.5M12 16.5h1.5m-4.5 0h1.5m4.5-7.5v1.5m-7.5 3.75v1.5" className="w-4 h-4" />
                                        </button>
                                    )}
                                    {!isCurrentUser && onBlock && (
                                        <button
                                            onClick={() => onBlock(messageWithUser)}
                                            className="p-1 hover:bg-white/20 rounded text-red-300 hover:text-red-200"
                                            title="Block user"
                                        >
                                            <Icon path="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" className="w-4 h-4" />
                                        </button>
                                    )}
                                    {isCurrentUser && (
                                        <>
                                            <button
                                                onClick={() => setIsEditing(true)}
                                                className="p-1 hover:bg-white/20 rounded"
                                                title="Edit message"
                                            >
                                                <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={handleDeleteMessage}
                                                disabled={isDeletingMessage}
                                                className="p-1 hover:bg-white/20 rounded text-red-300 hover:text-red-200"
                                                title="Delete message"
                                            >
                                                <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Read Receipts - Only for current user's messages and only on the very last message in the channel */}
                {isCurrentUser && isLastInChannel && (
                    <div className="flex items-center gap-1 mt-1">
                        {messageWithUser.isRead ? (
                            <span className="text-blue-500 text-xs" title="Read">
                                <Icon path="M4.5 12.75l6 6 9-13.5" className="w-3 h-3" />
                            </span>
                        ) : (
                            <span className="text-gray-400 text-xs" title="Sent">
                                <Icon path="M4.5 12.75l6 6 9-13.5" className="w-3 h-3" />
                            </span>
                        )}
                    </div>
                )}

                {/* Thread Reply Count Badge */}
                {(messageWithUser.thread_reply_count > 0 || showThread) && (
                    <div className="mt-2">
                        <button
                            onClick={handleLoadThread}
                            disabled={loadingThread}
                            className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                        >
                            <Icon path="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.488.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.492 3.337-1.313.379-.38.708-.796.924-1.22a4.801 4.801 0 001.923-1.22 4.705 4.705 0 00.334-1.785c0-.6-.154-1.194-.432-1.641A8.98 8.98 0 0012 20.25z" className="w-3 h-3" />
                            {loadingThread ? 'Loading...' : `${messageWithUser.thread_reply_count || threadReplies.length} ${(messageWithUser.thread_reply_count || threadReplies.length) === 1 ? 'reply' : 'replies'}`}
                        </button>
                        
                        {showThread && threadReplies.length > 0 && (
                            <div className="mt-2 ml-4 pl-4 border-l-2 border-blue-200 space-y-2">
                                {threadReplies.map(reply => (
                                    <MessageItem 
                                        key={reply.id} 
                                        message={reply} 
                                        isGrouped={false}
                                        showAvatar={true}
                                        onReport={onReport}
                                        onBlock={onBlock}
                                        currentUserId={currentUserId}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default MessageItem;
