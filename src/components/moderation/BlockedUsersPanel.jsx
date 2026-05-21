import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext, supabaseClient } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { getBlockedUsers, unblockUser } from '@siteweave/core-logic';
import LoadingSpinner from '../LoadingSpinner';

async function loadBlockedUserDetails(supabase, blockedUserIds) {
  if (!blockedUserIds.length) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, contact_id')
    .in('id', blockedUserIds);

  if (!profiles?.length) return [];

  const contactIds = profiles.map((p) => p.contact_id).filter(Boolean);
  if (!contactIds.length) return [];

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, email')
    .in('id', contactIds);

  const userMap = {};
  profiles.forEach((profile) => {
    if (profile.contact_id) {
      const contact = contacts?.find((c) => c.id === profile.contact_id);
      if (contact) {
        userMap[profile.id] = {
          id: profile.id,
          name: contact.name,
          email: contact.email,
        };
      }
    }
  });

  return blockedUserIds.map((id) => userMap[id]).filter(Boolean);
}

export default function BlockedUsersPanel() {
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState(null);

  const loadBlockedUsers = useCallback(async () => {
    if (!state.user?.id) {
      setBlockedUsers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const blockedUserIds = await getBlockedUsers(supabaseClient, state.user.id);
      const users = await loadBlockedUserDetails(supabaseClient, blockedUserIds);
      setBlockedUsers(users);
    } catch (error) {
      console.error('Error loading blocked users:', error);
      addToast('Failed to load blocked users.', 'error');
    } finally {
      setLoading(false);
    }
  }, [state.user?.id, addToast]);

  useEffect(() => {
    loadBlockedUsers();
  }, [loadBlockedUsers]);

  const handleUnblock = async (blockedUser) => {
    if (!state.user?.id) return;
    if (!window.confirm(`Unblock ${blockedUser.name || blockedUser.email}?`)) return;

    try {
      setUnblockingId(blockedUser.id);
      await unblockUser(supabaseClient, state.user.id, blockedUser.id);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedUser.id));
      addToast(`${blockedUser.name || blockedUser.email} has been unblocked.`, 'success');
    } catch (error) {
      console.error('Error unblocking user:', error);
      addToast('Failed to unblock user. Please try again.', 'error');
    } finally {
      setUnblockingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="font-medium text-gray-700">No blocked users</p>
        <p className="text-sm mt-2">
          Users you block will not appear in your messages.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
      {blockedUsers.map((user) => (
        <li key={user.id} className="flex items-center justify-between gap-4 p-4 bg-white">
          <div>
            <p className="font-medium text-gray-900">{user.name || 'Unknown User'}</p>
            {user.email && <p className="text-sm text-gray-500">{user.email}</p>}
          </div>
          <button
            type="button"
            onClick={() => handleUnblock(user)}
            disabled={unblockingId === user.id}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            {unblockingId === user.id ? 'Unblocking...' : 'Unblock'}
          </button>
        </li>
      ))}
    </ul>
  );
}
