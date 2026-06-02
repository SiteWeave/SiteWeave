import { View, Text, StyleSheet, Modal, FlatList, Linking, Animated, Dimensions } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchProjectContacts } from '@siteweave/core-logic';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ProjectTeamModal({ visible, projectId, onClose }) {
  const { supabase } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const modalTranslateY = useRef(new Animated.Value(1)).current;

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

  useEffect(() => {
    if (visible && projectId) {
      loadContacts();
    }
  }, [visible, projectId]);

  const loadContacts = async () => {
    if (!projectId || !supabase) return;
    
    try {
      setLoading(true);
      const data = await fetchProjectContacts(supabase, projectId).catch(err => {
        console.error('Error fetching project contacts:', err);
        return [];
      });
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCall = (phone) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleMessage = (phone) => {
    if (phone) {
      Linking.openURL(`sms:${phone}`);
    }
  };

  const renderContact = ({ item }) => (
    <View style={styles.contactItem}>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.name}</Text>
        {item.role && (
          <Text style={styles.contactRole}>{item.role}</Text>
        )}
        {item.company && (
          <Text style={styles.contactCompany}>{item.company}</Text>
        )}
      </View>
      <View style={styles.contactActions}>
        {item.phone && (
          <>
            <PressableWithFade
              style={styles.actionButton}
              onPress={() => handleCall(item.phone)}
              activeOpacity={0.7}
            >
              <Ionicons name="call-outline" size={20} color="#3B82F6" />
            </PressableWithFade>
            <PressableWithFade
              style={styles.actionButton}
              onPress={() => handleMessage(item.phone)}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#10B981" />
            </PressableWithFade>
          </>
        )}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <ModalScrim onPress={onClose} opacity={0.5} />
        
        <View style={styles.modalWrapper}>
          <Animated.View 
            style={[
              styles.modal,
              {
                transform: [{ translateY: modalTranslateY.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, SCREEN_HEIGHT],
                }) }],
              }
            ]}
          >
          <View style={styles.header}>
            <Text style={styles.modalTitle}>Team</Text>
            <PressableWithFade onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#111827" />
            </PressableWithFade>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text>Loading...</Text>
            </View>
          ) : contacts.length > 0 ? (
            <FlatList
              data={contacts}
              keyExtractor={(item) => item.id}
              renderItem={renderContact}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No team members assigned to this project.</Text>
            </View>
          )}
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '40%',
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
  modalTitle: {
    fontSize: 20,
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
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  contactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: 44,
  },
  contactInfo: {
    flex: 1,
    marginRight: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  contactRole: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 2,
  },
  contactCompany: {
    fontSize: 14,
    color: '#6B7280',
  },
  contactActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
  },
});

