import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  Alert,
  ScrollView,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';
import ExperienceModeToggle from './ExperienceModeToggle';
import { useMobileExperience } from '../context/MobileExperienceContext';
import Avatar from './ui/Avatar';
import { useHaptics } from '../hooks/useHaptics';
import { useProfileAvatarPicker } from '../hooks/useProfileAvatarPicker';
import { useRouter } from 'expo-router';
import { colors, spacing, touch } from '../theme';
import { sheetBottomPadding } from '../utils/layoutInsets';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ProfileDrawer({ visible, onClose }) {
  const { t } = useTranslation();
  const { user, signOut, deleteAccount, profileAvatarUrl } = useAuth();
  const { mode, canSwitchView, setMode } = useMobileExperience();
  const nativeUiReadyRef = useRef(null);

  const resolveNativeUiReady = useCallback(() => {
    const resolve = nativeUiReadyRef.current;
    if (!resolve) return;
    nativeUiReadyRef.current = null;
    InteractionManager.runAfterInteractions(resolve);
  }, []);

  const closeBeforeNativeUi = useCallback(
    () =>
      new Promise((resolve) => {
        nativeUiReadyRef.current = resolve;
        onClose();
      }),
    [onClose],
  );

  const { onAvatarPress, avatarLoading } = useProfileAvatarPicker({
    beforeNativeUi: closeBeforeNativeUi,
  });
  const haptics = useHaptics();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const insets = useSafeAreaInsets();

  const drawerTranslateY = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      haptics.light();
      drawerTranslateY.setValue(1);
      requestAnimationFrame(() => {
        Animated.timing(drawerTranslateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    } else {
      drawerTranslateY.setValue(1);
      resolveNativeUiReady();
    }
  }, [visible, drawerTranslateY, haptics, resolveNativeUiReady]);

  const handleSignOut = async () => {
    try {
      haptics.medium();
      await signOut();
      haptics.success();
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
      haptics.error();
    }
  };

  const handleDeleteAccount = () => {
    haptics.heavy();
    Alert.alert(
      t('mobile.delete_account'),
      t('mobile.delete_account_confirm'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
          onPress: () => haptics.light(),
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ],
    );
  };

  const confirmDeleteAccount = async () => {
    try {
      haptics.heavy();
      setDeleting(true);
      await deleteAccount();
      haptics.success();
      onClose();
      router.replace('/(auth)');
      Alert.alert(t('mobile.account_deleted'), t('mobile.account_deleted_message'));
    } catch (error) {
      console.error('Error deleting account:', error);
      haptics.error();
      Alert.alert(t('common.error'), error.message || t('mobile.delete_account_failed'));
    } finally {
      setDeleting(false);
    }
  };

  const getUserName = () => {
    const fullName = user?.user_metadata?.full_name?.trim();
    if (fullName) return fullName;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const getUserEmail = () => user?.email || '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={resolveNativeUiReady}
    >
      <View style={styles.modalContainer}>
        <ModalScrim onPress={onClose} opacity={0.5} />

        <View style={[styles.drawerWrapper, { paddingTop: insets.top }]}>
          <Animated.View
            style={[
              styles.drawerContainer,
              {
                paddingBottom: sheetBottomPadding(insets),
                transform: [
                  {
                    translateY: drawerTranslateY.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, SCREEN_HEIGHT],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.drawer}>
              <View style={styles.header}>
                <View style={styles.profileHeader}>
                  <PressableWithFade
                    style={styles.avatarButton}
                    onPress={onAvatarPress}
                    disabled={deleting || avatarLoading}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.click_avatar_to_upload')}
                    testID="profile-avatar-button"
                  >
                    <View style={styles.avatarWrap}>
                      <Avatar name={getUserName()} avatarUrl={profileAvatarUrl} size="lg" />
                      <View style={styles.avatarBadge}>
                        {avatarLoading ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <Ionicons name="camera" size={14} color={colors.white} />
                        )}
                      </View>
                    </View>
                  </PressableWithFade>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName} numberOfLines={2}>
                      {getUserName()}
                    </Text>
                    {getUserEmail() ? (
                      <Text style={styles.profileEmail} numberOfLines={1}>
                        {getUserEmail()}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <PressableWithFade
                  onPress={() => {
                    haptics.light();
                    onClose();
                  }}
                  style={styles.closeButton}
                  hapticType="light"
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                >
                  <Ionicons name="close" size={24} color={colors.text} />
                </PressableWithFade>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <ExperienceModeToggle mode={mode} canSwitchView={canSwitchView} onChange={setMode} />

                <View style={styles.menu}>
                  <PressableWithFade
                    style={styles.menuItem}
                    onPress={handleSignOut}
                    disabled={deleting}
                    hapticType="medium"
                    testID="profile-sign-out"
                  >
                    <Ionicons name="log-out-outline" size={24} color={colors.text} />
                    <Text style={styles.menuItemText}>{t('mobile.sign_out')}</Text>
                  </PressableWithFade>

                  <View style={styles.divider} />

                  <PressableWithFade
                    style={styles.menuItem}
                    onPress={handleDeleteAccount}
                    disabled={deleting}
                    hapticType="heavy"
                    testID="profile-delete-account"
                  >
                    <Ionicons name="trash-outline" size={24} color={colors.error} />
                    <Text style={[styles.menuItemText, styles.deleteAccountText]}>
                      {deleting ? t('mobile.deleting_account') : t('mobile.delete_account')}
                    </Text>
                  </PressableWithFade>
                </View>
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    position: 'relative',
  },
  drawerWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  drawerContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    minHeight: '54%',
  },
  drawer: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  profileHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  avatarButton: {
    flexShrink: 0,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  closeButton: {
    flexShrink: 0,
    padding: spacing.xs,
    minWidth: touch.minSize,
    minHeight: touch.minSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    minHeight: touch.minRowHeight,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  deleteAccountText: {
    color: colors.error,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
});
