import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { getOrganizationUsers, inviteUser, createUser, removeUserFromOrganization } from '../utils/userManagementService';
import { getRoles } from '../utils/roleManagementService';
import { useToast } from '../context/ToastContext';
import PermissionGuard from './PermissionGuard';
import LoadingSpinner from './LoadingSpinner';

function UserManagement() {
  const { state } = useContext(AppContext);
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserData, setCreateUserData] = useState({
    email: '',
    password: '',
    fullName: '',
    roleId: ''
  });

  const organizationId = state.currentOrganization?.id;

  useEffect(() => {
    if (organizationId) {
      loadData();
    }
  }, [organizationId]);

  const loadData = async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([
        getOrganizationUsers(supabaseClient, organizationId),
        getRoles(supabaseClient, organizationId)
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (error) {
      console.error('Error loading users:', error);
      addToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail || !organizationId) return;

    setIsInviting(true);
    try {
      const result = await inviteUser(
        supabaseClient,
        inviteEmail,
        organizationId,
        inviteRoleId || null,
        state.user.id
      );

      if (result.success) {
        addToast('Invitation sent successfully', 'success');
        setInviteEmail('');
        setInviteRoleId('');
        loadData();
      } else {
        addToast(result.error || 'Failed to send invitation', 'error');
      }
    } catch (error) {
      console.error('Error inviting user:', error);
      addToast('Failed to send invitation', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!createUserData.email || !createUserData.password || !createUserData.fullName || !organizationId) {
      addToast('Please fill in all fields', 'error');
      return;
    }

    setIsInviting(true);
    try {
      const result = await createUser(
        supabaseClient,
        createUserData.email,
        createUserData.password,
        organizationId,
        createUserData.roleId || null,
        createUserData.fullName
      );

      if (result.success) {
        addToast('User created successfully', 'success');
        setCreateUserData({ email: '', password: '', fullName: '', roleId: '' });
        setShowCreateUser(false);
        loadData();
      } else {
        addToast(result.error || 'Failed to create user', 'error');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      addToast('Failed to create user', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!confirm('Are you sure you want to remove this user from the organization?')) {
      return;
    }

    try {
      const result = await removeUserFromOrganization(supabaseClient, userId, organizationId);
      if (result.success) {
        addToast('User removed successfully', 'success');
        loadData();
      } else {
        addToast(result.error || 'Failed to remove user', 'error');
      }
    } catch (error) {
      console.error('Error removing user:', error);
      addToast('Failed to remove user', 'error');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
        <p className="text-gray-600 mt-1">Manage team members and their roles</p>
      </div>

      <PermissionGuard permission="can_manage_users">
        {/* Invite User Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Invite User</h3>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <select
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select Role (Optional)</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isInviting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isInviting ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </form>

          <div className="mt-4">
            <button type="button"
              onClick={() => setShowCreateUser(!showCreateUser)}
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              {showCreateUser ? 'Cancel' : 'Create User Directly'}
            </button>
          </div>

          {showCreateUser && (
            <form onSubmit={handleCreateUser} className="mt-4 space-y-4 p-4 bg-gray-50 rounded-md">
              <input
                type="text"
                placeholder="Full Name"
                value={createUserData.fullName}
                onChange={(e) => setCreateUserData({ ...createUserData, fullName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={createUserData.email}
                onChange={(e) => setCreateUserData({ ...createUserData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={createUserData.password}
                onChange={(e) => setCreateUserData({ ...createUserData, password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
                required
              />
              <select
                value={createUserData.roleId}
                onChange={(e) => setCreateUserData({ ...createUserData, roleId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select Role (Optional)</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isInviting}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isInviting ? 'Creating...' : 'Create User'}
              </button>
            </form>
          )}
        </div>
      </PermissionGuard>

      {/* Users List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Team Members</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {users.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No users found</div>
          ) : (
            users.map(user => (
              <div key={user.id} className="p-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">
                      {user.contacts?.name?.charAt(0) || user.id.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium">{user.contacts?.name || 'Unknown User'}</div>
                    <div className="text-sm text-gray-500">{user.contacts?.email || 'No email'}</div>
                    <div className="text-xs text-gray-400">{user.roles?.name || 'No role assigned'}</div>
                  </div>
                </div>
                <PermissionGuard permission="can_manage_users">
                  <button type="button"
                    onClick={() => handleRemoveUser(user.id)}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md text-sm"
                  >
                    Remove
                  </button>
                </PermissionGuard>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default UserManagement;

