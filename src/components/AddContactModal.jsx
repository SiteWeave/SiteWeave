import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient } from '../context/AppContext';
import LoadingSpinner from './LoadingSpinner';

function AddContactModal({ onClose, onSave, contact = null, isLoading = false, currentOrganization = null }) {
    const { t } = useTranslation();
    const isEditMode = !!contact;
    
    const [name, setName] = useState(contact?.name || '');
    const JOB_TITLE_PRESETS = ['Estimator', 'Foreman', 'Technician', 'Project Manager', 'Superintendent', 'Other'];
    const [rolePreset, setRolePreset] = useState(() => {
        const r = contact?.role || '';
        return JOB_TITLE_PRESETS.includes(r) ? r : (r ? 'Other' : '');
    });
    const [roleOther, setRoleOther] = useState(() => {
        const r = contact?.role || '';
        return JOB_TITLE_PRESETS.includes(r) ? '' : r;
    });
    const role = rolePreset === 'Other' ? roleOther : rolePreset;
    const [type, setType] = useState(contact?.type || 'Team');
    const [company, setCompany] = useState(contact?.company || '');
    const [trade, setTrade] = useState(contact?.trade || '');
    const [email, setEmail] = useState(contact?.email || '');
    const [phone, setPhone] = useState(contact?.phone || '');
    const [linkedAppRoleName, setLinkedAppRoleName] = useState(null);

    useEffect(() => {
        const orgId = currentOrganization?.id;
        const normalizedEmail = email?.trim()?.toLowerCase();
        if (!orgId || !normalizedEmail) {
            setLinkedAppRoleName(null);
            return undefined;
        }

        let cancelled = false;
        (async () => {
            const { data: contactRow } = await supabaseClient
                .from('contacts')
                .select('id')
                .eq('organization_id', orgId)
                .ilike('email', normalizedEmail)
                .maybeSingle();

            if (!contactRow?.id) {
                if (!cancelled) setLinkedAppRoleName(null);
                return;
            }

            const { data: profileRow } = await supabaseClient
                .from('profiles')
                .select('roles(name)')
                .eq('contact_id', contactRow.id)
                .eq('organization_id', orgId)
                .maybeSingle();

            if (!cancelled) {
                setLinkedAppRoleName(profileRow?.roles?.name ?? null);
            }
        })();

        return () => { cancelled = true; };
    }, [email, currentOrganization?.id]);

    useEffect(() => {
        if (contact) {
            setName(contact.name || '');
            const r = contact.role || '';
            setRolePreset(JOB_TITLE_PRESETS.includes(r) ? r : (r ? 'Other' : ''));
            setRoleOther(JOB_TITLE_PRESETS.includes(r) ? '' : r);
            setType(contact.type || 'Team');
            setCompany(contact.company || '');
            setTrade(contact.trade || '');
            setEmail(contact.email || '');
            setPhone(contact.phone || '');
        }
    }, [contact]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!role || !String(role).trim()) return;
        const contactData = {
            name,
            role,
            type,
            company: type === 'Subcontractor' ? company : 'SiteWeave',
            trade: type === 'Subcontractor' ? trade : 'Internal',
            avatar_url: null, // Will use Avatar component with initials
            email,
            phone,
            status: 'Available'
        };
        
        if (isEditMode) {
            contactData.id = contact.id;
        }
        
        onSave(contactData);
    };

    return (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-6">
                    {isEditMode ? t('contacts.edit_title') : t('contacts.add_title')}
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold mb-1">{t('contacts.name_label')}</label>
                            <input 
                                type="text" 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                                required 
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-semibold mb-1">{t('contacts.job_title_label')}</label>
                            <select
                                value={rolePreset}
                                onChange={e => setRolePreset(e.target.value)}
                                className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            >
                                <option value="" disabled>{t('contacts.select_job_title')}</option>
                                {JOB_TITLE_PRESETS.map((preset) => (
                                    <option key={preset} value={preset}>
                                        {preset === 'Other' ? t('contacts.job_title_other') : preset}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-500">{t('contacts.job_title_helper')}</p>
                            {rolePreset === 'Other' && (
                                <input
                                    type="text"
                                    value={roleOther}
                                    onChange={e => setRoleOther(e.target.value)}
                                    placeholder={t('contacts.job_title_custom_placeholder')}
                                    className="w-full mt-2 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            )}
                        </div>
                    </div>

                    {/* Contact Type */}
                    <div>
                        <label className="block text-sm font-semibold mb-1">{t('contacts.contact_type')}</label>
                        <select 
                            value={type} 
                            onChange={e => setType(e.target.value)} 
                            className="w-full p-3 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="Team">{t('contacts.type_team')}</option>
                            <option value="Subcontractor">{t('contacts.type_trade_partner')}</option>
                        </select>
                    </div>

                    {/* Company and Trade (for Trade Partners) */}
                    {type === 'Subcontractor' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold mb-1">{t('contacts.company')}</label>
                                <input 
                                    type="text" 
                                    value={company} 
                                    onChange={e => setCompany(e.target.value)} 
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-semibold mb-1">{t('contacts.trade')}</label>
                                <input 
                                    type="text" 
                                    value={trade} 
                                    onChange={e => setTrade(e.target.value)} 
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                                />
                            </div>
                        </div>
                    )}

                    {type === 'Subcontractor' && (
                        <div
                            className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900"
                            role="note"
                        >
                            <p className="font-semibold text-blue-950">{t('contacts.how_they_get_updates')}</p>
                            <p className="mt-1 leading-relaxed">{t('contacts.trade_partner_notification_info')}</p>
                        </div>
                    )}

                    {/* Contact Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold mb-1">{t('contacts.email')}</label>
                            <input 
                                type="email" 
                                value={email} 
                                onChange={e => setEmail(e.target.value)} 
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                            />
                            {type === 'Subcontractor' && (
                                <p className="mt-1 text-xs text-gray-500">{t('contacts.email_for_reminders')}</p>
                            )}
                            {linkedAppRoleName && (
                                <p className="mt-1 text-xs text-blue-800">
                                    {t('share.org_app_role', { role: linkedAppRoleName })}
                                </p>
                            )}
                            {email?.trim() && currentOrganization?.id && (
                                <p className="mt-1 text-xs text-gray-500">
                                    {t('team.app_permissions_role_hint')} {t('team.manage_members')}
                                </p>
                            )}
                        </div>
                        
                        <div>
                            <label className="block text-sm font-semibold mb-1">{t('contacts.phone')}</label>
                            <input 
                                type="tel" 
                                value={phone} 
                                onChange={e => {
                                    const value = e.target.value.replace(/\D/g, '');
                                    if (value.length <= 10) {
                                        const formatted = value.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
                                        setPhone(value.length > 6 ? formatted : value.length > 3 ? value.replace(/(\d{3})(\d{0,3})/, '($1) $2') : value);
                                    }
                                }}
                                placeholder={t('contacts.phone_placeholder')}
                                maxLength="14"
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                            />
                            {type === 'Subcontractor' && (
                                <p className="mt-1 text-xs text-gray-500">{t('contacts.phone_directory_hint')}</p>
                            )}
                        </div>
                    </div>


                    {/* Action Buttons */}
                    <div className="flex justify-end gap-4 pt-4 border-t">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            disabled={isLoading} 
                            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                        >
                            {t('common.cancel')}
                        </button>
                        <button 
                            type="submit" 
                            disabled={isLoading} 
                            className="px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                        >
                            {isLoading ? (
                                <>
                                    <LoadingSpinner size="sm" text="" />
                                    {isEditMode ? t('contacts.updating') : t('contacts.adding')}
                                </>
                            ) : (
                                isEditMode ? t('contacts.update_contact') : t('contacts.add_contact_btn')
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddContactModal;
