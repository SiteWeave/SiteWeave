import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from '../components/PressableWithFade';
import { useAuth } from '../context/AuthContext';
import { acceptTermsOfService, hasAcceptedTermsOfService } from '@siteweave/core-logic';
import { useHaptics } from '../hooks/useHaptics';
import { useRouter } from 'expo-router';
import { TOS_VERSION, TOS_URL } from '../constants/legal';

export default function TermsOfServiceScreen() {
  const { user, supabase } = useAuth();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    checkAcceptance();
  }, [user]);

  const checkAcceptance = async () => {
    if (!user) {
      setChecking(false);
      return;
    }

    try {
      const hasAccepted = await hasAcceptedTermsOfService(supabase, user.id, TOS_VERSION);
      setAccepted(hasAccepted);
    } catch (error) {
      console.error('Error checking ToS acceptance:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleOpenTerms = async () => {
    try {
      haptics.light();
      const supported = await Linking.canOpenURL(TOS_URL);
      if (supported) {
        await Linking.openURL(TOS_URL);
      } else {
        Alert.alert('Error', 'Unable to open the Terms of Service link.');
      }
    } catch (error) {
      console.error('Error opening Terms of Service:', error);
      Alert.alert('Error', 'Unable to open the Terms of Service link.');
    }
  };

  const handleAccept = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to accept the Terms of Service.');
      return;
    }

    try {
      haptics.medium();
      setAccepting(true);
      
      await acceptTermsOfService(supabase, user.id, TOS_VERSION, {
        // In a real app, you might want to capture IP and user agent
        ipAddress: null,
        userAgent: null,
      });

      haptics.success();
      setAccepted(true);
      Alert.alert('Accepted', 'You have accepted the Terms of Service.', [
        {
          text: 'OK',
          onPress: () => {
            if (router.canGoBack()) {
              router.back();
            }
          },
        },
      ]);
    } catch (error) {
      console.error('Error accepting ToS:', error);
      haptics.error();
      Alert.alert('Error', 'Failed to accept Terms of Service. Please try again.');
    } finally {
      setAccepting(false);
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
        <Text style={styles.title}>Terms of Service</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.infoContainer}>
          <Ionicons name="document-text-outline" size={64} color="#3B82F6" />
          <Text style={styles.infoTitle}>Terms of Service</Text>
          <Text style={styles.infoText}>
            Please review our Terms of Service by clicking the link below. You'll be taken to our website where you can read the complete terms.
          </Text>
        </View>

        <PressableWithFade
          style={styles.linkButton}
          onPress={handleOpenTerms}
        >
          <Ionicons name="open-outline" size={20} color="#3B82F6" />
          <Text style={styles.linkText}>View Terms of Service</Text>
          <Ionicons name="chevron-forward" size={20} color="#3B82F6" />
        </PressableWithFade>

        <View style={styles.urlContainer}>
          <Text style={styles.urlText}>{TOS_URL}</Text>
        </View>
      </View>

      {!checking && (
        <View style={styles.footer}>
          {accepted ? (
            <View style={styles.acceptedContainer}>
              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              <Text style={styles.acceptedText}>You have accepted these terms</Text>
            </View>
          ) : (
            <PressableWithFade
              style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
              onPress={handleAccept}
              disabled={accepting || !user}
            >
              <Text style={styles.acceptButtonText}>
                {accepting ? 'Accepting...' : 'Accept Terms of Service'}
              </Text>
            </PressableWithFade>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
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
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  infoTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4B5563',
    textAlign: 'center',
    maxWidth: 300,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
    marginBottom: 16,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  urlContainer: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 6,
  },
  urlText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  acceptButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonDisabled: {
    opacity: 0.5,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  acceptedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  acceptedText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '600',
  },
});

