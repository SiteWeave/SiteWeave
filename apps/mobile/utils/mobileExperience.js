import AsyncStorage from '@react-native-async-storage/async-storage';

export const MOBILE_EXPERIENCE_STORAGE_KEY = 'mobile_experience_mode_v1';

/** @typedef {'field' | 'manager'} MobileExperienceMode */

export const MOBILE_EXPERIENCE_MODES = {
  FIELD: 'field',
  MANAGER: 'manager',
};

export function isOrgAdminRole(role) {
  const name = role?.name || '';
  return name === 'Organization Admin' || name === 'Admin' || name === 'Org Admin';
}

export function resolvePermissionFlags(role) {
  const perms = role?.permissions || {};
  const isAdmin = isOrgAdminRole(role);
  const canCreateProjects = perms.can_create_projects === true || isAdmin;
  const canEditProjects = perms.can_edit_projects === true || isAdmin;
  const canManageProgressReports = perms.can_manage_progress_reports === true || isAdmin;
  const canCreateTasks = perms.can_create_tasks === true || isAdmin;
  const canAssignTasks = perms.can_assign_tasks === true || isAdmin;
  const canViewActivityHistory = perms.can_view_activity_history === true || isAdmin;
  const hasManagerAccess =
    canCreateProjects ||
    canEditProjects ||
    canManageProgressReports ||
    canAssignTasks ||
    canViewActivityHistory ||
    isAdmin;

  return {
    userRole: role || null,
    canCreateProjects,
    canEditProjects,
    canManageProgressReports,
    canCreateTasks,
    canAssignTasks,
    canViewActivityHistory,
    hasManagerAccess,
    isOrgAdmin: isAdmin,
  };
}

export function defaultExperienceMode({ hasManagerAccess, isProjectCollaborator }) {
  if (isProjectCollaborator || !hasManagerAccess) {
    return MOBILE_EXPERIENCE_MODES.FIELD;
  }
  return MOBILE_EXPERIENCE_MODES.MANAGER;
}

export function showManagerUi(mode, hasManagerAccess) {
  return hasManagerAccess && mode === MOBILE_EXPERIENCE_MODES.MANAGER;
}

export async function loadStoredExperienceMode() {
  try {
    const value = await AsyncStorage.getItem(MOBILE_EXPERIENCE_STORAGE_KEY);
    if (value === MOBILE_EXPERIENCE_MODES.FIELD || value === MOBILE_EXPERIENCE_MODES.MANAGER) {
      return value;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function persistExperienceMode(mode) {
  await AsyncStorage.setItem(MOBILE_EXPERIENCE_STORAGE_KEY, mode);
}
