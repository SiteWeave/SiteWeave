import { useState, useEffect, useCallback } from 'react';
import { countStreamPostsSince } from '@siteweave/core-logic';
import { getStreamLastReadAt, markStreamRead } from '../utils/streamReadState';

/**
 * Tracks unread stream posts for a project (client-side last-read cursor).
 */
export function useStreamUnread(supabaseClient, projectId, activeTab) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!projectId || !supabaseClient) {
      setUnreadCount(0);
      return;
    }
    if (activeTab === 'stream' || activeTab === 'updates') {
      markStreamRead(projectId);
      setUnreadCount(0);
      return;
    }
    try {
      const since = getStreamLastReadAt(projectId);
      const count = await countStreamPostsSince(supabaseClient, projectId, since);
      setUnreadCount(count);
    } catch {
      setUnreadCount(0);
    }
  }, [supabaseClient, projectId, activeTab]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!projectId || !supabaseClient || activeTab === 'stream' || activeTab === 'updates') return;
    const channel = supabaseClient
      .channel(`stream_unread:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_stream_posts',
          filter: `project_id=eq.${projectId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => supabaseClient.removeChannel(channel);
  }, [projectId, supabaseClient, activeTab, refresh]);

  return { unreadCount, refreshUnread: refresh };
}
