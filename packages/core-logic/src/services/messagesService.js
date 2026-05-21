/**
 * Messages Service
 * Handles all message-related database operations
 */

/**
 * Helper function to fetch user info from contacts via profiles
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Array<string>} userIds - Array of user IDs
 * @returns {Promise<Object>} Object mapping user_id to user info
 */
async function fetchUserInfo(supabase, userIds) {
  if (!userIds || userIds.length === 0) return {};
  
  // First, get profiles with contact_ids
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, contact_id')
    .in('id', userIds);
  
  if (profilesError) throw profilesError;
  
  if (!profiles || profiles.length === 0) return {};
  
  // Get unique contact IDs
  const contactIds = [...new Set(profiles.map(p => p.contact_id).filter(Boolean))];
  
  if (contactIds.length === 0) return {};
  
  // Then, fetch contacts
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, name, avatar_url')
    .in('id', contactIds);
  
  if (contactsError) throw contactsError;
  
  // Create a map of contact_id to contact info
  const contactMap = {};
  (contacts || []).forEach(contact => {
    contactMap[contact.id] = contact;
  });
  
  // Map profiles to user info
  const userMap = {};
  profiles.forEach(profile => {
    if (profile.contact_id && contactMap[profile.contact_id]) {
      const contact = contactMap[profile.contact_id];
      userMap[profile.id] = {
        id: profile.id,
        name: contact.name,
        avatar_url: contact.avatar_url
      };
    }
  });
  
  return userMap;
}

/**
 * Fetch all message channels
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {Promise<Array>} Array of message channels
 */
export async function fetchMessageChannels(supabase) {
  const { data, error } = await supabase
    .from('message_channels')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Fetch messages for a specific channel
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} channelId - Channel ID
 * @param {string} userId - Current user ID for read status
 * @returns {Promise<Array>} Array of messages with reactions and read status
 */
export async function fetchChannelMessages(supabase, channelId, userId = null) {
  // Fetch top-level messages only (exclude thread replies)
  // Limit to last 50 messages for MVP
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .is('parent_message_id', null)
    .order('created_at', { ascending: true })
    .limit(50);
  
  if (error) throw error;
  
  if (!data || data.length === 0) return [];
  
  // Filter out messages from blocked users if userId provided
  let filteredData = data;
  if (userId) {
    const { getBlockedUsers } = await import('./moderationService.js');
    const blockedUserIds = await getBlockedUsers(supabase, userId);
    if (blockedUserIds.length > 0) {
      const blockedSet = new Set(blockedUserIds);
      filteredData = data.filter(msg => !blockedSet.has(msg.user_id));
    }
  }
  
  // Fetch user info for all message authors
  const userIds = [...new Set(filteredData.map(m => m.user_id).filter(Boolean))];
  const userInfo = await fetchUserInfo(supabase, userIds);
  
  // Fetch read status if userId provided
  const messageIds = filteredData.map(m => m.id);
  let readStatuses = {};
  if (userId) {
    const { data: reads } = await supabase
      .from('message_reads')
      .select('message_id')
      .in('message_id', messageIds)
      .eq('user_id', userId);
    
    if (reads) {
      readStatuses = reads.reduce((acc, read) => {
        acc[read.message_id] = true;
        return acc;
      }, {});
    }
  }
  
  // Attach user info and read status to messages (reactions removed for MVP)
  return filteredData.map(message => ({
    ...message,
    user: userInfo[message.user_id] || null,
    isRead: readStatuses[message.id] || false
  }));
}

/**
 * Send a message to a channel
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} messageData - Message data
 * @returns {Promise<Object>} Created message
 */
export async function sendMessage(supabase, messageData) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      ...messageData,
      created_at: new Date().toISOString(),
      inserted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single();
  
  if (error) throw error;
  
  // Return raw message data - let realtime subscription handle user info
  return data;
}

