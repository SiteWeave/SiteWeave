import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import Avatar from './Avatar';
function ContactCard({
    contact,
    onAction,
    actionType,
    onEdit,
    onDelete,
    showActions = false,
    onAssignToProject,
    variant = 'default',
}) {
    const { t } = useTranslation();
    const isTradePartner = variant === 'trade_partner' || contact.type === 'Subcontractor';

    const getRolePillClass = () => {
        const role = (contact.role || '').toLowerCase();
        if (contact.type === 'Subcontractor') return 'bg-orange-100 text-orange-700';
        if (role.includes('manager')) return 'bg-purple-100 text-purple-700';
        if (role.includes('foreman')) return 'bg-blue-100 text-blue-700';
        if (role.includes('technician')) return 'bg-green-100 text-green-700';
        if (role.includes('estimator')) return 'bg-indigo-100 text-indigo-700';
        return 'bg-gray-100 text-gray-600';
    };

    const ActionButton = () => {
        if (!onAction) return null;

        if (actionType === 'add') {
            return (
                <button type="button" onClick={() => onAction(contact.id)} className="text-blue-500 hover:text-blue-700" title={t('contacts.add_to_project')}>
                    <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-5 h-5" />
                </button>
            );
        }

        if (actionType === 'remove') {
            return (
                <button type="button" onClick={() => onAction(contact.id)} className="text-red-500 hover:text-red-700" title={t('contacts.remove_from_project')}>
                    <Icon path="M19.5 12h-15" className="w-5 h-5" />
                </button>
            );
        }
    };

    const hasManagementActions = showActions && (onEdit || onDelete || onAssignToProject);
    const displayName = isTradePartner && contact.company
        ? contact.company
        : contact.name;
    const subtitle = isTradePartner
        ? [contact.trade, contact.name !== contact.company ? contact.name : null].filter(Boolean).join(' · ')
        : contact.role;

    return (
        <li className="flex flex-col gap-3 p-3 rounded-lg hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="relative shrink-0">
                    {contact.avatar_url ? (
                        <img src={contact.avatar_url} alt={displayName} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                        <Avatar name={displayName} size="lg" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{displayName}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {subtitle && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getRolePillClass()}`}>
                                {subtitle}
                            </span>
                        )}
                        {isTradePartner && (
                            <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    contact.email && String(contact.email).includes('@')
                                        ? 'bg-emerald-50 text-emerald-800'
                                        : 'bg-amber-50 text-amber-900'
                                }`}
                            >
                                {contact.email && String(contact.email).includes('@')
                                    ? t('contacts.email_ready')
                                    : t('contacts.add_email_for_reminders')}
                            </span>
                        )}
                        {contact.workContext?.assignedProjectNames?.length > 0 && (
                            <span className="text-xs text-gray-500 truncate">
                                {t('team.assigned_projects', { projects: contact.workContext.assignedProjectNames.join(', ') })}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end">
                <ActionButton />

                {hasManagementActions && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {onEdit && (
                            <button
                                type="button"
                                onClick={() => onEdit(contact)}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                                <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-3.5 h-3.5" />
                                {t('contacts.edit_profile')}
                            </button>
                        )}
                        {onAssignToProject && (
                            <button
                                type="button"
                                onClick={() => onAssignToProject(contact)}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
                            >
                                <Icon path="M5.5 8.5l3-3 3 3m-3-3v9m4-2h3.75a2.25 2.25 0 012.25 2.25V19.5H6" className="w-3.5 h-3.5" />
                                {t('contacts.assign_to_project')}
                            </button>
                        )}
                        {onDelete && (
                            <button
                                type="button"
                                onClick={() => onDelete(contact)}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                            >
                                <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-3.5 h-3.5" />
                                {t('common.delete')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}

export default ContactCard;
