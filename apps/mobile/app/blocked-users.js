import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from '../components/PressableWithFade';
import { useAuth } from '../context/AuthContext';
import { getBlockedUsers, unblockUser } from '@siteweave/core-logic';
import { useHaptics } from '../hooks/useHaptics';
import { useRouter } from 'expo-router';

export default function BlockedUsersScreen() {
  const { t } = useTranslation();
  const { user, supabase } = useAuth();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const router = useRouter();
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState({});

  useEffect(() => {
    loadBlockedUsers();
  }, [user]);

  const loadBlockedUsers = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const blockedUserIds = await getBlockedUsers(supabase, user.id);

      if (blockedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, contact_id')
          .in('id', blockedUserIds);

        if (profiles) {
          const contactIds = profiles.map((p) => p.contact_id).filter(Boolean);
          if (contactIds.length > 0) {
            const { data: contacts } = await supabase
              .from('contacts')
              .select('id, name, email')
              .in('id', contactIds);

            const userMap = {};
            profiles.forEach((profile) => {
              if (profile.contact_id) {
                const contact = contacts?.find((c) => c.id === profile.contact_id);
                if (contact) {
                  userMap[profile.id] = {
                    id: profile.id,
                    name: contact.name,
                    email: contact.email,
                  };
                }
              }
            });

            setBlockedUsers(blockedUserIds.map((id) => userMap[id]).filter(Boolean));
          } else {
            setBlockedUsers([]);
          }
        } else {
          setBlockedUsers([]);
        }
      } else {
        setBlockedUsers([]);
      }
    } catch (error) {
      console.error('Error loading blocked users:', error);
      Alert.alert(t('common.error'), t('moderation.failed_load_blocked'));
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = (blockedUser) => {
    haptics.medium();
    const displayName = blockedUser.name || blockedUser.email;
    Alert.alert(
      t('mobile.unblock_user_title'),
      t('moderation.unblock_confirm', { name: displayName }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
          onPress: () => haptics.light(),
        },
        {
          text: t('moderation.unblock'),
          style: 'default',
          onPress: () => confirmUnblock(blockedUser),
        },
      ]
    );
  };

  const confirmUnblock = async (blockedUser) => {
    if (!user) return;

    try {
      haptics.medium();
      setUnblocking((prev) => ({ ...prev, [blockedUser.id]: true }));

      await unblockUser(supabase, user.id, blockedUser.id);

      haptics.success();
      setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedUser.id));
      const displayName = blockedUser.name || blockedUser.email;
      Alert.alert(t('moderation.unblock'), t('moderation.unblocked_toast', { name: displayName }));
    } catch (error) {
      console.error('Error unblocking user:', error);
      haptics.error();
      Alert.alert(t('common.error'), t('moderation.failed_unblock'));
    } finally {
      setUnblocking((prev) => ({ ...prev, [blockedUser.id]: false }));
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <PressableWithFade
          style={styles.backButton}
          onPress={() => {
            haptics.light();
            if (router.canGoBack()) {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </PressableWithFade>
        <Text style={styles.title}>{t('moderation.screen_title')}</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('common.loading')}</Text>
        </View>
      ) : blockedUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="ban-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyText}>{t('moderation.blocked_empty_title')}</Text>
          <Text style={styles.emptySubtext}>{t('moderation.blocked_empty_hint_mobile')}</Text>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.userItem}>
              <View style={styles.userInfo}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(item.name || item.email || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userDetails}>
                  <Text style={styles.userName}>{item.name || t('moderation.unknown_user')}</Text>
                  {item.email && <Text style={styles.userEmail}>{item.email}</Text>}
                </View>
              </View>
              <PressableWithFade
                style={[styles.unblockButton, unblocking[item.id] && styles.unblockButtonDisabled]}
                onPress={() => handleUnblock(item)}
                disabled={unblocking[item.id]}
              >
                <Text style={styles.unblockButtonText}>
                  {unblocking[item.id] ? t('moderation.unblocking') : t('moderation.unblock')}
                </Text>
              </PressableWithFade>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  placeholder: {
    width: 44,
  },
  list: {
    padding: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#4B5563',
  },
  unblockButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },
  unblockButtonDisabled: {
    opacity: 0.5,
  },
  unblockButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 300,
  },
});
