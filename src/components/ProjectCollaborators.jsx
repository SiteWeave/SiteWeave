import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import {
  getProjectCollaborators,
  addProjectCollaborator,
  removeProjectCollaborator,
  updateCollaboratorAccess
} from '../utils/projectCollaborationService';
import { useToast } from '../context/ToastContext';
import PermissionGuard from './PermissionGuard';
import LoadingSpinner from './LoadingSpinner';

function ProjectCollaborators({ projectId }) {
  const { state } = useContext(AppContext);
  const { addToast } = useToast();
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState('viewer');
  const [isAdding, setIsAdding] = useState(false);

  const organizationId = state.currentOrganization?.id;

  useEffect(() => {
    if (projectId) {
      loadCollaborators();
    }
  }, [projectId]);

  const loadCollaborators = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const data = await getProjectCollaborators(supabaseClient, projectId);
      setCollaborators(data);
    } catch (error) {
      console.error('Error loading collaborators:', error);
      addToast('Failed to load collaborators', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCollaborator = async (e) => {
    e.preventDefault();
    if (!searchEmail || !projectId || !organizationId) return;

    // First, find user by email
    try {
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select(`
          id,
          contacts!inner(email)
        `)
        .eq('contacts.email', searchEmail.toLowerCase())
        .maybeSingle();

      if (!profiles) {
        addToast('User not found. They must have a SiteWeave account first.', 'error');
        return;
      }

      setIsAdding(true);
      const result = await addProjectCollaborator(
        supabaseClient,
        projectId,
        profiles.id,
        organizationId,
        accessLevel,
        state.user.id
      );

      if (result.success) {
        addToast('Collaborator added successfully', 'success');
        setSearchEmail('');
        setAccessLevel('viewer');
        setShowAddForm(false);
        loadCollaborators();
      } else {
        addToast(result.error || 'Failed to add collaborator', 'error');
      }
    } catch (error) {
      console.error('Error adding collaborator:', error);
      addToast('Failed to add collaborator', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveCollaborator = async (userId) => {
    if (!confirm('Are you sure you want to remove this collaborator from the project?')) {
      return;
    }

    try {
      const result = await removeProjectCollaborator(supabaseClient, projectId, userId);
      if (result.success) {
        addToast('Collaborator removed successfully', 'success');
        loadCollaborators();
      } else {
        addToast(result.error || 'Failed to remove collaborator', 'error');
      }
    } catch (error) {
      console.error('Error removing collaborator:', error);
      addToast('Failed to remove collaborator', 'error');
    }
  };

  const handleUpdateAccess = async (userId, newAccessLevel) => {
    try {
      const result = await updateCollaboratorAccess(supabaseClient, projectId, userId, newAccessLevel);
      if (result.success) {
        addToast('Access level updated', 'success');
        loadCollaborators();
      } else {
        addToast(result.error || 'Failed to update access level', 'error');
      }
    } catch (error) {
      console.error('Error updating access:', error);
      addToast('Failed to update access level', 'error');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Project Collaborators</h2>
        <p className="text-gray-600 mt-1">Manage guest access for trade partners and external team members</p>
      </div>

      <PermissionGuard permission="can_manage_contacts">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Add Collaborator</h3>
            <button type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              {showAddForm ? 'Cancel' : 'Add Collaborator'}
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddCollaborator} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="email"
                  placeholder="User email address"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {isAdding ? 'Adding...' : 'Add'}
                </button>
              </div>
              <p className="text-sm text-gray-500">
                Note: User must have a SiteWeave account. They will be able to access this project even if they're not part of your organization.
              </p>
            </form>
          )}
        </div>
      </PermissionGuard>

      {/* Collaborators List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Current Collaborators</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {collaborators.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No collaborators added</div>
          ) : (
            collaborators.map(collab => (
              <div key={collab.id} className="p-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <span className="text-purple-600 font-semibold">
                      {collab.profiles?.contacts?.name?.charAt(0) || 'G'}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium">{collab.profiles?.contacts?.name || 'Guest User'}</div>
                    <div className="text-sm text-gray-500">{collab.profiles?.contacts?.email || 'No email'}</div>
                    <div className="text-xs text-purple-600">Guest Access</div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <PermissionGuard permission="can_manage_contacts">
                    <select
                      value={collab.access_level}
                      onChange={(e) => handleUpdateAccess(collab.user_id, e.target.value)}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button type="button"
                      onClick={() => handleRemoveCollaborator(collab.user_id)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md text-sm"
                    >
                      Remove
                    </button>
                  </PermissionGuard>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectCollaborators;

