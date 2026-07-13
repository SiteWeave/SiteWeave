import React from 'react';
import { View, Text, StyleSheet, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from '../components/PressableWithFade';
import { useHaptics } from '../hooks/useHaptics';
import { useRouter } from 'expo-router';
import { contentTopInset, sheetBottomPadding } from '../utils/layoutInsets';

const PRIVACY_POLICY_URL = 'https://www.siteweave.org/legal/privacy-policy';

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const router = useRouter();

  const handleOpenPrivacy = async () => {
    try {
      haptics.light();
      const supported = await Linking.canOpenURL(PRIVACY_POLICY_URL);
      if (supported) {
        await Linking.openURL(PRIVACY_POLICY_URL);
      } else {
        Alert.alert('Error', 'Unable to open the Privacy Policy link.');
      }
    } catch (error) {
      console.error('Error opening Privacy Policy:', error);
      Alert.alert('Error', 'Unable to open the Privacy Policy link.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: contentTopInset(insets), paddingBottom: sheetBottomPadding(insets) }]}>
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
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.infoContainer}>
          <Ionicons name="shield-checkmark-outline" size={64} color="#3B82F6" />
          <Text style={styles.infoTitle}>Privacy Policy</Text>
          <Text style={styles.infoText}>
            Please review our Privacy Policy by clicking the link below. You'll be taken to our website where you can read the complete policy.
          </Text>
        </View>

        <PressableWithFade
          style={styles.linkButton}
          onPress={handleOpenPrivacy}
        >
          <Ionicons name="open-outline" size={20} color="#3B82F6" />
          <Text style={styles.linkText}>View Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={20} color="#3B82F6" />
        </PressableWithFade>

        <View style={styles.urlContainer}>
          <Text style={styles.urlText}>{PRIVACY_POLICY_URL}</Text>
        </View>
      </View>
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
});

