import React, { useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';

/**
 * Role Creation Modal
 * Modal for creating or editing custom roles with grouped permissions
 */

// Permission groups
const PERMISSION_GROUPS = [
  {
    category: 'Project',
    icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
    permissions: [
      { key: 'can_create_projects', label: 'Create Projects', description: 'Create new projects' },
      { key: 'can_edit_projects', label: 'Edit Projects', description: 'Modify existing projects' },
      { key: 'can_delete_projects', label: 'Delete Projects', description: 'Remove projects' },
      { key: 'can_create_tasks', label: 'Create Tasks', description: 'Create new tasks' },
      { key: 'can_edit_tasks', label: 'Edit Tasks', description: 'Modify existing tasks' },
      { key: 'can_delete_tasks', label: 'Delete Tasks', description: 'Remove tasks' },
      { key: 'can_assign_tasks', label: 'Assign Tasks', description: 'Assign tasks to team members' },
      { key: 'can_view_activity_history', label: 'View Activity History', description: 'See recent activity, toasts, and full activity logs for projects you can access' },
      { key: 'can_manage_progress_reports', label: 'Project progress reports', description: 'Schedule and send progress reports for individual projects' },
      { key: 'can_manage_org_progress_reports', label: 'Organization progress reports', description: 'Organization-wide reports across multiple projects (typically admins only)' },
    ]
  },
  {
    category: 'People',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    permissions: [
      { key: 'can_manage_team', label: 'Manage Organization Directory', description: 'Add or remove employees from your company account' },
      { key: 'can_manage_roles', label: 'Manage Roles', description: 'Create and edit custom roles' },
      { key: 'can_manage_contacts', label: 'Manage Contacts', description: 'Add and edit contact information' },
      { key: 'can_manage_users', label: 'Manage Users', description: 'Manage user accounts and permissions' },
    ]
  }
];

// Default permissions structure
const DEFAULT_PERMISSIONS = {
  can_create_projects: false,
  can_edit_projects: false,
  can_delete_projects: false,
  can_create_tasks: false,
  can_edit_tasks: false,
  can_delete_tasks: false,
  can_assign_tasks: false,
  can_manage_team: false,
  can_manage_roles: false,
  can_manage_contacts: false,
  can_manage_users: false,
  can_view_activity_history: false,
  can_manage_progress_reports: false,
  can_manage_org_progress_reports: false,
};

function RoleCreationModal({
  show,
  onClose,
  onSave,
  existingRole = null,
  isLoading = false,
  readOnly = false,
}) {
  const [roleName, setRoleName] = useState(existingRole?.name || '');
  const [permissions, setPermissions] = useState(existingRole?.permissions || { ...DEFAULT_PERMISSIONS });

  const isOrgAdmin = existingRole?.name === 'Org Admin';
  const isLocked = readOnly || isOrgAdmin || existingRole?.is_system_role;

  // Reset form when modal opens/closes or existingRole changes
  React.useEffect(() => {
    if (show) {
      setRoleName(existingRole?.name || '');
      setPermissions(existingRole?.permissions || { ...DEFAULT_PERMISSIONS });
    }
  }, [show, existingRole]);

  const handlePermissionToggle = (permissionKey) => {
    if (isLocked) return;
    
    setPermissions(prev => ({
      ...prev,
      [permissionKey]: !prev[permissionKey]
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!roleName.trim()) {
      return;
    }
    if (isLocked) {
      return;
    }
    onSave({
      name: roleName.trim(),
      permissions
    });
  };

  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onClose}
      title={
        readOnly
          ? (existingRole ? `View role: ${existingRole.name}` : 'View role')
          : existingRole
            ? 'Edit Role'
            : 'Create Custom Role'
      }
      size="large"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Role Name Input */}
        <div>
          <label htmlFor="roleName" className="block text-sm font-medium text-gray-700 mb-2">
            Role Name
          </label>
          <input
            type="text"
            id="roleName"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="e.g., Site Supervisor, Project Manager"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            required
            autoFocus
            disabled={isLocked}
            readOnly={readOnly}
          />
          {readOnly && (
            <p className="mt-2 text-sm text-gray-500">
              Default roles are read-only on your plan. Upgrade to create or edit custom roles.
            </p>
          )}
          {!readOnly && isOrgAdmin && (
            <p className="mt-2 text-sm text-amber-600">
              Organization Admin role cannot be modified. This role has all permissions by default.
            </p>
          )}
          {existingRole?.is_system_role && !readOnly && !isOrgAdmin && (
            <p className="mt-2 text-sm text-gray-500">System role — permissions cannot be changed.</p>
          )}
        </div>

        {/* Permission Groups */}
        <div className="space-y-6">
          {PERMISSION_GROUPS.map(group => (
            <div key={group.category} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center space-x-2 mb-4">
                <Icon path={group.icon} className="w-5 h-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">{group.category}</h3>
              </div>
              <div className="space-y-3">
                {group.permissions.map(perm => (
                  <label
                    key={perm.key}
                    className={`flex items-start space-x-3 p-3 rounded-lg transition-colors ${
                      isLocked
                        ? 'cursor-default'
                        : 'hover:bg-white cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={permissions[perm.key] || false}
                      onChange={() => handlePermissionToggle(perm.key)}
                      disabled={isLocked}
                      readOnly={readOnly}
                      className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-900">{perm.label}</div>
                      <div className="text-xs text-gray-500">{perm.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            disabled={isLoading}
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isLoading || !roleName.trim() || isOrgAdmin}
            >
              {isLoading ? 'Saving...' : existingRole ? 'Update Role' : 'Create Role'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default RoleCreationModal;
