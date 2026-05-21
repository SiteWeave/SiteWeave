import { useState, useEffect, useCallback } from 'react';
import { countIssueActivitySince } from '@siteweave/core-logic';
import { getIssuesLastReadAt, markIssuesRead } from '../utils/issuesReadState';

/**
 * Tracks unread field-issue activity for a project (client-side last-read cursor).
 */
export function useIssuesUnread(supabaseClient, projectId, activeTab) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!projectId || !supabaseClient) {
      setUnreadCount(0);
      return;
    }
    if (activeTab === 'updates') {
      markIssuesRead(projectId);
      setUnreadCount(0);
      return;
    }
    try {
      const since = getIssuesLastReadAt(projectId);
      const count = await countIssueActivitySince(supabaseClient, projectId, since);
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
    if (!projectId || !supabaseClient || activeTab === 'updates') return;
    const channel = supabaseClient
      .channel(`issues_unread:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_issues',
          filter: `project_id=eq.${projectId}`,
        },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'issue_comments' },
        () => refresh(),
      )
      .subscribe();
    return () => supabaseClient.removeChannel(channel);
  }, [projectId, supabaseClient, activeTab, refresh]);

  return { unreadCount, refreshUnread: refresh };
}
