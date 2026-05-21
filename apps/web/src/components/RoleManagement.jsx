import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { getRoles, createRole, updateRole } from '../utils/roleManagementService';
import { useToast } from '../context/ToastContext';
import PermissionGuard from './PermissionGuard';
import LoadingSpinner from './LoadingSpinner';
import RoleCreationModal from './RoleCreationModal';
import DeleteRoleModal from './DeleteRoleModal';
import Icon from './Icon';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import UpgradeRequiredModal from './UpgradeRequiredModal';
import { isCustomRolesLockedError } from '@siteweave/core-logic';

// Default permission structure
const DEFAULT_PERMISSIONS = {
  can_create_tasks: false,
  can_manage_users: false,
  can_delete_projects: false,
  can_assign_tasks: false,
  can_manage_contacts: false,
  can_create_projects: false,
  can_edit_projects: false
};

// Permission key to label mapping
const PERMISSION_LABELS = {
  can_create_projects: 'Create Projects',
  can_edit_projects: 'Edit Projects',
  can_delete_projects: 'Delete Projects',
  can_create_tasks: 'Create Tasks',
  can_edit_tasks: 'Edit Tasks',
  can_delete_tasks: 'Delete Tasks',
  can_assign_tasks: 'Assign Tasks',
  can_manage_team: 'Manage Organization Directory',
  can_manage_roles: 'Manage Roles',
  can_manage_contacts: 'Manage Contacts',
  can_manage_users: 'Manage Users',
  can_view_activity_history: 'View Activity History',
  can_manage_progress_reports: 'Project Progress Reports',
  can_manage_org_progress_reports: 'Organization Progress Reports',
};

// Helper function to get permission label
const getPermissionLabel = (key) => {
  return PERMISSION_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

function RoleManagement() {
  const { state } = useContext(AppContext);
  const { addToast } = useToast();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rolePendingDelete, setRolePendingDelete] = useState(null);
  const [roleModalReadOnly, setRoleModalReadOnly] = useState(false);

  const organizationId = state.currentOrganization?.id;
  const { canCustomRoles } = useWorkspaceTier();
  const [showRolesUpgrade, setShowRolesUpgrade] = useState(false);

  useEffect(() => {
    if (organizationId) {
      loadRoles();
    }
  }, [organizationId]);

  const loadRoles = async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const rolesData = await getRoles(supabaseClient, organizationId);
      setRoles(rolesData);
    } catch (error) {
      console.error('Error loading roles:', error);
      addToast('Failed to load roles', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRole = async (roleData) => {
    if (!roleData.name || !organizationId) return;

    // Prevent saving changes to Org Admin
    if (editingRole && editingRole.name === 'Org Admin') {
      addToast('Organization Admin role cannot be modified.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (editingRole) {
        // Update existing role
        const result = await updateRole(supabaseClient, editingRole.id, roleData);
        if (result.success) {
          addToast('Role updated successfully', 'success');
          setShowRoleModal(false);
          setEditingRole(null);
          loadRoles();
        } else {
          addToast(result.error || 'Failed to update role', 'error');
        }
      } else {
        // Create new role
        await createRole(supabaseClient, organizationId, roleData.name, roleData.permissions);
        addToast('Role created successfully', 'success');
        setShowRoleModal(false);
        loadRoles();
      }
    } catch (error) {
      console.error('Error saving role:', error);
      if (isCustomRolesLockedError(error)) {
        setShowRolesUpgrade(true);
      } else {
        addToast(error.message || 'Failed to save role', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateRole = async (role) => {
    if (!canCustomRoles) {
      setShowRolesUpgrade(true);
      return;
    }
    if (!organizationId) return;

    setIsSaving(true);
    try {
      const duplicatedName = `${role.name} (Copy)`;
      await createRole(supabaseClient, organizationId, duplicatedName, role.permissions);
      addToast('Role duplicated successfully', 'success');
      loadRoles();
    } catch (error) {
      console.error('Error duplicating role:', error);
      addToast('Failed to duplicate role', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = (role) => {
    setRolePendingDelete(role);
  };

  const handleCreateRole = () => {
    if (!canCustomRoles) {
      setShowRolesUpgrade(true);
      return;
    }
    setEditingRole(null);
    setRoleModalReadOnly(false);
    setShowRoleModal(true);
  };

  const handleViewRole = (role) => {
    setEditingRole(role);
    setRoleModalReadOnly(true);
    setShowRoleModal(true);
  };

  const handleEditRole = (role) => {
    if (role.name === 'Org Admin' || role.is_system_role || !canCustomRoles) {
      handleViewRole(role);
      return;
    }
    setEditingRole(role);
    setRoleModalReadOnly(false);
    setShowRoleModal(true);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Role Management</h2>
        <p className="text-gray-600 mt-1">
          {canCustomRoles
            ? 'Create and manage custom roles for your organization'
            : 'View default role permissions below. Upgrade to create custom roles and change permissions.'}
        </p>
      </div>

      {canCustomRoles && (
        <PermissionGuard permission="can_manage_roles">
          <div className="mb-6">
            <button
              onClick={handleCreateRole}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
            >
              <Icon path="M12 4v16m8-8H4" className="w-5 h-5" />
              <span>Create Custom Role</span>
            </button>
          </div>
        </PermissionGuard>
      )}

      {/* Roles List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Roles</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {roles.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No roles found</div>
          ) : (
            [...roles]
              .sort((a, b) => {
                if (a.name === 'Org Admin') return -1;
                if (b.name === 'Org Admin') return 1;
                if (a.is_system_role !== b.is_system_role) return a.is_system_role ? -1 : 1;
                return a.name.localeCompare(b.name);
              })
              .map((role) => {
              const canEditRole = canCustomRoles && !role.is_system_role && role.name !== 'Org Admin';
              return (
              <div key={role.id} className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="font-medium">{role.name}</h4>
                    {role.is_system_role && (
                      <span className="text-xs text-gray-500">Default role — view only</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleViewRole(role)}
                      className="px-3 py-1 text-gray-700 hover:bg-gray-100 rounded text-sm border border-gray-200"
                    >
                      View permissions
                    </button>
                    <PermissionGuard permission="can_manage_roles">
                      {canEditRole && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDuplicateRole(role)}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded"
                            title="Duplicate role"
                          >
                            <Icon path="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditRole(role)}
                            className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded text-sm"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRole(role)}
                            className="px-3 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </PermissionGuard>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(role.permissions || {})
                      .filter(([_, value]) => value === true)
                      .map(([key, _]) => (
                        <span key={key} className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          {getPermissionLabel(key)}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            );
            })
          )}
        </div>
      </div>

      {/* Role Creation Modal */}
      <RoleCreationModal
        show={showRoleModal}
        onClose={() => {
          setShowRoleModal(false);
          setEditingRole(null);
          setRoleModalReadOnly(false);
        }}
        onSave={handleSaveRole}
        existingRole={editingRole}
        isLoading={isSaving}
        readOnly={roleModalReadOnly}
      />

      <DeleteRoleModal
        show={!!rolePendingDelete}
        onClose={() => setRolePendingDelete(null)}
        organizationId={organizationId}
        roleToDelete={rolePendingDelete}
        allRoles={roles}
        onDeleted={loadRoles}
      />
      <UpgradeRequiredModal
        isOpen={showRolesUpgrade}
        onClose={() => setShowRolesUpgrade(false)}
        feature="custom_roles"
      />
    </div>
  );
}

export default RoleManagement;