/**
 * Create a new message channel
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} channelData - Channel data
 * @returns {Promise<Object>} Created channel
 */
export async function createMessageChannel(supabase, channelData) {
  const { data, error } = await supabase
    .from('message_channels')
    .insert(channelData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Fetch user info for a single message (helper for realtime subscriptions)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} message - Message object
 * @returns {Promise<Object>} Message with user info attached
 */
export async function fetchMessageWithUserInfo(supabase, message) {
  if (!message || !message.user_id) {
    return { ...message, user: null, isRead: false };
  }
  
  const userInfo = await fetchUserInfo(supabase, [message.user_id]);
  
  return {
    ...message,
    user: userInfo[message.user_id] || null,
    isRead: false
  };
}

/**
 * Fetch message reactions with user info and counts
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Array<string>} messageIds - Array of message IDs
 * @returns {Promise<Object>} Object mapping message_id to array of reactions with counts
 */
export async function fetchMessageReactions(supabase, messageIds) {
  if (!messageIds || messageIds.length === 0) return {};
  
  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .in('message_id', messageIds);
  
  if (error) throw error;
  
  // Fetch user info for all reaction authors
  const userIds = [...new Set((data || []).map(r => r.user_id).filter(Boolean))];
  const userInfo = await fetchUserInfo(supabase, userIds);
  
  // Group reactions by message_id and emoji, count users
  const reactionsMap = {};
  (data || []).forEach(reaction => {
    if (!reactionsMap[reaction.message_id]) {
      reactionsMap[reaction.message_id] = {};
    }
    if (!reactionsMap[reaction.message_id][reaction.emoji]) {
      reactionsMap[reaction.message_id][reaction.emoji] = {
        emoji: reaction.emoji,
        count: 0,
        users: []
      };
    }
    reactionsMap[reaction.message_id][reaction.emoji].count++;
    if (userInfo[reaction.user_id]) {
      reactionsMap[reaction.message_id][reaction.emoji].users.push(userInfo[reaction.user_id]);
    }
  });
  
  // Convert to array format
  const result = {};
  Object.keys(reactionsMap).forEach(messageId => {
    result[messageId] = Object.values(reactionsMap[messageId]);
  });
  
  return result;
}

/**
 * Fetch unread message counts per channel
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {Array<string>} channelIds - Array of channel IDs
 * @returns {Promise<Object>} Object mapping channel_id to unread count
 */
export async function fetchUnreadCounts(supabase, userId, channelIds) {
  if (!channelIds || channelIds.length === 0) return {};
  
  // Get last read message for each channel
  const { data: channelReads, error: readsError } = await supabase
    .from('channel_reads')
    .select('channel_id, last_read_message_id, last_read_at')
    .eq('user_id', userId)
    .in('channel_id', channelIds);
  
  if (readsError) throw readsError;
  
  const readMap = {};
  (channelReads || []).forEach(read => {
    readMap[read.channel_id] = {
      lastReadMessageId: read.last_read_message_id,
      lastReadAt: read.last_read_at
    };
  });
  
  // Count unread messages for each channel
  const unreadCounts = {};
  
  for (const channelId of channelIds) {
    const readInfo = readMap[channelId];
    let query = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .is('parent_message_id', null); // Only count top-level messages
    
    if (readInfo && readInfo.lastReadMessageId) {
      // Count messages after last read
      query = query.gt('created_at', readInfo.lastReadAt || new Date(0).toISOString());
    }
    
    const { count, error } = await query;
    if (error) throw error;
    unreadCounts[channelId] = count || 0;
  }
  
  return unreadCounts;
}

/**
 * Mark a message as read
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} messageId - Message ID
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function markMessageAsRead(supabase, messageId, userId) {
  // First, get the message with its organization_id (either directly or via channel -> project)
  const { data: message, error: messageError } = await supabase
    .from('messages')
    .select('channel_id, created_at, organization_id')
    .eq('id', messageId)
    .single();
  
  if (messageError) throw messageError;
  if (!message) throw new Error('Message not found');
  
  // Get organization_id from message, or fetch from channel -> project if not set
  let organizationId = message.organization_id;
  
  if (!organizationId && message.channel_id) {
    const { data: channel } = await supabase
      .from('message_channels')
      .select('organization_id, project_id')
      .eq('id', message.channel_id)
      .single();
    
    if (channel?.organization_id) {
      organizationId = channel.organization_id;
    } else if (channel?.project_id) {
      // Fallback: get from project
      const { data: project } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', channel.project_id)
        .single();
      
      if (project?.organization_id) {
        organizationId = project.organization_id;
      }
    }
  }
  
  // If still no organization_id, try to get from user's profile
  if (!organizationId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();
    
    if (profile?.organization_id) {
      organizationId = profile.organization_id;
    }
  }
  
  if (!organizationId) {
    throw new Error('Unable to determine organization_id for message read');
  }
  
  // Upsert read receipt with organization_id
  const { error } = await supabase
    .from('message_reads')
    .upsert({
      message_id: messageId,
      user_id: userId,
      organization_id: organizationId,
      read_at: new Date().toISOString()
    }, {
      onConflict: 'message_id,user_id'
    });
  
  if (error) throw error;
  
  // Update channel_reads with latest read message
  if (message.channel_id) {
    await supabase
      .from('channel_reads')
      .upsert({
        user_id: userId,
        channel_id: message.channel_id,
        organization_id: organizationId,
        last_read_message_id: messageId,
        last_read_at: message.created_at
      }, {
        onConflict: 'user_id,channel_id'
      });
  }
}

/**
 * Fetch thread replies for a message
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} parentMessageId - Parent message ID
 * @param {string|null} [userId] - Current user ID; filters replies from blocked users
 * @returns {Promise<Array>} Array of thread replies
 */
export async function fetchThreadReplies(supabase, parentMessageId, userId = null) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('parent_message_id', parentMessageId)
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  
  if (!data || data.length === 0) return [];

  let filteredData = data;
  if (userId) {
    const { getBlockedUsers } = await import('./moderationService.js');
    const blockedUserIds = await getBlockedUsers(supabase, userId);
    if (blockedUserIds.length > 0) {
      const blockedSet = new Set(blockedUserIds);
      filteredData = data.filter((msg) => !blockedSet.has(msg.user_id));
    }
  }
  
  // Fetch user info for all reply authors
  const userIds = [...new Set(filteredData.map(m => m.user_id).filter(Boolean))];
  const userInfo = await fetchUserInfo(supabase, userIds);
  
  // Return messages with user info (reactions removed for MVP)
  return filteredData.map(message => ({
    ...message,
    user: userInfo[message.user_id] || null
  }));
}

/**
 * Get thread reply count for a message
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} messageId - Message ID
 * @returns {Promise<number>} Reply count
 */
export async function getThreadReplyCount(supabase, messageId) {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('parent_message_id', messageId);
  
  if (error) throw error;
  return count || 0;
}

/**
 * Send a reply to a message thread
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} messageData - Message data with parent_message_id
 * @returns {Promise<Object>} Created reply message
 */
export async function sendThreadReply(supabase, messageData) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      ...messageData,
      created_at: new Date().toISOString(),
      inserted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single();
  
  if (error) throw error;
  
  // Fetch user info for the reply author
  if (data.user_id) {
    const userInfo = await fetchUserInfo(supabase, [data.user_id]);
    data.user = userInfo[data.user_id] || null;
  }
  
  // Update thread_reply_count on parent message
  if (messageData.parent_message_id) {
    const replyCount = await getThreadReplyCount(supabase, messageData.parent_message_id);
    await supabase
      .from('messages')
      .update({ thread_reply_count: replyCount })
      .eq('id', messageData.parent_message_id);
  }
  
  return data;
}

