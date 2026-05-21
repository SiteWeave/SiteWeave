import React from 'react';
import Icon from './Icon';

/**
 * RoleSummaryCard Component
 * Displays a compact role summary with member count
 * Clicking opens the role editor
 */
function RoleSummaryCard({
  role,
  memberCount,
  onEdit,
  onView,
  onDelete,
  isCreateCard = false,
  canEdit = true,
}) {
  if (isCreateCard) {
    return (
      <div
        onClick={onEdit}
        className="flex-shrink-0 w-48 bg-white border-2 border-dashed border-gray-300 rounded-lg px-3 py-2 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
      >
        <div className="flex flex-col items-center justify-center h-full min-h-[100px]">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-1.5">
            <Icon path="M12 4v16m8-8H4" className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-xs font-semibold text-gray-700">Create Custom Role</p>
        </div>
      </div>
    );
  }

  const isOrgAdmin = role?.name === 'Org Admin';
  const isDefaultRole = isOrgAdmin || role?.is_system_role;
  const showEditActions = canEdit && !isDefaultRole;
  const openRole = onView || onEdit;

  return (
    <div
      onClick={openRole ? openRole : undefined}
      className={`flex-shrink-0 w-64 bg-white border border-gray-200 rounded-lg px-3 pt-3 pb-2 transition-all ${
        openRole
          ? 'cursor-pointer hover:border-blue-500 hover:shadow-md'
          : 'cursor-default'
      }`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{role.name}</h3>
          {isDefaultRole && (
            <p className="text-xs text-gray-500 mt-0.5">Default role · view only</p>
          )}
        </div>
        {openRole && (
          <div className="flex shrink-0 items-center gap-0.5 ml-1.5">
            {!showEditActions && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 px-1">
                View
              </span>
            )}
            {showEditActions && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Edit role"
                >
                  <Icon path="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" className="w-3.5 h-3.5" />
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete role"
                    aria-label="Delete role"
                  >
                    <Icon path="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-1">
        <p className="text-xl font-bold text-gray-900">{memberCount}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {memberCount === 1 ? 'User' : 'Users'}
        </p>
      </div>
    </div>
  );
}

export default RoleSummaryCard;
