import { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { uploadProfilePhoto, removeProfilePhoto, validateProfilePhotoFile } from '@siteweave/core-logic';
import { useAuth } from '../context/AuthContext';
import { uriToUploadPayload } from '../utils/imageUpload';
import { prepareMobileAvatarUri } from '../utils/prepareAvatarImage';
import { useHaptics } from './useHaptics';

export function useProfileAvatarPicker() {
  const { t } = useTranslation();
  const { user, supabase, profileAvatarUrl, refreshProfileAvatar } = useAuth();
  const haptics = useHaptics();
  const [avatarLoading, setAvatarLoading] = useState(false);

  const pickAvatar = async () => {
    if (!user || !supabase || avatarLoading) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Photo permission is required to upload a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType?.Images
          ? [ImagePicker.MediaType.Images]
          : (ImagePicker.MediaTypeOptions?.Images ?? ['images']),
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.length) return;

      haptics.medium();
      const asset = result.assets[0];
      const prepared = await prepareMobileAvatarUri(asset.uri);
      const uploadFile = await uriToUploadPayload(prepared.uri, {
        mimeType: prepared.mimeType,
        fileName: `avatar-${Date.now()}.jpg`,
      });
      validateProfilePhotoFile({ type: uploadFile.type, size: uploadFile.size || asset.fileSize || 0 });

      setAvatarLoading(true);
      await uploadProfilePhoto(supabase, { userId: user.id, file: uploadFile });
      await refreshProfileAvatar();
      haptics.success();
    } catch (error) {
      console.error('Error updating profile photo:', error);
      haptics.error();
      Alert.alert('Error', error?.message || 'Failed to update profile photo.');
    } finally {
      setAvatarLoading(false);
    }
  };

  const removeAvatar = async () => {
    if (!user || !supabase || avatarLoading || !profileAvatarUrl) return;

    Alert.alert('Remove photo', 'Remove your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setAvatarLoading(true);
            haptics.medium();
            await removeProfilePhoto(supabase, { userId: user.id });
            await refreshProfileAvatar();
            haptics.success();
          } catch (error) {
            console.error('Error removing profile photo:', error);
            haptics.error();
            Alert.alert('Error', error?.message || 'Failed to remove profile photo.');
          } finally {
            setAvatarLoading(false);
          }
        },
      },
    ]);
  };

  const onAvatarPress = () => {
    if (avatarLoading) return;

    const options = profileAvatarUrl
      ? [
          { text: t('settings.change_photo_short'), onPress: pickAvatar },
          { text: t('settings.remove_photo'), style: 'destructive', onPress: removeAvatar },
          { text: t('common.cancel'), style: 'cancel' },
        ]
      : [
          { text: t('settings.change_photo_short'), onPress: pickAvatar },
          { text: t('common.cancel'), style: 'cancel' },
        ];

    Alert.alert(t('settings.profile_photo'), undefined, options);
  };

  return {
    avatarLoading,
    onAvatarPress,
    pickAvatar,
    removeAvatar,
  };
}
