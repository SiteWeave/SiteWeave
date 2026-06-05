import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  prepareWebAvatarFile,
  uploadProfilePhoto,
  removeProfilePhoto,
  validateProfilePhotoFile,
  syncProfileAvatarToAppState,
} from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Avatar from './Avatar';

/**
 * Click the avatar to pick and upload a profile photo.
 */
export default function EditableProfileAvatar({
  name,
  size = 'xl',
  className = '',
  showRemoveLink = false,
  hintClassName = 'text-xs text-gray-500 mt-2',
}) {
  const { t } = useTranslation();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const inputId = useId();
  const inputRef = useRef(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [localUrl, setLocalUrl] = useState(null);

  const displayName = name || state.user?.user_metadata?.full_name || state.user?.email || t('common.user');
  const avatarUrl =
    localUrl
    ?? state.profileAvatarUrl
    ?? state.contacts?.find((c) => c.id === state.userContactId)?.avatar_url
    ?? state.user?.user_metadata?.avatar_url
    ?? null;

  useEffect(() => {
    setLocalUrl(null);
  }, [state.profileAvatarUrl, state.userContactId, state.contacts, state.user?.user_metadata?.avatar_url]);

  const syncAfterChange = async () => {
    const url = await syncProfileAvatarToAppState(supabaseClient, {
      userId: state.user.id,
      dispatch,
      contacts: state.contacts,
      userContactId: state.userContactId,
    });
    setLocalUrl(url);
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) dispatch({ type: 'SET_USER', payload: user });
    return url;
  };

  const openFilePicker = () => {
    if (!state.user?.id || isUpdating) return;
    inputRef.current?.click();
  };

  const handleFileSelected = async (event) => {
    const rawFile = event?.target?.files?.[0];
    event.target.value = '';
    if (!rawFile || !state.user?.id) return;

    try {
      setIsUpdating(true);
      validateProfilePhotoFile(rawFile);
      const prepared = await prepareWebAvatarFile(rawFile);
      validateProfilePhotoFile(prepared);
      const publicUrl = await uploadProfilePhoto(supabaseClient, {
        userId: state.user.id,
        file: prepared,
      });
      setLocalUrl(publicUrl);
      await syncAfterChange();
      addToast(t('toast.profile_updated_successfully'), 'success');
    } catch (error) {
      addToast(error?.message || t('toast.error_updating_profile', { message: 'Failed to update avatar' }), 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async () => {
    if (!state.user?.id || isUpdating || !avatarUrl) return;
    try {
      setIsUpdating(true);
      await removeProfilePhoto(supabaseClient, { userId: state.user.id });
      setLocalUrl(null);
      await syncAfterChange();
      addToast(t('toast.profile_updated_successfully'), 'success');
    } catch (error) {
      addToast(error?.message || t('toast.error_updating_profile', { message: 'Failed to remove avatar' }), 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={isUpdating}
        onChange={handleFileSelected}
      />
      <button
        type="button"
        onClick={openFilePicker}
        disabled={isUpdating || !state.user?.id}
        className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60"
        aria-label={t('settings.click_avatar_to_upload')}
        title={t('settings.click_avatar_to_upload')}
      >
        <Avatar name={displayName} avatarUrl={avatarUrl} size={size} />
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/35"
          aria-hidden
        >
          <span className="opacity-0 transition-opacity group-hover:opacity-100 text-white text-[10px] font-medium px-1 text-center leading-tight">
            {isUpdating ? t('settings.updating') : t('settings.change_photo_short')}
          </span>
        </span>
      </button>
      <p className={hintClassName}>{t('settings.click_avatar_to_upload')}</p>
      {showRemoveLink && avatarUrl ? (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isUpdating}
          className="mt-2 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
        >
          {t('settings.remove_photo')}
        </button>
      ) : null}
    </div>
  );
}
