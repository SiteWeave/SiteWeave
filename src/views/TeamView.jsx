import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import TeamDirectory from '../components/TeamDirectory';
import DirectoryManagementModal from '../components/DirectoryManagementModal';
import RoleSummaryCard from '../components/RoleSummaryCard';
import RoleCreationModal from '../components/RoleCreationModal';
import DeleteRoleModal from '../components/DeleteRoleModal';
import PermissionGuard from '../components/PermissionGuard';
import { getRoles } from '../utils/roleManagementService';
import LoadingSpinner from '../components/LoadingSpinner';
import ActivityHistoryPanel from '../components/ActivityHistoryPanel';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import UpgradeRequiredModal from '../components/UpgradeRequiredModal';
import { isCustomRolesLockedError } from '@siteweave/core-logic';

function TeamView() {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const { addToast } = useToast();
  const { canCustomRoles } = useWorkspaceTier();
  const [showRolesUpgrade, setShowRolesUpgrade] = useState(false);
  const [showDirectoryModal, setShowDirectoryModal] = useState(false);
  const [roles, setRoles] = useState([]);
  const [roleMemberCounts, setRoleMemberCounts] = useState({});
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [rolePendingDelete, setRolePendingDelete] = useState(null);
  const [roleModalReadOnly, setRoleModalReadOnly] = useState(false);

  const canManageRoles = state.userRole?.permissions?.can_manage_roles === true;

  // Load roles and calculate member counts
  useEffect(() => {
    if (state.currentOrganization?.id) {
      loadRolesAndCounts();
    }
  }, [state.currentOrganization?.id]);

  const loadRolesAndCounts = async () => {
    if (!state.currentOrganization?.id) return;

    setLoadingRoles(true);
    try {
      const rolesData = await getRoles(supabaseClient, state.currentOrganization.id);
      setRoles(rolesData);

      // Count members per role by querying profiles
      const counts = {};
      for (const role of rolesData) {
        const { count, error } = await supabaseClient
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', state.currentOrganization.id)
          .eq('role_id', role.id);
        
        if (error) {
          console.error(`Error counting members for role ${role.id}:`, error);
          counts[role.id] = 0;
        } else {
          counts[role.id] = count || 0;
        }
      }
      setRoleMemberCounts(counts);
    } catch (error) {
      console.error('Error loading roles:', error);
      addToast(t('team.failed_load_roles'), 'error');
    } finally {
      setLoadingRoles(false);
    }
  };

  const handleViewRole = (role) => {
    setEditingRole(role);
    setRoleModalReadOnly(true);
    setShowRoleModal(true);
  };

  const handleEditRole = (role) => {
    if (!role) return;
    if (role.name === 'Org Admin' || role.is_system_role || !canCustomRoles) {
      handleViewRole(role);
      return;
    }
    if (!canManageRoles) {
      handleViewRole(role);
      return;
    }
    setEditingRole(role);
    setRoleModalReadOnly(false);
    setShowRoleModal(true);
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

  const handleDeleteRole = (role) => {
    if (!role?.id || role.is_system_role || role.name === 'Org Admin') return;
    setRolePendingDelete(role);
  };

  const handleSaveRole = async (roleData) => {
    if (!roleData.name || !state.currentOrganization?.id) return;

    // Prevent saving changes to Org Admin
    if (editingRole && editingRole.name === 'Org Admin') {
      addToast(t('team.org_admin_cannot_modify'), 'error');
      return;
    }

    setIsSavingRole(true);
    try {
      if (editingRole) {
        // Update existing role
        const { updateRole } = await import('../utils/roleManagementService');
        const result = await updateRole(supabaseClient, editingRole.id, roleData);
        if (result.success) {
          addToast(t('team.role_updated'), 'success');
          setShowRoleModal(false);
          setEditingRole(null);
          loadRolesAndCounts();
        } else {
          addToast(result.error || t('team.failed_update_role'), 'error');
        }
      } else {
        // Create new role
        const { createRole } = await import('../utils/roleManagementService');
        await createRole(supabaseClient, state.currentOrganization.id, roleData.name, roleData.permissions);
        addToast(t('team.role_created'), 'success');
        setShowRoleModal(false);
        loadRolesAndCounts();
      }
    } catch (error) {
      console.error('Error saving role:', error);
      if (isCustomRolesLockedError(error)) {
        setShowRolesUpgrade(true);
      } else {
        addToast(error.message || t('team.failed_save_role'), 'error');
      }
    } finally {
      setIsSavingRole(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{t('team.org_directory_title')}</h1>
          <p className="text-gray-500 text-sm">{t('team.org_directory_subtitle')}</p>
        </div>
        <PermissionGuard permission="can_manage_team">
          <button type="button"
            onClick={() => setShowDirectoryModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold"
            title={t('team.manage_members_title')}
          >
            {t('team.manage_members')}
          </button>
        </PermissionGuard>
      </div>

      <TeamDirectory />

      {/* Roles & Permissions — all members can view; changes require manage + custom tier */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t('team.roles_permissions_title')}</h2>
            <p className="text-gray-500 text-sm mt-1">
              {canManageRoles && canCustomRoles
                ? t('team.roles_permissions_desc_manage')
                : t('team.roles_permissions_desc_view')}
            </p>
          </div>
        </div>

        {loadingRoles ? (
          <LoadingSpinner />
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
              {[...roles]
                .sort((a, b) => {
                  if (a.name === 'Org Admin') return -1;
                  if (b.name === 'Org Admin') return 1;
                  if (a.is_system_role !== b.is_system_role) return a.is_system_role ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map((role) => (
                  <RoleSummaryCard
                    key={role.id}
                    role={role}
                    memberCount={roleMemberCounts[role.id] || 0}
                    onView={() => handleViewRole(role)}
                    onEdit={
                      canManageRoles && canCustomRoles && !role.is_system_role && role.name !== 'Org Admin'
                        ? () => handleEditRole(role)
                        : undefined
                    }
                    canEdit={canManageRoles && canCustomRoles}
                    onDelete={
                      canManageRoles && canCustomRoles && !role.is_system_role && role.name !== 'Org Admin'
                        ? () => handleDeleteRole(role)
                        : undefined
                    }
                  />
                ))}
              {canManageRoles && canCustomRoles && (
                <RoleSummaryCard
                  isCreateCard={true}
                  onEdit={handleCreateRole}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <PermissionGuard permission="can_view_activity_history">
        {state.currentOrganization?.id && (
          <div className="mt-12 pt-8 border-t border-gray-200">
            <ActivityHistoryPanel
              mode="organization"
              organizationId={state.currentOrganization.id}
            />
          </div>
        )}
      </PermissionGuard>

      <DirectoryManagementModal 
        show={showDirectoryModal} 
        onClose={() => setShowDirectoryModal(false)} 
      />

      <RoleCreationModal
        show={showRoleModal}
        onClose={() => {
          setShowRoleModal(false);
          setEditingRole(null);
          setRoleModalReadOnly(false);
        }}
        onSave={handleSaveRole}
        existingRole={editingRole}
        isLoading={isSavingRole}
        readOnly={roleModalReadOnly}
      />

      <DeleteRoleModal
        show={!!rolePendingDelete}
        onClose={() => setRolePendingDelete(null)}
        organizationId={state.currentOrganization?.id}
        roleToDelete={rolePendingDelete}
        allRoles={roles}
        onDeleted={loadRolesAndCounts}
      />

      <UpgradeRequiredModal
        isOpen={showRolesUpgrade}
        onClose={() => setShowRolesUpgrade(false)}
        feature="custom_roles"
      />
    </div>
  );
}

export default TeamView;
