import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { hasPermission } from '../utils/permissions';
import { supabaseClient } from '../context/AppContext';

/**
 * PermissionGuard Component
 * Conditionally renders children based on user permissions
 * 
 * Usage:
 * <PermissionGuard permission="can_delete_projects">
 *   <button type="button">Delete</button>
 * </PermissionGuard>
 */
function PermissionGuard({ permission, children, fallback = null }) {
  const context = useAppContext();

  // Handle case where context might not be available yet
  if (!context || !context.state) {
    return fallback;
  }

  const { state } = context;

  // Fast path: Check cached permissions synchronously (no async delay)
  if (state.userRole?.permissions) {
    const hasAccess = state.userRole.permissions[permission] === true;
    if (!hasAccess) {
      return fallback;
    }
    return children;
  }

  // Fallback: If role not loaded yet, show nothing (will update when role loads)
  // This prevents the 3-second delay by not making async calls
  if (!state.user || !state.currentOrganization?.id) {
    return fallback;
  }

  // While role is loading, don't block rendering - show fallback
  // The component will re-render when userRole is set
  return fallback;
}

export default PermissionGuard;

/**
 * Can Component (Alias for PermissionGuard with cleaner API)
 * 
 * Usage:
 * <Can permission="can_delete_projects">
 *   <button type="button">Delete</button>
 * </Can>
 */
export function Can({ permission, children, fallback = null }) {
  return (
    <PermissionGuard permission={permission} fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

