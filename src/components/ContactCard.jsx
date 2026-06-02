import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedContactStatus } from '@siteweave/i18n';
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
    onDeactivate,
    onMessage
}) {
    const { t } = useTranslation();
    const [showActionsMenu, setShowActionsMenu] = useState(false);

    const statusColorMap = {
        Available: 'bg-emerald-400',
        Busy: 'bg-amber-400',
        Offline: 'bg-gray-400',
        Inactive: 'bg-gray-400'
    };

    const statusColor = statusColorMap[contact.status] || 'bg-gray-300';
    const localizedStatus = getLocalizedContactStatus(contact.status, t);

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
        if (!onAction) return <span className={`w-3 h-3 rounded-full ${statusColor}`} title={localizedStatus}></span>;
        
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

    const handleEdit = (e) => {
        e.stopPropagation();
        if (onEdit) onEdit(contact);
        setShowActionsMenu(false);
    };

    const handleDelete = (e) => {
        e.stopPropagation();
        if (onDelete) onDelete(contact);
        setShowActionsMenu(false);
    };

    const handleAssign = (e) => {
        e.stopPropagation();
        if (onAssignToProject) onAssignToProject(contact);
        setShowActionsMenu(false);
    };

    const handleDeactivate = (e) => {
        e.stopPropagation();
        if (onDeactivate) onDeactivate(contact);
        setShowActionsMenu(false);
    };

    const handleEmailClick = (e) => {
        e.stopPropagation();
        if (contact.email) {
            window.location.href = `mailto:${contact.email}`;
        }
    };

    const handlePhoneClick = (e) => {
        e.stopPropagation();
        if (contact.phone) {
            window.location.href = `tel:${contact.phone}`;
        }
    };

    const handleMessageClick = (e) => {
        e.stopPropagation();
        if (onMessage) {
            onMessage(contact);
        }
    };

    return (
        <li className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 group relative">
            <div className="flex items-center gap-3 flex-1">
                <div className="relative">
                    {contact.avatar_url ? (
                        <img src={contact.avatar_url} alt={contact.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                        <Avatar name={contact.name} size="lg" />
                    )}
                    <span className={`absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${statusColor}`} aria-hidden="true"></span>
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <p className="font-semibold">{contact.name}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {contact.role && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getRolePillClass()}`}>
                                {contact.role}
                            </span>
                        )}
                        {contact.type === 'Subcontractor' && (
                            <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    contact.email && String(contact.email).includes('@')
                                        ? 'bg-emerald-50 text-emerald-800'
                                        : 'bg-amber-50 text-amber-900'
                                }`}
                                title={
                                    contact.email && String(contact.email).includes('@')
                                        ? t('contacts.can_receive_emails')
                                        : t('contacts.add_email_tooltip')
                                }
                            >
                                {contact.email && String(contact.email).includes('@')
                                    ? t('contacts.email_ready')
                                    : t('contacts.add_email_for_reminders')}
                            </span>
                        )}
                        {contact.company && contact.company !== 'SiteWeave' && (
                            <span className="text-xs text-gray-400">{contact.company}</span>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                {showActions && (
                    <div className="flex items-center gap-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {contact.email && (
                            <button
                                type="button"
                                onClick={handleEmailClick}
                                className="p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title={t('contacts.email_action')}
                            >
                                <Icon path="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" className="w-4 h-4" />
                                <span className="sr-only">{t('contacts.email_sr', { name: contact.name })}</span>
                            </button>
                        )}
                        {contact.phone && (
                            <button
                                type="button"
                                onClick={handlePhoneClick}
                                className="p-2 rounded-full text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                title={t('contacts.call')}
                            >
                                <Icon path="M2 5.5C2 4.12 3.12 3 4.5 3h1.384a1 1 0 01.948.684l1.276 3.827a1 1 0 01-.27 1.03l-1.21 1.21a11.042 11.042 0 005.53 5.53l1.21-1.21a1 1 0 011.03-.27l3.827 1.276a1 1 0 01.684.949V19.5A1.5 1.5 0 0016.5 21C8.596 21 2 14.404 2 6.5V5.5z" className="w-4 h-4" />
                                <span className="sr-only">{t('contacts.call_sr', { name: contact.name })}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleMessageClick}
                            className="p-2 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title={t('contacts.message')}
                        >
                            <Icon path="M7.5 8h9m-9 4h6M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.8L3 20l1.2-3.8A7.7 7.7 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" className="w-4 h-4" />
                            <span className="sr-only">{t('contacts.message_sr', { name: contact.name })}</span>
                        </button>
                    </div>
                )}

                <ActionButton />
                
                {showActions && (onEdit || onDelete || onAssignToProject || onDeactivate) && (
                    <div className="relative">
                        <button type="button"
                            onClick={() => setShowActionsMenu(!showActionsMenu)}
                            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Icon path="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" className="w-4 h-4" />
                            <span className="sr-only">{t('contacts.open_actions')}</span>
                        </button>
                        
                        {showActionsMenu && (
                            <div className="absolute right-0 top-9 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[170px] py-2">
                                {onEdit && (
                                    <button type="button"
                                        onClick={handleEdit}
                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    >
                                        <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-4 h-4" />
                                        {t('contacts.edit_profile')}
                                    </button>
                                )}
                                {onAssignToProject && (
                                    <button type="button"
                                        onClick={handleAssign}
                                        className="w-full px-4 py-2 text-left text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2"
                                    >
                                        <Icon path="M5.5 8.5l3-3 3 3m-3-3v9m4-2h3.75a2.25 2.25 0 012.25 2.25V19.5H6" className="w-4 h-4" />
                                        {t('contacts.assign_to_project')}
                                    </button>
                                )}
                                {onDeactivate && (
                                    <button type="button"
                                        onClick={handleDeactivate}
                                        className="w-full px-4 py-2 text-left text-sm text-amber-700 hover:bg-amber-50 flex items-center gap-2"
                                    >
                                        <Icon path="M15 12H9m-7 0a10 10 0 1010-10A10 10 0 002 12z" className="w-4 h-4" />
                                        {t('contacts.deactivate_user')}
                                    </button>
                                )}
                                {onDelete && (
                                    <button type="button"
                                        onClick={handleDelete}
                                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                    >
                                        <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4" />
                                        {t('common.delete')}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}

export default ContactCard;
