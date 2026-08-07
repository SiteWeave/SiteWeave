import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import {
  CUSTOM_TRADE_VALUE,
  buildTradeSelectOptions,
  normalizeAssigneePhone,
} from '@siteweave/core-logic';
import { getContactIdentityError, normalizeContactFields } from '../utils/contactValidation';
import { getAssignableOrgRoles } from '../utils/roleManagementService';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from './LoadingSpinner';
import { FieldError, fieldInputClassName } from './FormAlert';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';
import SmsConsentActions from './SmsConsentActions';
import { resolveContactSmsConsent, loadSmsConsentByPhones } from '../utils/smsWebConsent';

const TRADE_I18N_KEYS = {
  Plumbing: 'contacts.trade_plumbing',
  Electrical: 'contacts.trade_electrical',
  Framing: 'contacts.trade_framing',
  Civil: 'contacts.trade_civil',
  Landscaping: 'contacts.trade_landscaping',
};

function initialTradeSelection(contactTrade) {
  const existing = typeof contactTrade === 'string' ? contactTrade.trim() : '';
  if (!existing || existing === 'Internal') {
    return { select: '', custom: '' };
  }
  return { select: existing, custom: '' };
}

function AddContactModal({
  onClose,
  onSave,
  contact = null,
  isLoading = false,
  currentOrganization = null,
  contactMode = 'both',
  existingTrades = [],
}) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const { addToast } = useToast();
  const isEditMode = !!contact;
  const lockedType = contactMode === 'staff' ? 'Team' : contactMode === 'trade_partner' ? 'Subcontractor' : null;
  const canManageTeam = state.userRole?.permissions?.can_manage_team === true;

  const [name, setName] = useState(contact?.name || '');
  const [type, setType] = useState(lockedType || contact?.type || 'Subcontractor');
  const [company, setCompany] = useState(contact?.company || '');
  const [tradeSelect, setTradeSelect] = useState(() => initialTradeSelection(contact?.trade).select);
  const [customTrade, setCustomTrade] = useState(() => initialTradeSelection(contact?.trade).custom);
  const [email, setEmail] = useState(contact?.email || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [linkedProfile, setLinkedProfile] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [roleError, setRoleError] = useState('');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: '', phone: '' });
  const [isCheckingIdentity, setIsCheckingIdentity] = useState(false);
  const [smsConsentStatus, setSmsConsentStatus] = useState(null);

  const phoneNormalized = useMemo(
    () => normalizeAssigneePhone(phone, { defaultRegion: 'US' }),
    [phone],
  );

  const tradeOptions = useMemo(() => {
    const values = buildTradeSelectOptions({
      existingTrades,
      currentTrade: tradeSelect !== CUSTOM_TRADE_VALUE ? tradeSelect : customTrade,
    });
    return values.map((value) => ({
      value,
      label: TRADE_I18N_KEYS[value] ? t(TRADE_I18N_KEYS[value]) : value,
    }));
  }, [existingTrades, tradeSelect, customTrade, t]);

  const isCustomTrade = tradeSelect === CUSTOM_TRADE_VALUE;
  const resolvedTrade = isCustomTrade
    ? customTrade.trim()
    : (typeof tradeSelect === 'string' ? tradeSelect.trim() : '');

  const linkedAppRoleName = linkedProfile?.roleName ?? null;
  const canEditAppRole = Boolean(
    isEditMode
    && linkedProfile?.id
    && canManageTeam
    && linkedProfile.roleName !== 'Org Admin'
    && linkedProfile.id !== state.user?.id,
  );

  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) {
      setLinkedProfile(null);
      setSelectedRoleId('');
      return undefined;
    }

    let cancelled = false;

    (async () => {
      let profileRow = null;

      if (contact?.id) {
        const { data } = await supabaseClient
          .from('profiles')
          .select('id, role_id, roles(id, name)')
          .eq('contact_id', contact.id)
          .eq('organization_id', orgId)
          .maybeSingle();
        profileRow = data;
      }

      if (!profileRow) {
        const normalizedEmail = email?.trim()?.toLowerCase();
        if (!normalizedEmail) {
          if (!cancelled) {
            setLinkedProfile(null);
            setSelectedRoleId('');
          }
          return;
        }

        const { data: contactRow } = await supabaseClient
          .from('contacts')
          .select('id')
          .eq('organization_id', orgId)
          .ilike('email', normalizedEmail)
          .maybeSingle();

        if (!contactRow?.id) {
          if (!cancelled) {
            setLinkedProfile(null);
            setSelectedRoleId('');
          }
          return;
        }

        const { data } = await supabaseClient
          .from('profiles')
          .select('id, role_id, roles(id, name)')
          .eq('contact_id', contactRow.id)
          .eq('organization_id', orgId)
          .maybeSingle();
        profileRow = data;
      }

      if (cancelled) return;

      if (!profileRow?.id) {
        setLinkedProfile(null);
        setSelectedRoleId('');
        return;
      }

      const next = {
        id: profileRow.id,
        roleId: profileRow.role_id || '',
        roleName: profileRow.roles?.name ?? null,
      };
      setLinkedProfile(next);
      setSelectedRoleId(next.roleId);
    })();

    return () => { cancelled = true; };
  }, [contact?.id, email, currentOrganization?.id]);

  useEffect(() => {
    if (!canEditAppRole || !currentOrganization?.id) {
      setAssignableRoles([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const roles = await getAssignableOrgRoles(supabaseClient, currentOrganization.id);
        if (!cancelled) setAssignableRoles(roles || []);
      } catch (error) {
        console.error('Error loading assignable roles:', error);
        if (!cancelled) setAssignableRoles([]);
      }
    })();

    return () => { cancelled = true; };
  }, [canEditAppRole, currentOrganization?.id]);

  useEffect(() => {
    if (contact) {
      setName(contact.name || '');
      setType(lockedType || contact.type || 'Subcontractor');
      setCompany(contact.company || '');
      const nextTrade = initialTradeSelection(contact.trade);
      setTradeSelect(nextTrade.select);
      setCustomTrade(nextTrade.custom);
      setEmail(contact.email || '');
      setPhone(contact.phone || '');
      setRoleError('');
    }
  }, [contact, lockedType]);

  useEffect(() => {
    if (!contact?.phone) {
      setSmsConsentStatus(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const map = await loadSmsConsentByPhones(supabaseClient, [contact]);
      if (!cancelled) {
        setSmsConsentStatus(resolveContactSmsConsent(contact, map));
      }
    })();
    return () => { cancelled = true; };
  }, [contact]);

  const effectiveType = lockedType || type;
  const isStaff = effectiveType === 'Team';

  const updateLinkedProfileRole = async () => {
    if (!canEditAppRole || !linkedProfile?.id) return true;
    if (!selectedRoleId) {
      setRoleError(t('team.select_role_error'));
      return false;
    }
    if (selectedRoleId === linkedProfile.roleId) return true;

    setIsUpdatingRole(true);
    setRoleError('');
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        setRoleError(t('team.not_authenticated'));
        return false;
      }

      const response = await fetch(
        `${supabaseClient.supabaseUrl}/functions/v1/team-update-role`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: linkedProfile.id,
            organizationId: currentOrganization.id,
            roleId: selectedRoleId,
          }),
        },
      );

      const result = await response.json();
      if (!result.success) {
        setRoleError(result.error || t('team.failed_update_role'));
        return false;
      }

      const nextRoleName = assignableRoles.find((r) => r.id === selectedRoleId)?.name
        || linkedProfile.roleName;
      setLinkedProfile((prev) => (prev ? {
        ...prev,
        roleId: selectedRoleId,
        roleName: nextRoleName,
      } : prev));
      addToast(t('team.role_updated_member'), 'success');
      return true;
    } catch (error) {
      console.error('Error updating role:', error);
      setRoleError(t('team.failed_update_role'));
      return false;
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({ email: '', phone: '' });
    setRoleError('');

    const normalized = normalizeContactFields({ email, phone });
    const contactData = {
      name,
      role: null,
      type: effectiveType,
      company: effectiveType === 'Subcontractor' ? company : 'SiteWeave',
      trade: effectiveType === 'Subcontractor' ? (resolvedTrade || null) : 'Internal',
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

    const roleOk = await updateLinkedProfileRole();
    if (!roleOk) return;

    onSave(contactData);
  };

  const isSubmitting = isLoading || isCheckingIdentity || isUpdatingRole;

  const titleKey = isEditMode
    ? (isStaff ? 'contacts.edit_staff_title' : 'contacts.edit_title')
    : (isStaff ? 'contacts.add_staff_title' : 'contacts.add_trade_partner_title');

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30';
  const labelClass = 'mb-1 block text-sm font-semibold text-slate-800';

  return (
    <ModalOverlay onClose={onClose}>
      <div className={`w-full max-w-lg ${MODAL_PANEL_MAX_H} overflow-y-auto rounded-xl bg-white p-6 shadow-xl ring-1 ring-slate-200/80`}>
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
                <label className={labelClass} htmlFor="contact-trade-select">
                  {t('contacts.trade_select_optional')}
                </label>
                <select
                  id="contact-trade-select"
                  value={tradeSelect}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTradeSelect(next);
                    if (next !== CUSTOM_TRADE_VALUE) {
                      setCustomTrade('');
                    }
                  }}
                  className={`${inputClass} bg-white`}
                >
                  <option value="">{t('contacts.trade_select_placeholder')}</option>
                  {tradeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                  <option value={CUSTOM_TRADE_VALUE}>{t('contacts.trade_custom_option')}</option>
                </select>
                {isCustomTrade && (
                  <div className="mt-3">
                    <label className={labelClass} htmlFor="contact-trade-custom">
                      {t('contacts.trade_custom_label')}
                    </label>
                    <input
                      id="contact-trade-custom"
                      type="text"
                      value={customTrade}
                      onChange={(e) => setCustomTrade(e.target.value)}
                      placeholder={t('contacts.trade_custom_placeholder')}
                      className={inputClass}
                      maxLength={80}
                      autoFocus
                    />
                  </div>
                )}
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
                {!canEditAppRole && linkedAppRoleName && (
                  <p className="mt-1 text-xs text-blue-800">
                    {t('share.org_app_role', { role: linkedAppRoleName })}
                  </p>
                )}
                {isStaff && !linkedAppRoleName && email?.trim() && currentOrganization?.id && (
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
                {(effectiveType === 'Subcontractor' || isStaff) && phoneNormalized.isValid && (
                  <p className="mt-1 text-xs text-slate-500">{t('contacts.phone_directory_hint')}</p>
                )}
                {phoneNormalized.isValid && currentOrganization?.id && (
                  <SmsConsentActions
                    supabaseClient={supabaseClient}
                    organizationId={currentOrganization.id}
                    phone={phone}
                    contactId={isEditMode ? contact?.id : null}
                    smsConsentStatus={smsConsentStatus}
                    onConsentStatusChange={setSmsConsentStatus}
                  />
                )}
              </div>
            </div>
          </div>

          {canEditAppRole && (
            <div>
              <label className={labelClass} htmlFor="contact-app-role">
                {t('team.select_role')}
              </label>
              <select
                id="contact-app-role"
                value={selectedRoleId}
                onChange={(e) => {
                  setSelectedRoleId(e.target.value);
                  if (roleError) setRoleError('');
                }}
                className={`${inputClass} bg-white`}
              >
                <option value="">{t('team.select_role')}</option>
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">{t('team.app_permissions_role_hint')}</p>
              <FieldError message={roleError} />
            </div>
          )}

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
              className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-xs app-action-primary disabled:opacity-50"
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
    </ModalOverlay>
  );
}

export default AddContactModal;
