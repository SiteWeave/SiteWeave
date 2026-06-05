import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient } from '../context/AppContext';
import { getContactIdentityError, normalizeContactFields } from '../utils/contactValidation';
import LoadingSpinner from './LoadingSpinner';
import { FieldError, fieldInputClassName } from './FormAlert';

function AddContactModal({
    onClose,
    onSave,
    contact = null,
    isLoading = false,
    currentOrganization = null,
    contactMode = 'both',
}) {
    const { t } = useTranslation();
    const isEditMode = !!contact;
    const lockedType = contactMode === 'staff' ? 'Team' : contactMode === 'trade_partner' ? 'Subcontractor' : null;

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
    const [type, setType] = useState(lockedType || contact?.type || 'Subcontractor');
    const [company, setCompany] = useState(contact?.company || '');
    const [trade, setTrade] = useState(contact?.trade || '');
    const [email, setEmail] = useState(contact?.email || '');
    const [phone, setPhone] = useState(contact?.phone || '');
    const [linkedAppRoleName, setLinkedAppRoleName] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({ email: '', phone: '' });
    const [isCheckingIdentity, setIsCheckingIdentity] = useState(false);

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
            setType(lockedType || contact.type || 'Subcontractor');
            setCompany(contact.company || '');
            setTrade(contact.trade || '');
            setEmail(contact.email || '');
            setPhone(contact.phone || '');
        }
    }, [contact, lockedType]);

    const effectiveType = lockedType || type;
    const isStaff = effectiveType === 'Team';

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!role || !String(role).trim()) return;

        setFieldErrors({ email: '', phone: '' });

        const normalized = normalizeContactFields({ email, phone });
        const contactData = {
            name,
            role,
            type: effectiveType,
            company: effectiveType === 'Subcontractor' ? company : 'SiteWeave',
            trade: effectiveType === 'Subcontractor' ? trade : 'Internal',
            avatar_url: null,
            email: normalized.email,
            phone: normalized.phone,
        };

        if (!isStaff) {
            contactData.status = null;
        }

        if (isEditMode) {
            contactData.id = contact.id;
        }

        const orgId = currentOrganization?.id;
        if (orgId && (contactData.email || contactData.phone)) {
            setIsCheckingIdentity(true);
            try {
                const identityError = await getContactIdentityError(
                    supabaseClient,
                    orgId,
                    contactData,
                    t,
                );
                if (identityError) {
                    setFieldErrors({
                        email: identityError.field === 'email' ? identityError.message : '',
                        phone: identityError.field === 'phone' ? identityError.message : '',
                    });
                    return;
                }
            } finally {
                setIsCheckingIdentity(false);
            }
        }

        onSave(contactData);
    };

    const isSubmitting = isLoading || isCheckingIdentity;

    const titleKey = isEditMode
        ? (isStaff ? 'contacts.edit_staff_title' : 'contacts.edit_title')
        : (isStaff ? 'contacts.add_staff_title' : 'contacts.add_trade_partner_title');

    return (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-white/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-6">{t(titleKey)}</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
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
                            {isStaff && (
                                <p className="mt-1 text-xs text-gray-500">{t('contacts.job_title_helper_company')}</p>
                            )}
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

                    {!lockedType && (
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
                    )}

                    {effectiveType === 'Subcontractor' && (
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

                    {effectiveType === 'Subcontractor' && (
                        <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900" role="note">
                            <p className="font-semibold text-blue-950">{t('contacts.how_they_get_updates')}</p>
                            <p className="mt-1 leading-relaxed">{t('contacts.trade_partner_notification_info')}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold mb-1">{t('contacts.email')}</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
                                }}
                                className={fieldInputClassName(!!fieldErrors.email, 'w-full p-3 border rounded-lg focus:ring-2 focus:border-transparent')}
                            />
                            <FieldError message={fieldErrors.email} />
                            {effectiveType === 'Subcontractor' && (
                                <p className="mt-1 text-xs text-gray-500">{t('contacts.email_for_reminders')}</p>
                            )}
                            {linkedAppRoleName && (
                                <p className="mt-1 text-xs text-blue-800">
                                    {t('share.org_app_role', { role: linkedAppRoleName })}
                                </p>
                            )}
                            {isStaff && email?.trim() && currentOrganization?.id && (
                                <p className="mt-1 text-xs text-gray-500">{t('contacts.staff_app_role_hint')}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1">{t('contacts.phone')}</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, '');
                                    if (value.length <= 10) {
                                        const formatted = value.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
                                        setPhone(value.length > 6 ? formatted : value.length > 3 ? value.replace(/(\d{3})(\d{0,3})/, '($1) $2') : value);
                                    }
                                    if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: '' }));
                                }}
                                placeholder={t('contacts.phone_placeholder')}
                                maxLength="14"
                                className={fieldInputClassName(!!fieldErrors.phone, 'w-full p-3 border rounded-lg focus:ring-2 focus:border-transparent')}
                            />
                            <FieldError message={fieldErrors.phone} />
                            {effectiveType === 'Subcontractor' && (
                                <p className="mt-1 text-xs text-gray-500">{t('contacts.phone_directory_hint')}</p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                        >
                            {isSubmitting ? (
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
