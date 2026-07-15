import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EditableProfileAvatar from '../components/EditableProfileAvatar';
import PermissionGuard from '../components/PermissionGuard';
import ActivityHistoryPanel from '../components/ActivityHistoryPanel';
import RoleManagement from '../components/RoleManagement';
import packageJson from '../../package.json';
import { getStoredCalendarToken } from '../utils/calendarIntegration';
import { clearStaleSupabaseSession, canAccessContentReports } from '@siteweave/core-logic';
import ConfirmDialog from '../components/ConfirmDialog';
import BlockedUsersPanel from '../components/moderation/BlockedUsersPanel';
import ContentReportsPanel from '../components/moderation/ContentReportsPanel';
import FeedbackModal from '../components/FeedbackModal';
import {
  SettingsSection,
  SettingsField,
  settingsInputClassName,
  SettingsPrimaryButton,
  SettingsSecondaryButton,
  SettingsDangerButton,
} from '../components/settings/SettingsSection';
import { deleteAccount } from '../utils/deleteAccountService';
import { resetInviteBootstrapState } from '../utils/workspaceClient';
import { FieldError, fieldInputClassName } from '../components/FormAlert';

function SettingsView() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  
  const [showRoleManagement, setShowRoleManagement] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [appVersion, setAppVersion] = useState(packageJson.version);
  const [googleCalendarSynced, setGoogleCalendarSynced] = useState(false);
  const [outlookCalendarSynced, setOutlookCalendarSynced] = useState(false);
  const [isSavingOrgAssignmentEmail, setIsSavingOrgAssignmentEmail] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [deleteAccountError, setDeleteAccountError] = useState(null);
  const [orgSettingError, setOrgSettingError] = useState(null);
  const [signOutError, setSignOutError] = useState(null);

  // Form states
  const [fullName, setFullName] = useState(state.user?.user_metadata?.full_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Get app version dynamically
  useEffect(() => {
    const fetchVersion = async () => {
      // Try to get version from Electron API if available
      if (window.electronAPI?.getAppVersion) {
        try {
          const version = await window.electronAPI.getAppVersion();
          if (version) {
            setAppVersion(version);
            return;
          }
        } catch (error) {
          console.log('Could not get version from Electron API, using package.json version');
        }
      }
      // Fallback to package.json version
      setAppVersion(packageJson.version);
    };

    fetchVersion();
  }, []);

  // Check calendar sync status
  useEffect(() => {
    const checkCalendarSync = () => {
      const googleToken = getStoredCalendarToken('google');
      const outlookToken = getStoredCalendarToken('outlook');
      setGoogleCalendarSynced(!!googleToken);
      setOutlookCalendarSynced(!!outlookToken);
    };

    checkCalendarSync();
    // Check periodically in case sync status changes
    const interval = setInterval(checkCalendarSync, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileError(null);
    setIsUpdating(true);

    try {
      const { error } = await supabaseClient.auth.updateUser({
        data: {
          full_name: fullName
        }
      });

      if (error) {
        setProfileError(t('toast.error_updating_profile', { message: error.message }));
      } else {
        addToast(t('toast.profile_updated_successfully'), 'success');
        // Update the user in context
        dispatch({ 
          type: 'SET_USER', 
          payload: {
            ...state.user,
            user_metadata: {
              ...state.user.user_metadata,
              full_name: fullName
            }
          }
        });
      }
    } catch (error) {
      setProfileError(t('toast.error_updating_profile', { message: error.message }));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError(t('toast.new_passwords_do_not_match'));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError(t('toast.password_min_length'));
      return;
    }

    setIsChangingPassword(true);

    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword
      });

      if (error) {
        setPasswordError(t('toast.error_changing_password', { message: error.message }));
      } else {
        addToast(t('toast.password_changed_successfully'), 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error) {
      setPasswordError(t('toast.error_changing_password', { message: error.message }));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    setSignOutError(null);
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      await clearStaleSupabaseSession(supabaseClient);
    }
    dispatch({ type: 'SET_USER', payload: null });
    addToast(t('toast.signed_out_successfully'), 'success');
  };

  const confirmDeleteAccount = async () => {
    setShowDeleteAccountConfirm(false);
    setDeleteAccountError(null);
    setIsDeletingAccount(true);
    try {
      await deleteAccount(supabaseClient);
      resetInviteBootstrapState();
      dispatch({ type: 'SET_USER', payload: null });
      addToast(t('settings.account_deleted'), 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      setDeleteAccountError(err?.message || t('settings.delete_account_failed'));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleToggleDefaultAssignmentEmail = async (e) => {
    const checked = e.target.checked;
    const orgId = state.currentOrganization?.id;
    if (!orgId) return;
    setOrgSettingError(null);
    setIsSavingOrgAssignmentEmail(true);
    try {
      const { error } = await supabaseClient
        .from('organizations')
        .update({ default_send_assignment_email: checked })
        .eq('id', orgId);
      if (error) {
        setOrgSettingError(t('toast.error_updating_profile', { message: error.message }) || error.message);
        return;
      }
      dispatch({
        type: 'SET_ORGANIZATION',
        payload: { ...state.currentOrganization, default_send_assignment_email: checked },
      });
      addToast(t('settings.org_notification_saved'), 'success');
    } catch (err) {
      setOrgSettingError(err?.message || t('settings.could_not_update_setting'));
    } finally {
      setIsSavingOrgAssignmentEmail(false);
    }
  };

  const calendarStatusBadge = (synced) =>
    synced ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
        {t('settings.integrations_connected')}
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
        {t('settings.integrations_not_connected')}
      </span>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-32 min-h-min">
      <header className="pt-6 pb-2">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('settings.subtitle')}</p>
      </header>

      <div className="mt-6 bg-white rounded-lg border border-gray-200 shadow-xs px-6 sm:px-8">
        <SettingsSection
          title={t('settings.profile_information')}
          description={t('settings.profile_section_desc')}
        >
          <div data-onboarding="profile-section" className="space-y-6 max-w-xl">
            <SettingsField label={t('settings.profile_photo')}>
              <div className="flex items-start gap-4">
                <EditableProfileAvatar
                  name={state.user?.user_metadata?.full_name || state.user?.email}
                  size="xl"
                  hintClassName="sr-only"
                />
                <div className="pt-1">
                  <p className="text-sm font-medium text-gray-900">
                    {state.user?.user_metadata?.full_name?.trim() || state.user?.email}
                  </p>
                  {state.user?.user_metadata?.full_name?.trim() && state.user?.email ? (
                    <p className="text-sm text-gray-500">{state.user.email}</p>
                  ) : null}
                </div>
              </div>
            </SettingsField>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <SettingsField label={t('settings.full_name')}>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setProfileError(null);
                  }}
                  className={fieldInputClassName(
                    !!profileError,
                    settingsInputClassName(),
                  )}
                  placeholder={t('settings.enter_full_name')}
                  aria-invalid={!!profileError}
                />
              </SettingsField>
              <FieldError message={profileError} />
              <div className="pt-1">
                <SettingsPrimaryButton type="submit" disabled={isUpdating} className="gap-2">
                  {isUpdating ? (
                    <>
                      <LoadingSpinner size="sm" text="" />
                      {t('settings.updating')}
                    </>
                  ) : (
                    t('settings.update_profile')
                  )}
                </SettingsPrimaryButton>
              </div>
            </form>
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.security')}
          description={t('settings.security_section_desc')}
        >
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-xl">
            <SettingsField label={t('settings.new_password')}>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(null);
                }}
                className={fieldInputClassName(!!passwordError, settingsInputClassName())}
                placeholder={t('settings.enter_new_password')}
                minLength={6}
                autoComplete="new-password"
                aria-invalid={!!passwordError}
              />
            </SettingsField>
            <SettingsField label={t('settings.confirm_new_password')}>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError(null);
                }}
                className={fieldInputClassName(!!passwordError, settingsInputClassName())}
                placeholder={t('settings.confirm_new_password_placeholder')}
                minLength={6}
                autoComplete="new-password"
                aria-invalid={!!passwordError}
              />
            </SettingsField>
            <FieldError message={passwordError} />
            <div className="pt-1">
              <SettingsPrimaryButton
                type="submit"
                disabled={isChangingPassword || !newPassword || !confirmPassword}
                className="gap-2"
              >
                {isChangingPassword ? (
                  <>
                    <LoadingSpinner size="sm" text="" />
                    {t('settings.changing')}
                  </>
                ) : (
                  t('settings.change_password')
                )}
              </SettingsPrimaryButton>
            </div>
          </form>
        </SettingsSection>

        <SettingsSection
          title={t('settings.language')}
          description={t('settings.language_section_desc')}
        >
          <div className="max-w-sm">
            <select
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              aria-label={t('settings.language')}
              className={settingsInputClassName()}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.company')}
          description={t('settings.company_section_desc')}
        >
          <div className="space-y-4 max-w-xl">
            {state.currentOrganization ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SettingsField label={t('settings.organization_label').replace(':', '')}>
                    <p className="text-sm text-gray-900 py-2.5">{state.currentOrganization.name}</p>
                  </SettingsField>
                  <SettingsField label={t('settings.your_role').replace(':', '')}>
                    <p className="text-sm text-gray-900 py-2.5">{state.userRole?.name || t('settings.no_role_assigned')}</p>
                  </SettingsField>
                </div>
                <PermissionGuard permission="can_manage_users">
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-4 hover:bg-gray-50/80">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      checked={state.currentOrganization?.default_send_assignment_email === true}
                      disabled={isSavingOrgAssignmentEmail}
                      onChange={handleToggleDefaultAssignmentEmail}
                    />
                    <span className="min-w-0 text-sm text-gray-700">
                      <span className="font-medium text-gray-900">{t('settings.default_assignment_email_label')}</span>
                      <span className="mt-1 block text-xs text-gray-500">
                        {t('settings.default_assignment_email_desc')}
                      </span>
                    </span>
                  </label>
                  <FieldError message={orgSettingError} className="mt-2" />
                </PermissionGuard>
                <div className="flex flex-wrap gap-2">
                  <PermissionGuard permission="can_manage_roles">
                    <SettingsSecondaryButton type="button" onClick={() => setShowRoleManagement(true)}>
                      {t('settings.manage_roles').replace(' →', '')}
                    </SettingsSecondaryButton>
                  </PermissionGuard>
                  <SettingsSecondaryButton type="button" onClick={() => navigate('/organization')}>
                    {t('settings.manage_company_staff')}
                  </SettingsSecondaryButton>
                </div>
                <PermissionGuard permission="can_view_activity_history">
                  {state.currentOrganization?.id && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <ActivityHistoryPanel
                        mode="organization"
                        organizationId={state.currentOrganization.id}
                      />
                    </div>
                  )}
                </PermissionGuard>
              </>
            ) : state.isProjectCollaborator ? (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="text-gray-500">{t('settings.access_type')}</span>{' '}
                  <span className="font-medium text-gray-900">{t('settings.guest_collaborator')}</span>
                </p>
                <p>
                  <span className="text-gray-500">{t('settings.projects_label')}</span>{' '}
                  <span className="font-medium text-gray-900">
                    {state.collaborationProjects.length === 1
                      ? t('sidebar.projects_accessible', { count: 1 })
                      : t('sidebar.projects_accessible_plural', { count: state.collaborationProjects.length })}
                  </span>
                </p>
                <p className="text-gray-500">{t('settings.guest_access_message')}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t('settings.no_organization_assigned')}</p>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.integrations')}
          description={t('settings.integrations_section_desc')}
        >
          <p className="text-xs text-gray-500 mb-4 max-w-xl">{t('settings.integrations_status_note')}</p>
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-md border border-gray-200 flex items-center justify-center bg-white">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t('settings.google_calendar')}</p>
                  <p className="text-xs text-gray-500 truncate">{t('settings.sync_google_calendar')}</p>
                </div>
              </div>
              {calendarStatusBadge(googleCalendarSynced)}
            </div>
            <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-md border border-gray-200 flex items-center justify-center bg-white">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M19 4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V9H19V20Z" fill="#0078D4"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t('settings.outlook_calendar')}</p>
                  <p className="text-xs text-gray-500 truncate">{t('settings.sync_outlook_calendar')}</p>
                </div>
              </div>
              {calendarStatusBadge(outlookCalendarSynced)}
            </div>
            <p className="text-xs text-gray-500 pt-1">{t('settings.more_integrations_coming')}</p>
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.feedback')}
          description={t('settings.feedback_description')}
        >
          <SettingsSecondaryButton type="button" onClick={() => setShowFeedbackModal(true)}>
            {t('settings.send_feedback')}
          </SettingsSecondaryButton>
        </SettingsSection>

        <SettingsSection
          title={t('settings.account_actions')}
          description={t('settings.session_section_desc')}
          className="last:border-b-0"
        >
          <div className="flex flex-col gap-4 max-w-xl">
            <FieldError message={signOutError} />
            <SettingsDangerButton type="button" onClick={handleSignOut} className="gap-2 w-fit">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('settings.sign_out')}
            </SettingsDangerButton>
            <div className="pt-4 border-t border-red-100">
              <p className="text-sm text-gray-600 mb-3">{t('settings.delete_account_desc')}</p>
              <FieldError message={deleteAccountError} className="mb-3" />
              <button
                type="button"
                onClick={() => setShowDeleteAccountConfirm(true)}
                disabled={isDeletingAccount}
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed gap-2"
              >
                {isDeletingAccount ? t('settings.delete_account_deleting') : t('settings.delete_account')}
              </button>
            </div>
          </div>
        </SettingsSection>
      </div>

      <div className="mt-8 mb-8 bg-white rounded-lg border border-gray-200 shadow-xs px-6 sm:px-8">
        <SettingsSection title={t('settings.privacy_safety')} description={t('settings.privacy_section_desc')}>
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">{t('settings.blocked_users')}</h3>
              <BlockedUsersPanel />
            </div>
            {canAccessContentReports({ is_super_admin: state.isPlatformDeveloper }) && (
              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-3">{t('settings.content_reports')}</h3>
                <ContentReportsPanel />
              </div>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.about_siteweave')}
          description={t('settings.about_section_desc')}
          className="last:border-b-0"
        >
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl text-sm">
            <div>
              <dt className="text-gray-500">{t('common.version')}</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{appVersion}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('settings.user_id').replace(':', '')}</dt>
              <dd className="mt-0.5 font-medium text-gray-900 font-mono text-xs">{state.user?.id?.slice(0, 8)}...</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('common.account_created')}</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {new Date(state.user?.created_at).toLocaleDateString(i18n.language)}
              </dd>
            </div>
          </dl>
        </SettingsSection>
      </div>

      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />

      {/* Role Management Modal/View */}
      <ConfirmDialog
        isOpen={showDeleteAccountConfirm}
        onClose={() => setShowDeleteAccountConfirm(false)}
        onConfirm={confirmDeleteAccount}
        title={t('settings.delete_account')}
        message={t('settings.delete_account_confirm')}
        confirmText={t('settings.delete_account')}
        cancelText={t('common.cancel')}
      />

      {showRoleManagement && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center overflow-y-auto py-8 z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[min(90dvh,90vh)] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{t('settings.role_management')}</h2>
              <button type="button"
                onClick={() => setShowRoleManagement(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={t('common.close')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <RoleManagement />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsView;
