import { View, Text, StyleSheet, Modal, Animated, Dimensions, Alert } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';
import EditProfileModal from './EditProfileModal';
import FeedbackModal from './FeedbackModal';
import Avatar from './ui/Avatar';
import { useHaptics } from '../hooks/useHaptics';
import { useRouter } from 'expo-router';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ProfileDrawer({ visible, onClose }) {
  const { t } = useTranslation();
  const { user, signOut, deleteAccount, supabase, profileAvatarUrl } = useAuth();
  const haptics = useHaptics();
  const router = useRouter();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user || !supabase) {
      setIsAdmin(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      
      if (!error && data) {
        setIsAdmin(data.role === 'Admin');
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    }
  };
  
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
    }
  }, [visible, drawerTranslateY]);

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
      ]
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
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    if (user?.email) {
      return user.email;
    }
    return 'User';
  };

  const getUserEmail = () => {
    return user?.email || '';
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <ModalScrim onPress={onClose} opacity={0.5} />
        
        {/* Drawer - only slides, doesn't fade */}
        <View style={[styles.drawerWrapper, { paddingTop: insets.top }]}>
          <Animated.View 
            style={[
              styles.drawerContainer, 
              { 
                paddingBottom: insets.bottom,
                transform: [{ translateY: drawerTranslateY.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, SCREEN_HEIGHT], // Slide from off-screen bottom
                }) }],
              }
            ]}
          >
            <View style={styles.drawer}>
              <View style={styles.header}>
                <View style={styles.profileSection}>
                  <Avatar name={getUserName()} avatarUrl={profileAvatarUrl} size="lg" />
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{getUserName()}</Text>
                    {getUserEmail() && (
                      <Text style={styles.profileEmail}>{getUserEmail()}</Text>
                    )}
                  </View>
                </View>
                <PressableWithFade 
                  onPress={() => {
                    haptics.light();
                    onClose();
                  }} 
                  style={styles.closeButton}
                  hapticType="light"
                >
                  <Ionicons name="close" size={24} color="#111827" />
                </PressableWithFade>
              </View>

              <View style={styles.menu}>
                <PressableWithFade
                  style={styles.menuItem}
                  onPress={() => {
                    haptics.light();
                    setShowEditProfile(true);
                  }}
                  activeOpacity={0.7}
                  disabled={deleting}
                  hapticType="light"
                >
                  <Ionicons name="person-outline" size={24} color="#111827" />
                  <Text style={styles.menuItemText}>{t('mobile.edit_profile')}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#4B5563" />
                </PressableWithFade>

                <View style={styles.divider} />

                <PressableWithFade
                  style={styles.menuItem}
                  onPress={() => {
                    haptics.light();
                    onClose();
                    router.push('/blocked-users');
                  }}
                  activeOpacity={0.7}
                  disabled={deleting}
                  hapticType="light"
                >
                  <Ionicons name="ban-outline" size={24} color="#111827" />
                  <Text style={styles.menuItemText}>{t('mobile.blocked_users_menu')}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#4B5563" />
                </PressableWithFade>

                <View style={styles.divider} />

                <PressableWithFade
                  style={styles.menuItem}
                  onPress={() => {
                    haptics.light();
                    setShowFeedback(true);
                  }}
                  activeOpacity={0.7}
                  disabled={deleting}
                  hapticType="light"
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={24} color="#111827" />
                  <Text style={styles.menuItemText}>{t('mobile.send_feedback')}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#4B5563" />
                </PressableWithFade>

                {isAdmin && (
                  <>
                    <View style={styles.divider} />
                    <PressableWithFade
                      style={styles.menuItem}
                      onPress={() => {
                        haptics.light();
                        onClose();
                        router.push('/admin-reports');
                      }}
                      activeOpacity={0.7}
                      disabled={deleting}
                      hapticType="light"
                    >
                      <Ionicons name="shield-checkmark-outline" size={24} color="#111827" />
                      <Text style={styles.menuItemText}>{t('mobile.content_reports')}</Text>
                      <Ionicons name="chevron-forward" size={20} color="#4B5563" />
                    </PressableWithFade>
                  </>
                )}

                <View style={styles.divider} />

                <PressableWithFade
                  style={styles.menuItem}
                  onPress={handleDeleteAccount}
                  activeOpacity={0.7}
                  disabled={deleting}
                  hapticType="heavy"
                >
                  <Ionicons name="trash-outline" size={24} color="#EF4444" />
                  <Text style={[styles.menuItemText, styles.deleteAccountText]}>
                    {deleting ? t('mobile.deleting_account') : t('mobile.delete_account')}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#4B5563" />
                </PressableWithFade>

                <View style={styles.divider} />

                <PressableWithFade
                  style={styles.menuItem}
                  onPress={handleSignOut}
                  activeOpacity={0.7}
                  disabled={deleting}
                  hapticType="medium"
                >
                  <Ionicons name="log-out-outline" size={24} color="#111827" />
                  <Text style={styles.menuItemText}>{t('mobile.sign_out')}</Text>
                </PressableWithFade>
              </View>
            </View>
          </Animated.View>
        </View>
      </View>

      <EditProfileModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        onProfileUpdated={() => {
          // AuthContext will automatically update via onAuthStateChange listener
        }}
      />

      <FeedbackModal
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
      />
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
  drawerWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  drawerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '65%',
  },
  drawer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minHeight: 44,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 56,
    height: 56,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#4B5563',
  },
  closeButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    padding: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    minHeight: 44,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  deleteAccountText: {
    color: '#EF4444',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
});

