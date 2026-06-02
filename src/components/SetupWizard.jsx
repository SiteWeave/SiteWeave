import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getRoles, updateRole } from '../utils/roleManagementService';
import { inviteUser, createUser } from '../utils/userManagementService';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';

/**
 * Setup Wizard Modal
 * Shows on first login for new organization admins
 * Step 1: Review/Edit "Member" role permissions
 * Step 2: Add Team Members
 */
function SetupWizard({ show, onComplete }) {
  const { state } = useAppContext();
  const currentOrganization = state.currentOrganization;
  const user = state.user;
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Step 1: Member Role Permissions
  const [memberRole, setMemberRole] = useState(null);
  const [permissions, setPermissions] = useState({});
  
  // Step 2: Add Team Members
  const [teamMembers, setTeamMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [createUserData, setCreateUserData] = useState({
    email: '',
    password: '',
    fullName: '',
    roleId: ''
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    if (show && currentOrganization?.id) {
      loadMemberRole();
    }
  }, [show, currentOrganization?.id]);

  const loadMemberRole = async () => {
    setLoading(true);
    try {
      const roles = await getRoles(supabaseClient, currentOrganization.id);
      const member = roles.find(r => r.name === 'Member');
      if (member) {
        setMemberRole(member);
        setPermissions(member.permissions || {});
      }
    } catch (error) {
      console.error('Error loading member role:', error);
      addToast('Failed to load member role', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (key, value) => {
    setPermissions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveMemberRole = async () => {
    if (!memberRole || !memberRole.id) {
      addToast('Member role not found. Please refresh and try again.', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await updateRole(
        supabaseClient,
        memberRole.id,
        {
          name: memberRole.name,
          permissions: permissions,
          is_system_role: memberRole.is_system_role !== undefined ? memberRole.is_system_role : true
        }
      );

      if (result.success) {
        addToast('Member role updated successfully', 'success');
        // Update local state with the updated role
        if (result.data) {
          setMemberRole(result.data);
        }
        setStep(2);
      } else {
        addToast(result.error || 'Failed to update role', 'error');
      }
    } catch (error) {
      console.error('Error updating role:', error);
      addToast(error.message || 'Failed to update role', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    if (!inviteEmail || !currentOrganization?.id) return;

    setIsInviting(true);
    try {
      const result = await inviteUser(
        supabaseClient,
        inviteEmail,
        currentOrganization.id,
        inviteRoleId || null,
        user.id
      );

      if (result.success) {
        addToast('Invitation sent successfully', 'success');
        setInviteEmail('');
        setInviteRoleId('');
        setTeamMembers(prev => [...prev, { email: inviteEmail, type: 'invited' }]);
      } else {
        addToast(result.error || 'Failed to send invitation', 'error');
      }
    } catch (error) {
      console.error('Error inviting member:', error);
      addToast('Failed to send invitation', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const handleCreateMember = async (e) => {
    e.preventDefault();
    if (!createUserData.email || !createUserData.password || !createUserData.fullName || !currentOrganization?.id) {
      addToast('Please fill in all fields', 'error');
      return;
    }

    setIsInviting(true);
    try {
      const result = await createUser(
        supabaseClient,
        createUserData.email,
        createUserData.password,
        currentOrganization.id,
        createUserData.roleId || null,
        createUserData.fullName
      );

      if (result.success) {
        addToast('User created successfully', 'success');
        setCreateUserData({ email: '', password: '', fullName: '', roleId: '' });
        setShowCreateForm(false);
        setTeamMembers(prev => [...prev, { email: createUserData.email, type: 'created' }]);
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

  const handleComplete = () => {
    // Mark setup as complete (you might want to store this in user metadata or a separate table)
    onComplete();
  };

  if (!show) return null;

  return (
    <Modal show={show} onClose={() => {}} title="Welcome! Let's Set Up Your Organization" size="large">
      <div className="space-y-6">
        {/* Progress Indicator */}
        <div className="flex items-center justify-center space-x-4 mb-6">
          <div className={`flex items-center ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
              {step > 1 ? '✓' : '1'}
            </div>
            <span className="ml-2 font-medium">Review Permissions</span>
          </div>
          <div className="w-12 h-0.5 bg-gray-200"></div>
          <div className={`flex items-center ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
              2
            </div>
            <span className="ml-2 font-medium">Add Team</span>
          </div>
        </div>

        {loading && <LoadingSpinner />}

        {/* Step 1: Review Member Role Permissions */}
        {step === 1 && memberRole && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Step 1: Configure Default Member Permissions</h3>
              <p className="text-sm text-blue-800">
                Review and customize the permissions for the "Member" role. New team members will have these permissions by default.
              </p>
            </div>

            <div className="space-y-3">


              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <label className="font-medium text-gray-900">Create Tasks</label>
                  <p className="text-sm text-gray-600">Create new tasks in projects</p>
                </div>
                <input
                  type="checkbox"
                  checked={permissions.can_create_tasks || false}
                  onChange={(e) => handlePermissionChange('can_create_tasks', e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <label className="font-medium text-gray-900">Edit Tasks</label>
                  <p className="text-sm text-gray-600">Modify existing tasks</p>
                </div>
                <input
                  type="checkbox"
                  checked={permissions.can_edit_tasks || false}
                  onChange={(e) => handlePermissionChange('can_edit_tasks', e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button type="button"
                onClick={handleSaveMemberRole}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Add Team Members */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Step 2: Add Your Team</h3>
              <p className="text-sm text-blue-800">
                Invite team members via email or create managed accounts for them.
              </p>
            </div>

            {/* Invite via Email */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium mb-3">Invite via Email</h4>
              <form onSubmit={handleInviteMember} className="space-y-3">
                <input
                  type="email"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <button
                  type="submit"
                  disabled={isInviting}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isInviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </form>
            </div>

            {/* Create Managed Account */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Create Managed Account</h4>
                <button type="button"
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {showCreateForm ? 'Cancel' : 'Show Form'}
                </button>
              </div>
              {showCreateForm && (
                <form onSubmit={handleCreateMember} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={createUserData.fullName}
                    onChange={(e) => setCreateUserData({ ...createUserData, fullName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={createUserData.email}
                    onChange={(e) => setCreateUserData({ ...createUserData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={createUserData.password}
                    onChange={(e) => setCreateUserData({ ...createUserData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                    minLength={6}
                  />
                  <button
                    type="submit"
                    disabled={isInviting}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {isInviting ? 'Creating...' : 'Create Account'}
                  </button>
                </form>
              )}
            </div>

            {/* Added Members List */}
            {teamMembers.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Added Members</h4>
                <ul className="space-y-1">
                  {teamMembers.map((member, idx) => (
                    <li key={idx} className="text-sm text-gray-600">
                      {member.email} ({member.type === 'invited' ? 'Invited' : 'Created'})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <button type="button"
                onClick={() => setStep(1)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button type="button"
                onClick={handleComplete}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Complete Setup
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default SetupWizard;
