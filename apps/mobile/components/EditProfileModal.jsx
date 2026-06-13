import { View, Text, StyleSheet, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, Animated, Dimensions } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadProfilePhoto, removeProfilePhoto, validateProfilePhotoFile } from '@siteweave/core-logic';
import { uriToUploadPayload } from '../utils/imageUpload';
import { prepareMobileAvatarUri } from '../utils/prepareAvatarImage';
import Avatar from './ui/Avatar';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function EditProfileModal({ visible, onClose, onProfileUpdated }) {
  const { user, supabase, profileAvatarUrl, refreshProfileAvatar } = useAuth();
  const [fullName, setFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  
  const modalTranslateY = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible && user) {
      setFullName(user?.user_metadata?.full_name || '');
      setNewPassword('');
      setConfirmPassword('');
      setAvatarUrl(profileAvatarUrl || user?.user_metadata?.avatar_url || null);
    }
  }, [visible, user, profileAvatarUrl]);

  useEffect(() => {
    if (visible) {
      modalTranslateY.setValue(1);
      requestAnimationFrame(() => {
        Animated.timing(modalTranslateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    } else {
      modalTranslateY.setValue(1);
    }
  }, [visible, modalTranslateY]);

  const handleSave = async () => {
    if (!user || !supabase) return;

    try {
      setLoading(true);
      
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim() || null,
        }
      });

      if (error) {
        console.error('Error updating profile:', error);
        alert('Failed to update profile. Please try again.');
        return;
      }

      // Refresh user data
      const { data: { user: updatedUser } } = await supabase.auth.getUser();
      
      onProfileUpdated?.(updatedUser);
      alert('Profile updated successfully!');
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getDisplayName = () => {
    if (fullName?.trim()) return fullName.trim();
    if (user?.user_metadata?.full_name?.trim()) return user.user_metadata.full_name.trim();
    if (user?.email) return user.email;
    return 'User';
  };

  const handlePickAvatar = async () => {
    if (!user || !supabase || avatarLoading) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        alert('Photo permission is required to upload a profile picture.');
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
      const asset = result.assets[0];
      const prepared = await prepareMobileAvatarUri(asset.uri);
      const uploadFile = await uriToUploadPayload(prepared.uri, {
        mimeType: prepared.mimeType,
        fileName: `avatar-${Date.now()}.jpg`,
      });
      validateProfilePhotoFile({ type: uploadFile.type, size: uploadFile.size || asset.fileSize || 0 });

      setAvatarLoading(true);
      const publicUrl = await uploadProfilePhoto(supabase, { userId: user.id, file: uploadFile });
      setAvatarUrl(publicUrl);
      await refreshProfileAvatar();
      const { data: { user: updatedUser } } = await supabase.auth.getUser();
      onProfileUpdated?.(updatedUser);
      alert('Profile photo updated successfully.');
    } catch (error) {
      console.error('Error updating profile photo:', error);
      alert(error?.message || 'Failed to update profile photo.');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || !supabase || avatarLoading) return;
    try {
      setAvatarLoading(true);
      await removeProfilePhoto(supabase, { userId: user.id });
      setAvatarUrl(null);
      await refreshProfileAvatar();
      const { data: { user: updatedUser } } = await supabase.auth.getUser();
      onProfileUpdated?.(updatedUser);
      alert('Profile photo removed.');
    } catch (error) {
      console.error('Error removing profile photo:', error);
      alert(error?.message || 'Failed to remove profile photo.');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user || !supabase) return;

    if (newPassword !== confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    try {
      setChangingPassword(true);
      
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        console.error('Error changing password:', error);
        alert('Failed to change password. Please try again.');
        return;
      }

      alert('Password changed successfully!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      alert('Failed to change password. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        <ModalScrim onPress={onClose} opacity={0.5} />
        
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Animated.View 
            style={[
              styles.modalContentWrapper,
              {
                transform: [{ translateY: modalTranslateY.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, SCREEN_HEIGHT],
                }) }],
              }
            ]}
          >
        <View style={[styles.modalContent, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <PressableWithFade
              style={styles.closeButton}
              onPress={handleClose}
              disabled={loading}
            >
              <Ionicons name="close" size={24} color="#111827" />
            </PressableWithFade>
          </View>

          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formGroup}>
              <Text style={styles.label}>Profile Photo</Text>
              <View style={styles.avatarRow}>
                <Avatar name={getDisplayName()} avatarUrl={avatarUrl} size="xl" />
                <View style={styles.avatarActions}>
                  <PressableWithFade
                    style={[styles.avatarActionButton, avatarLoading && styles.avatarActionButtonDisabled]}
                    onPress={handlePickAvatar}
                    disabled={avatarLoading || loading || changingPassword}
                  >
                    <Text style={styles.avatarActionButtonText}>
                      {avatarLoading ? 'Uploading...' : avatarUrl ? 'Change Photo' : 'Upload Photo'}
                    </Text>
                  </PressableWithFade>
                  {avatarUrl ? (
                    <PressableWithFade
                      style={[styles.avatarRemoveButton, avatarLoading && styles.avatarActionButtonDisabled]}
                      onPress={handleRemoveAvatar}
                      disabled={avatarLoading || loading || changingPassword}
                    >
                      <Text style={styles.avatarRemoveButtonText}>Remove</Text>
                    </PressableWithFade>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor="#9CA3AF"
                editable={!loading && !changingPassword}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={user?.email || ''}
                placeholder="Email"
                placeholderTextColor="#9CA3AF"
                editable={false}
              />
              <Text style={styles.helperText}>
                Email cannot be changed. Contact support if you need to update your email.
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.formGroup}>
              <Text style={styles.sectionTitle}>Change Password</Text>
              <View style={styles.formGroup}>
                <Text style={styles.label}>New Password</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={true}
                  editable={!loading && !changingPassword}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Confirm New Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={true}
                  editable={!loading && !changingPassword}
                />
              </View>

              <PressableWithFade
                style={[
                  styles.passwordButton,
                  (!newPassword || !confirmPassword || changingPassword) && styles.passwordButtonDisabled
                ]}
                onPress={handleChangePassword}
                disabled={!newPassword || !confirmPassword || changingPassword}
              >
                <Text style={styles.passwordButtonText}>
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </Text>
              </PressableWithFade>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <PressableWithFade
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </PressableWithFade>
            <PressableWithFade
              style={[
                styles.button,
                styles.saveButton,
                loading && styles.saveButtonDisabled
              ]}
              onPress={handleSave}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>
                {loading ? 'Saving...' : 'Save'}
              </Text>
            </PressableWithFade>
          </View>
        </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalOverlay: {
    flex: 1,
  },
  modalContentWrapper: {
    flex: 1,
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  formContent: {
    padding: 20,
    flexGrow: 1,
  },
  formGroup: {
    marginBottom: 24,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E5E7EB',
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
  },
  avatarActions: {
    flex: 1,
    gap: 8,
  },
  avatarActionButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarRemoveButton: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRemoveButtonText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
  },
  avatarActionButtonDisabled: {
    opacity: 0.55,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
    minHeight: 44,
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  passwordButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 8,
  },
  passwordButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.5,
  },
  passwordButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    flex: 0,
    paddingHorizontal: 20,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    flex: 0,
    paddingHorizontal: 25,
    minWidth: 110,
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

