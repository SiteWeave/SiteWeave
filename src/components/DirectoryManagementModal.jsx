import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getOrganizationUsers, inviteUser, createUser, removeUserFromOrganization } from '../utils/userManagementService';
import { getAssignableOrgRoles } from '../utils/roleManagementService';
import PermissionGuard from './PermissionGuard';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';
import CredentialCard from './CredentialCard';
import Icon from './Icon';
import Avatar from './Avatar';
import { FieldError } from './FormAlert';

/**
 * Directory Management Modal
 * Secure frontend component for managing organization's member directory
 * Requires can_manage_team permission
 */
function DirectoryManagementModal({ show, onClose, onMembersChanged }) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const currentOrganization = state.currentOrganization;
  const user = state.user;
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [inviteError, setInviteError] = useState(null);
  const [createUserError, setCreateUserError] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Tab state
  const [activeTab, setActiveTab] = useState('invite'); // 'invite' or 'create'
  
  // Invite via Email
  const [inviteData, setInviteData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    roleId: ''
  });
  const [isInviting, setIsInviting] = useState(false);
  
  // Create Managed Account
  const [createUserData, setCreateUserData] = useState({
    fullName: '',
    username: '',
    password: '',
    roleId: ''
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  
  // Edit Role
  const [editingUser, setEditingUser] = useState(null);
  const [newRoleId, setNewRoleId] = useState('');
  
  // Track failed image loads for avatars
  const [failedImages, setFailedImages] = useState(new Set());
  
  const handleImageError = (memberId) => {
    setFailedImages(prev => new Set(prev).add(memberId));
  };
  
  // Generate 6-digit PIN
  const generatePIN = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit number (100000-999999)
  };

  useEffect(() => {
    if (show && currentOrganization?.id) {
      loadData();
    }
  }, [show, currentOrganization?.id]);

  const loadData = async () => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    setListError(null);
    try {
      const [usersData, rolesData, invitationsResult] = await Promise.all([
        getOrganizationUsers(supabaseClient, currentOrganization.id),
        getAssignableOrgRoles(supabaseClient, currentOrganization.id),
        supabaseClient
          .from('invitations')
          .select('id, email, status, created_at, expires_at, metadata, roles(name)')
          .eq('organization_id', currentOrganization.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
      if (invitationsResult.error) {
        console.error('Error loading pending invitations:', invitationsResult.error);
        setPendingInvitations([]);
      } else {
        const now = Date.now();
        setPendingInvitations(
          (invitationsResult.data || []).filter(
            (inv) => !inv.expires_at || new Date(inv.expires_at).getTime() > now,
          ),
        );
      }
    } catch (error) {
      console.error('Error loading directory data:', error);
      setListError(t('team.failed_load_members'));
    } finally {
      setLoading(false);
    }
  };

  // Set default role to "Member" when roles are loaded and generate PIN for managed accounts
  useEffect(() => {
    if (roles.length > 0) {
      const memberRole = roles.find(r => r.name === 'Member' || r.name === 'member');
      if (memberRole) {
        // Set default for invite form if not set
        setInviteData(prev => prev.roleId ? prev : { ...prev, roleId: memberRole.id });
        // Set default for create form if not set, and generate PIN if password is empty
        setCreateUserData(prev => {
          const updates = prev.roleId ? {} : { roleId: memberRole.id };
          if (!prev.password) {
            updates.password = generatePIN();
          }
          return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles]);
  
  // Generate PIN when switching to create tab
  useEffect(() => {
    if (activeTab === 'create' && !createUserData.password) {
      setCreateUserData(prev => ({ ...prev, password: generatePIN() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Auto-generate username from full name
  useEffect(() => {
    if (activeTab === 'create' && createUserData.fullName) {
      const nameParts = createUserData.fullName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];
        const suggestedUsername = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]/g, '');
        if (createUserData.username === '' || createUserData.username === createUserData.fullName.toLowerCase().replace(/[^a-z0-9.]/g, '')) {
          setCreateUserData(prev => ({ ...prev, username: suggestedUsername }));
        }
      }
    }
  }, [createUserData.fullName, activeTab]);

  // Format phone number as user types
  const formatPhoneNumber = (value) => {
    // Remove all non-digit characters
    const phoneNumber = value.replace(/\D/g, '');
    
    // Limit to 10 digits (US phone number)
    const phoneNumberDigits = phoneNumber.slice(0, 10);
    
    // Format: (XXX) XXX-XXXX
    if (phoneNumberDigits.length === 0) return '';
    if (phoneNumberDigits.length <= 3) return `(${phoneNumberDigits}`;
    if (phoneNumberDigits.length <= 6) return `(${phoneNumberDigits.slice(0, 3)}) ${phoneNumberDigits.slice(3)}`;
    return `(${phoneNumberDigits.slice(0, 3)}) ${phoneNumberDigits.slice(3, 6)}-${phoneNumberDigits.slice(6)}`;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setInviteData({ ...inviteData, phone: formatted });
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError(null);
    setActionError(null);
    if (!inviteData.email || !currentOrganization?.id) {
      setInviteError(t('team.email_required'));
      return;
    }
    if (!inviteData.firstName) {
      setInviteError(t('team.first_name_required'));
      return;
    }
    if (!inviteData.roleId) {
      setInviteError(t('team.role_required'));
      return;
    }

    setIsInviting(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        setInviteError(t('team.not_authenticated'));
        return;
      }

      const metadata = {};
      if (inviteData.firstName) metadata.first_name = inviteData.firstName;
      if (inviteData.lastName) metadata.last_name = inviteData.lastName;
      if (inviteData.phone) {
        // Store phone number without formatting (digits only)
        metadata.phone = inviteData.phone.replace(/\D/g, '');
      }
      
      const response = await fetch(
        `${supabaseClient.supabaseUrl}/functions/v1/team-invite`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: inviteData.email,
            organizationId: currentOrganization.id,
            roleId: inviteData.roleId || null,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = t('team.failed_send_invite');
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          errorMessage = errorText || `Server error: ${response.status}`;
        }
        setInviteError(errorMessage);
        setIsInviting(false);
        return;
      }

      const result = await response.json();

      if (result.success) {
        if (result.emailSent) {
          addToast(t('team.invite_sent'), 'success');
        } else if (result.emailError) {
          addToast(t('team.failed_send_invite_detail', { message: `${result.emailError}. ${result.setupUrl}` }), 'warning');
        } else {
          addToast(t('team.invite_created_no_email'), 'warning');
        }
        // Reset form but keep default role (Member) if available
        const memberRole = roles.find(r => r.name === 'Member' || r.name === 'member');
        setInviteData({ 
          firstName: '', 
          lastName: '', 
          email: '', 
          phone: '', 
          roleId: memberRole?.id || '' 
        });
        await loadData();
        onMembersChanged?.();
      } else {
        setInviteError(result.error || t('team.failed_send_invite'));
      }
    } catch (error) {
      console.error('Error inviting user:', error);
      setInviteError(t('team.failed_send_invite_detail', { message: error.message || 'Network error' }));
    } finally {
      setIsInviting(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateUserError(null);
    setActionError(null);
    if (!createUserData.fullName || !createUserData.username || !createUserData.password || !currentOrganization?.id) {
      setCreateUserError(t('team.fill_required'));
      return;
    }
    if (!createUserData.roleId) {
      setCreateUserError(t('team.role_required'));
      return;
    }

    // Validate PIN is 6 digits
    if (!/^\d{6}$/.test(createUserData.password)) {
      setCreateUserError(t('team.pin_must_6_digits'));
      return;
    }

    setIsCreating(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        setCreateUserError(t('team.not_authenticated'));
        return;
      }

      const selectedRole = roles.find(r => r.id === createUserData.roleId);

      const response = await fetch(
        `${supabaseClient.supabaseUrl}/functions/v1/team-create-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fullName: createUserData.fullName,
            username: createUserData.username,
            password: createUserData.password,
            organizationId: currentOrganization.id,
            roleId: createUserData.roleId || null
          })
        }
      );

      const result = await response.json();

      if (result.success) {
        // Show credential card
        setCreatedCredentials({
          fullName: createUserData.fullName,
          username: createUserData.username,
          password: createUserData.password,
          email: result.email || null,
          roleName: selectedRole?.name || t('team.no_role_assigned')
        });
        
        // Reset form but keep default role (Member) if available, and generate new PIN
        const memberRole = roles.find(r => r.name === 'Member' || r.name === 'member');
        setCreateUserData({ 
          fullName: '', 
          username: '', 
          password: generatePIN(), 
          roleId: memberRole?.id || '' 
        });
        await loadData();
        onMembersChanged?.();
      } else {
        setCreateUserError(result.error || t('team.failed_create_user'));
      }
    } catch (error) {
      console.error('Error creating user:', error);
      setCreateUserError(t('team.failed_create_user'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateRole = async (userId) => {
    setActionError(null);
    if (!newRoleId || !currentOrganization?.id) {
      setActionError(t('team.select_role_error'));
      return;
    }

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        setActionError(t('team.not_authenticated'));
        return;
      }

      const response = await fetch(
        `${supabaseClient.supabaseUrl}/functions/v1/team-update-role`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: userId,
            organizationId: currentOrganization.id,
            roleId: newRoleId
          })
        }
      );

      const result = await response.json();

      if (result.success) {
        addToast(t('team.role_updated_member'), 'success');
        setEditingUser(null);
        setNewRoleId('');
        await loadData();
        onMembersChanged?.();
      } else {
        setActionError(result.error || t('team.failed_update_role'));
      }
    } catch (error) {
      console.error('Error updating role:', error);
      setActionError(t('team.failed_update_role'));
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!confirm(t('team.remove_confirm'))) {
      return;
    }

    setActionError(null);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        setActionError(t('team.not_authenticated'));
        return;
      }

      const response = await fetch(
        `${supabaseClient.supabaseUrl}/functions/v1/team-remove-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: userId,
            organizationId: currentOrganization.id
          })
        }
      );

      const result = await response.json();

      if (result.success) {
        addToast(t('team.user_removed'), 'success');
        await loadData();
        onMembersChanged?.();
      } else {
        setActionError(result.error || t('team.failed_remove_user'));
      }
    } catch (error) {
      console.error('Error removing user:', error);
      setActionError(t('team.failed_remove_user'));
    }
  };

  if (!show) return null;

  return (
    <PermissionGuard permission="can_manage_team">
      <Modal show={show} onClose={onClose} title={t('team.directory_title')} size="large">
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>{t('team.directory_intro')}</strong> {t('team.directory_intro_desc')}
          </p>
        </div>
        {loading ? (
          <LoadingSpinner />
        ) : createdCredentials ? (
          <CredentialCard
            fullName={createdCredentials.fullName}
            username={createdCredentials.username}
            password={createdCredentials.password}
            email={createdCredentials.email}
            roleName={createdCredentials.roleName}
            onClose={() => setCreatedCredentials(null)}
          />
        ) : (
          <div className="space-y-6">
            <FieldError message={listError} />
            {/* Tab Navigation */}
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8">
                <button type="button"
                  onClick={() => {
                    setActiveTab('invite');
                    setCreateUserError(null);
                    setActionError(null);
                  }}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'invite'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {t('team.tab_invite_email')}
                </button>
                <button type="button"
                  onClick={() => {
                    setActiveTab('create');
                    setInviteError(null);
                    setActionError(null);
                  }}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'create'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {t('team.tab_create_managed')}
                </button>
              </nav>
            </div>

            {/* Invite via Email Tab */}
            {activeTab === 'invite' && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold mb-4 text-gray-900">{t('team.invite_heading')}</h3>
                <form onSubmit={handleInvite} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('team.first_name')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder={t('team.placeholder_first')}
                        value={inviteData.firstName}
                        onChange={(e) => {
                          setInviteError(null);
                          setInviteData({ ...inviteData, firstName: e.target.value });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('team.last_name')}
                      </label>
                      <input
                        type="text"
                        placeholder={t('team.placeholder_last')}
                        value={inviteData.lastName}
                        onChange={(e) => {
                          setInviteError(null);
                          setInviteData({ ...inviteData, lastName: e.target.value });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('team.email_address')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder={t('team.placeholder_email')}
                      value={inviteData.email}
                      onChange={(e) => {
                        setInviteError(null);
                        setInviteData({ ...inviteData, email: e.target.value });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('team.phone_number')} <span className="text-gray-400 text-xs">{t('team.optional')}</span>
                    </label>
                    <input
                      type="tel"
                      placeholder={t('team.placeholder_phone')}
                      value={inviteData.phone}
                      onChange={handlePhoneChange}
                      maxLength={14}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('team.select_role')}
                    </label>
                    <p className="text-xs text-gray-500 mb-1">{t('team.app_permissions_role_hint')}</p>
                    <select
                      value={inviteData.roleId}
                      onChange={(e) => setInviteData({ ...inviteData, roleId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      {roles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  <FieldError message={inviteError} />
                  <button
                    type="submit"
                    disabled={isInviting}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {isInviting ? t('team.sending') : t('team.send_invite')}
                  </button>
                </form>
              </div>
            )}

            {/* Create Managed Account Tab */}
            {activeTab === 'create' && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="font-semibold mb-4 text-gray-900">{t('team.create_heading')}</h3>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('team.full_name')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={t('team.placeholder_full_name')}
                      value={createUserData.fullName}
                      onChange={(e) => {
                        setCreateUserError(null);
                        setCreateUserData({ ...createUserData, fullName: e.target.value });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('team.username')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={t('team.placeholder_username')}
                      value={createUserData.username}
                      onChange={(e) => setCreateUserData({ ...createUserData, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '') })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('team.username_hint')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('team.temp_pin')} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={createUserData.password}
                        readOnly
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-lg font-semibold text-center"
                      />
                      <button
                        type="button"
                        onClick={() => setCreateUserData(prev => ({ ...prev, password: generatePIN() }))}
                        className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
                        title={t('team.generate_pin')}
                      >
                        <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{t('team.pin_hint')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('team.select_role')}
                    </label>
                    <p className="text-xs text-gray-500 mb-1">{t('team.app_permissions_role_hint')}</p>
                    <select
                      value={createUserData.roleId}
                      onChange={(e) => setCreateUserData({ ...createUserData, roleId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      {roles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  <FieldError message={createUserError} />
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
                  >
                    {isCreating ? t('team.creating') : t('team.create_account')}
                  </button>
                </form>
              </div>
            )}

            {/* Organization Members List */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold">
                  {t('team.members_heading', { count: users.length + pendingInvitations.length })}
                </h3>
                <FieldError message={actionError} className="mt-3" />
              </div>
              <div className="divide-y divide-gray-200">
                {users.length === 0 && pendingInvitations.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">{t('team.no_org_members')}</div>
                ) : (
                  <>
                  {pendingInvitations.map((invitation) => {
                    const meta = invitation.metadata || {};
                    const displayName = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || invitation.email;
                    return (
                      <div key={`invite-${invitation.id}`} className="p-4 flex items-center justify-between bg-amber-50/60 hover:bg-amber-50">
                        <div className="flex items-center space-x-4 flex-1">
                          <Avatar name={displayName} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">
                              {displayName}
                              <span className="ml-2 text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                {t('team.pending_invite')}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500">{invitation.email}</div>
                            <div className="text-xs text-gray-400">
                              {t('team.role_label')} {invitation.roles?.name || t('team.no_role_assigned')}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {users.map(member => (
                    <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center space-x-4 flex-1">
                        <div className="flex-shrink-0">
                          {member.contacts?.avatar_url && !failedImages.has(member.id) ? (
                            <img
                              src={member.contacts.avatar_url}
                              alt={member.contacts?.name || t('common.user')}
                              className="w-10 h-10 rounded-full object-cover"
                              onError={() => handleImageError(member.id)}
                            />
                          ) : (
                            <Avatar 
                              name={member.contacts?.name || t('common.user')} 
                              size="md"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">
                            {member.contacts?.name || t('team.unknown_user')}
                            {member.id === user.id && (
                              <span className="ml-2 text-xs text-gray-500">({t('team.you')})</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{member.contacts?.email || t('team.no_email')}</div>
                          <div className="text-xs text-gray-400">
                            {t('team.role_label')} {member.roles?.name || t('team.no_role_assigned')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Edit Role */}
                        {editingUser === member.id ? (
                          <div className="flex items-center space-x-2">
                            <select
                              value={newRoleId}
                              onChange={(e) => setNewRoleId(e.target.value)}
                              className="px-2 py-1 text-sm border border-gray-300 rounded-md"
                            >
                              <option value="">{t('team.select_role')}</option>
                              {roles.map(role => (
                                <option key={role.id} value={role.id}>{role.name}</option>
                              ))}
                            </select>
                            <button type="button"
                              onClick={() => handleUpdateRole(member.id)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                              {t('common.save')}
                            </button>
                            <button type="button"
                              onClick={() => {
                                setEditingUser(null);
                                setNewRoleId('');
                              }}
                              className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Don't allow editing role for Org Admins */}
                            {member.roles?.name !== 'Org Admin' && (
                              <button type="button"
                                onClick={() => {
                                  setEditingUser(member.id);
                                  setNewRoleId(member.role_id || '');
                                }}
                                className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
                                disabled={member.id === user.id}
                              >
                                {t('team.edit_role_btn')}
                              </button>
                            )}
                            {member.id !== user.id && (
                              <button type="button"
                                onClick={() => handleRemoveUser(member.id)}
                                className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-md"
                              >
                                {t('team.remove')}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PermissionGuard>
  );
}

export default DirectoryManagementModal;
