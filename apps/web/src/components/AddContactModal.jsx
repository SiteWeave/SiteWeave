import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabaseClient } from '../context/AppContext';
import { TRADE_OPTIONS } from '@siteweave/core-logic';
import { getContactIdentityError, normalizeContactFields } from '../utils/contactValidation';
import LoadingSpinner from './LoadingSpinner';
import { FieldError, fieldInputClassName } from './FormAlert';

const TRADE_I18N_KEYS = {
  Plumbing: 'contacts.trade_plumbing',
  Electrical: 'contacts.trade_electrical',
  Framing: 'contacts.trade_framing',
  Civil: 'contacts.trade_civil',
  Landscaping: 'contacts.trade_landscaping',
};

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
  const [type, setType] = useState(lockedType || contact?.type || 'Subcontractor');
  const [company, setCompany] = useState(contact?.company || '');
  const [trade, setTrade] = useState(() => {
    const existing = contact?.trade || '';
    return TRADE_OPTIONS.includes(existing) ? existing : '';
  });
  const [email, setEmail] = useState(contact?.email || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [linkedAppRoleName, setLinkedAppRoleName] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({ email: '', phone: '' });
  const [isCheckingIdentity, setIsCheckingIdentity] = useState(false);

  const tradeOptions = useMemo(
    () => TRADE_OPTIONS.map((value) => ({
      value,
      label: t(TRADE_I18N_KEYS[value] || value),
    })),
    [t],
  );

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
      setType(lockedType || contact.type || 'Subcontractor');
      setCompany(contact.company || '');
      const existingTrade = contact.trade || '';
      setTrade(TRADE_OPTIONS.includes(existingTrade) ? existingTrade : '');
      setEmail(contact.email || '');
      setPhone(contact.phone || '');
    }
  }, [contact, lockedType]);

  const effectiveType = lockedType || type;
  const isStaff = effectiveType === 'Team';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({ email: '', phone: '' });

    const normalized = normalizeContactFields({ email, phone });
    const contactData = {
      name,
      role: null,
      type: effectiveType,
      company: effectiveType === 'Subcontractor' ? company : 'SiteWeave',
      trade: effectiveType === 'Subcontractor' ? (trade || null) : 'Internal',
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

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30';
  const labelClass = 'mb-1 block text-sm font-semibold text-slate-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-[2px] bg-white/20 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl ring-1 ring-slate-200/80">
        <h2 className="text-xl font-semibold text-slate-900">{t(titleKey)}</h2>
        {isStaff && !isEditMode && (
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t('contacts.add_staff_subtitle')}</p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {!lockedType && (
            <div>
              <label className={labelClass}>{t('contacts.contact_type')}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={`${inputClass} bg-white`}
              >
                <option value="Team">{t('contacts.type_team')}</option>
                <option value="Subcontractor">{t('contacts.type_trade_partner')}</option>
              </select>
            </div>
          )}

          {effectiveType === 'Subcontractor' && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Company</p>
              <div>
                <label className={labelClass}>{t('contacts.name_label')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>{t('contacts.company')}</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('contacts.trade_select_optional')}</label>
                <select
                  value={trade}
                  onChange={(e) => setTrade(e.target.value)}
                  className={`${inputClass} bg-white`}
                >
                  <option value="">{t('contacts.trade_select_placeholder')}</option>
                  {tradeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {isStaff && (
            <div>
              <label className={labelClass}>{t('contacts.name_label')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          )}

          <div className="space-y-4">
            {effectiveType === 'Subcontractor' && (
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contact</p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t('contacts.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  className={fieldInputClassName(!!fieldErrors.email, inputClass)}
                />
                <FieldError message={fieldErrors.email} />
                {linkedAppRoleName && (
                  <p className="mt-1 text-xs text-blue-800">
                    {t('share.org_app_role', { role: linkedAppRoleName })}
                  </p>
                )}
                {isStaff && email?.trim() && currentOrganization?.id && (
                  <p className="mt-1 text-xs text-slate-500">{t('contacts.staff_app_role_hint')}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>{t('contacts.phone')}</label>
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
                  className={fieldInputClassName(!!fieldErrors.phone, inputClass)}
                />
                <FieldError message={fieldErrors.phone} />
                {effectiveType === 'Subcontractor' && (
                  <p className="mt-1 text-xs text-slate-500">{t('contacts.phone_directory_hint')}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition active:scale-[0.98] hover:bg-blue-700 disabled:opacity-50"
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
