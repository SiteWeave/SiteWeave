import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Avatar from '../components/Avatar';
import PermissionGuard from '../components/PermissionGuard';
import DirectoryManagementModal from '../components/DirectoryManagementModal';
import RoleManagement from '../components/RoleManagement';
import packageJson from '../../package.json';
import { getStoredCalendarToken } from '../utils/calendarIntegration';
import { isModerationAdmin } from '@siteweave/core-logic';
import BlockedUsersPanel from '../components/moderation/BlockedUsersPanel';
import ContentReportsPanel from '../components/moderation/ContentReportsPanel';

function SettingsView() {
  const { t, i18n } = useTranslation();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showRoleManagement, setShowRoleManagement] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [appVersion, setAppVersion] = useState(packageJson.version);
  const [googleCalendarSynced, setGoogleCalendarSynced] = useState(false);
  const [outlookCalendarSynced, setOutlookCalendarSynced] = useState(false);
  const [isSavingOrgAssignmentEmail, setIsSavingOrgAssignmentEmail] = useState(false);

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
    setIsUpdating(true);

    try {
      const { error } = await supabaseClient.auth.updateUser({
        data: {
          full_name: fullName
        }
      });

      if (error) {
        addToast(t('toast.error_updating_profile', { message: error.message }), 'error');
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
      addToast(t('toast.error_updating_profile', { message: error.message }), 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      addToast(t('toast.new_passwords_do_not_match'), 'error');
      return;
    }

    if (newPassword.length < 6) {
      addToast(t('toast.password_min_length'), 'error');
      return;
    }

    setIsChangingPassword(true);

    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword
      });

      if (error) {
        addToast(t('toast.error_changing_password', { message: error.message }), 'error');
      } else {
        addToast(t('toast.password_changed_successfully'), 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error) {
      addToast(t('toast.error_changing_password', { message: error.message }), 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      addToast(t('toast.error_signing_out', { message: error.message }), 'error');
    } else {
      addToast(t('toast.signed_out_successfully'), 'success');
    }
  };

  const handleToggleDefaultAssignmentEmail = async (e) => {
    const checked = e.target.checked;
    const orgId = state.currentOrganization?.id;
    if (!orgId) return;
    setIsSavingOrgAssignmentEmail(true);
    try {
      const { error } = await supabaseClient
        .from('organizations')
        .update({ default_send_assignment_email: checked })
        .eq('id', orgId);
      if (error) {
        addToast(t('toast.error_updating_profile', { message: error.message }) || error.message, 'error');
        return;
      }
      dispatch({
        type: 'SET_ORGANIZATION',
        payload: { ...state.currentOrganization, default_send_assignment_email: checked },
      });
      addToast('Organization notification default saved.', 'success');
    } catch (err) {
      addToast(err?.message || 'Could not update setting', 'error');
    } finally {
      setIsSavingOrgAssignmentEmail(false);
    }
  };

  return (
    <div className="max-w-[95%] mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('settings.title')}</h1>
          <p className="text-gray-500">{t('settings.subtitle')}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Language selector */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('settings.language')}</h2>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">{t('settings.language')}</label>
            <select
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>

        {/* Organization Section */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('settings.organization')}</h2>
          <div className="space-y-3">
            {state.currentOrganization ? (
              <>
                <div>
                  <span className="text-sm text-gray-600">{t('settings.organization_label')}</span>
                  <p className="font-medium text-gray-900 mt-1">{state.currentOrganization.name}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">{t('settings.your_role')}</span>
                  <p className="font-medium text-gray-900 mt-1">{state.userRole?.name || t('settings.no_role_assigned')}</p>
                </div>
                <div className="pt-3 border-t border-gray-200 space-y-2">
                  <PermissionGuard permission="can_manage_users">
                    <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-2 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={state.currentOrganization?.default_send_assignment_email === true}
                        disabled={isSavingOrgAssignmentEmail}
                        onChange={handleToggleDefaultAssignmentEmail}
                      />
                      <span className="min-w-0 text-sm text-gray-700">
                        <span className="font-medium text-gray-900">Pre-check “Send email notification” on new tasks</span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          When creating a task, turn on the assignment email option by default for assignees who have an email. Assigners can still uncheck it before saving.
                        </span>
                      </span>
                    </label>
                  </PermissionGuard>
                  <PermissionGuard permission="can_manage_roles">
                    <button
                      onClick={() => setShowRoleManagement(true)}
                      className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                    >
                      {t('settings.manage_roles')}
                    </button>
                  </PermissionGuard>
                  <PermissionGuard permission="can_manage_users">
                    <button
                      onClick={() => setShowTeamModal(true)}
                      className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                    >
                      {t('settings.manage_team_members')}
                    </button>
                  </PermissionGuard>
                </div>
              </>
            ) : state.isProjectCollaborator ? (
              <>
                <div>
                  <span className="text-sm text-gray-600">{t('settings.access_type')}</span>
                  <p className="font-medium text-gray-900 mt-1">{t('settings.guest_collaborator')}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">{t('settings.projects_label')}</span>
                  <p className="font-medium text-gray-900 mt-1">
                    {state.collaborationProjects.length === 1 ? t('sidebar.projects_accessible', { count: 1 }) : t('sidebar.projects_accessible_plural', { count: state.collaborationProjects.length })}
                  </p>
                </div>
                <p className="text-xs text-gray-500 pt-2">
                  {t('settings.guest_access_message')}
                </p>
              </>
            ) : (
              <div>
                <p className="text-sm text-gray-500">{t('settings.no_organization_assigned')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Profile Settings */}
        <div 
          data-onboarding="profile-section"
          className="bg-white rounded-xl shadow-xs border border-gray-200 p-6"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-6">{t('settings.profile_information')}</h2>
          
          <div className="flex items-center gap-4 mb-6">
            <Avatar 
              name={state.user?.user_metadata?.full_name || state.user?.email} 
              size="xl"
            />
            <div>
              <h3 className="font-semibold text-gray-900">
                {state.user?.user_metadata?.full_name || state.user?.email}
              </h3>
              <p className="text-sm text-gray-500">{state.user?.email}</p>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('settings.full_name')}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('settings.enter_full_name')}
              />
            </div>

            <button
              type="submit"
              disabled={isUpdating}
              className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isUpdating ? (
                <>
                  <LoadingSpinner size="sm" text="" />
                  {t('settings.updating')}
                </>
              ) : (
                t('settings.update_profile')
              )}
            </button>
          </form>
        </div>

        {/* Security Settings */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">{t('settings.security')}</h2>
          
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('settings.new_password')}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('settings.enter_new_password')}
                minLength="6"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('settings.confirm_new_password')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('settings.confirm_new_password_placeholder')}
                minLength="6"
              />
            </div>

            <button
              type="submit"
              disabled={isChangingPassword || !newPassword || !confirmPassword}
              className="w-full px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isChangingPassword ? (
                <>
                  <LoadingSpinner size="sm" text="" />
                  {t('settings.changing')}
                </>
              ) : (
                t('settings.change_password')
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-3">{t('settings.account_actions')}</h3>
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('settings.sign_out')}
            </button>
          </div>
        </div>

        {/* Integrations */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">{t('settings.integrations')}</h2>
          
          {/* Calendar Integrations */}
          <div className="space-y-4 mb-6">
            {/* Google Calendar */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-gray-200">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{t('settings.google_calendar')}</h3>
                  <p className="text-xs text-gray-500">{t('settings.sync_google_calendar')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {googleCalendarSynced ? (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {t('settings.synced')}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                    {t('settings.not_connected')}
                  </span>
                )}
              </div>
            </div>

            {/* Outlook Calendar */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-gray-200">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V9H19V20Z" fill="#0078D4"/>
                    <path d="M7 11H9V13H7V11ZM11 11H13V13H11V11ZM15 11H17V13H15V11ZM7 15H9V17H7V15ZM11 15H13V17H11V15ZM15 15H17V17H15V15Z" fill="#0078D4"/>
                    <path d="M7 7H17V9H7V7Z" fill="#0078D4"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{t('settings.outlook_calendar')}</h3>
                  <p className="text-xs text-gray-500">{t('settings.sync_outlook_calendar')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {outlookCalendarSynced ? (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {t('settings.synced')}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                    {t('settings.not_connected')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* More Integrations */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">{t('settings.more_integrations_coming')}</p>
          </div>
        </div>
      </div>

      {/* Privacy & safety */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Privacy &amp; safety</h2>
          <p className="text-sm text-gray-500 mb-4">
            Manage blocked users and review reported content.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Blocked users</h3>
          <BlockedUsersPanel />
        </div>
        {isModerationAdmin(state.userRole?.name) && (
          <div className="pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Content reports</h3>
            <ContentReportsPanel />
          </div>
        )}
      </div>

      {/* App Information */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('settings.about_siteweave')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <div>
            <span className="font-medium">{t('common.version')}:</span> {appVersion}
          </div>
          <div>
            <span className="font-medium">{t('settings.user_id')}</span> {state.user?.id?.slice(0, 8)}...
          </div>
          <div>
            <span className="font-medium">{t('common.account_created')}:</span> {new Date(state.user?.created_at).toLocaleDateString(i18n.language)}
          </div>
        </div>
      </div>

      {/* Team Management Modal */}
      <DirectoryManagementModal 
        show={showTeamModal} 
        onClose={() => setShowTeamModal(false)} 
      />

      {/* Role Management Modal/View */}
      {showRoleManagement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{t('settings.role_management')}</h2>
              <button
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
