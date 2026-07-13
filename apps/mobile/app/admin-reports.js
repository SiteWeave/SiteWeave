import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from '../components/PressableWithFade';
import { useAuth } from '../context/AuthContext';
import { getContentReports, updateReportStatus } from '@siteweave/core-logic';
import { useHaptics } from '../hooks/useHaptics';
import { useRouter } from 'expo-router';
import { usePlatformDeveloper } from '../hooks/usePlatformDeveloper';
import { contentTopInset, sheetBottomPadding } from '../utils/layoutInsets';

const STATUS_COLORS = {
  pending: '#F59E0B',
  reviewed: '#3B82F6',
  resolved: '#10B981',
  dismissed: '#6B7280',
};

const REASON_LABELS = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate Content',
  violence: 'Violence or Threats',
  hate_speech: 'Hate Speech',
  other: 'Other',
};

export default function AdminReportsScreen() {
  const { user, supabase } = useAuth();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const router = useRouter();
  const { isPlatformDeveloper, loading: developerLoading } = usePlatformDeveloper();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'resolved', 'dismissed'

  useEffect(() => {
    if (!developerLoading && !isPlatformDeveloper) {
      router.replace('/(tabs)/more');
    }
  }, [developerLoading, isPlatformDeveloper, router]);

  useEffect(() => {
    if (!isPlatformDeveloper) return;
    loadReports();
  }, [user, filter, isPlatformDeveloper]);

  const loadReports = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const options = filter !== 'all' ? { status: filter } : {};
      const data = await getContentReports(supabase, options);
      setReports(data || []);
    } catch (error) {
      console.error('Error loading reports:', error);
      Alert.alert('Error', 'Failed to load reports. You may not have admin access.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadReports();
  };

  const handleUpdateStatus = async (reportId, newStatus) => {
    if (!user) return;

    try {
      haptics.medium();
      await updateReportStatus(supabase, reportId, {
        status: newStatus,
        reviewedByUserId: user.id,
        resolutionNotes: null,
      });
      haptics.success();
      loadReports();
      Alert.alert('Updated', `Report status updated to ${newStatus}.`);
    } catch (error) {
      console.error('Error updating report:', error);
      haptics.error();
      Alert.alert('Error', 'Failed to update report status.');
    }
  };

  const showStatusMenu = (report) => {
    haptics.medium();
    const options = [];
    
    if (report.status === 'pending') {
      options.push(
        { text: 'Mark as Reviewed', onPress: () => handleUpdateStatus(report.id, 'reviewed') },
        { text: 'Resolve', onPress: () => handleUpdateStatus(report.id, 'resolved') },
        { text: 'Dismiss', onPress: () => handleUpdateStatus(report.id, 'dismissed') },
      );
    } else if (report.status === 'reviewed') {
      options.push(
        { text: 'Resolve', onPress: () => handleUpdateStatus(report.id, 'resolved') },
        { text: 'Dismiss', onPress: () => handleUpdateStatus(report.id, 'dismissed') },
      );
    }

    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Update Status', 'Select a new status for this report:', options);
  };

  const renderReport = ({ item: report }) => {
    const reportedBy = report.reported_by?.email || 'Unknown';
    const reportedUser = report.reported_user?.email || 'Unknown';
    const reviewedBy = report.reviewed_by?.email || null;

    return (
      <View style={styles.reportCard}>
        <View style={styles.reportHeader}>
          <View style={styles.reportHeaderLeft}>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[report.status] }]}>
              <Text style={styles.statusText}>{report.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.reportType}>{report.content_type}</Text>
          </View>
          <Text style={styles.reportDate}>
            {new Date(report.created_at).toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.reportBody}>
          <View style={styles.reportRow}>
            <Text style={styles.label}>Reason:</Text>
            <Text style={styles.value}>{REASON_LABELS[report.reason] || report.reason}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text style={styles.label}>Reported by:</Text>
            <Text style={styles.value}>{reportedBy}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text style={styles.label}>Reported user:</Text>
            <Text style={styles.value}>{reportedUser}</Text>
          </View>
          {report.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.label}>Description:</Text>
              <Text style={styles.description}>{report.description}</Text>
            </View>
          )}
          {reviewedBy && (
            <View style={styles.reportRow}>
              <Text style={styles.label}>Reviewed by:</Text>
              <Text style={styles.value}>{reviewedBy}</Text>
            </View>
          )}
        </View>

        {report.status !== 'resolved' && report.status !== 'dismissed' && (
          <PressableWithFade
            style={styles.actionButton}
            onPress={() => showStatusMenu(report)}
          >
            <Text style={styles.actionButtonText}>Update Status</Text>
          </PressableWithFade>
        )}
      </View>
    );
  };

  if (developerLoading || !isPlatformDeveloper) {
    return (
      <View style={[styles.container, { paddingTop: contentTopInset(insets), justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

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
        <Text style={styles.title}>Content Reports</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {['all', 'pending', 'resolved', 'dismissed'].map((status) => (
          <PressableWithFade
            key={status}
            style={[styles.filterTab, filter === status && styles.filterTabActive]}
            onPress={() => {
              haptics.selection();
              setFilter(status);
            }}
          >
            <Text style={[styles.filterText, filter === status && styles.filterTextActive]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </PressableWithFade>
        ))}
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading reports...</Text>
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="shield-checkmark-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyText}>No reports found</Text>
          <Text style={styles.emptySubtext}>
            {filter === 'all' 
              ? 'No content reports have been submitted yet.'
              : `No ${filter} reports found.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={renderReport}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
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
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#3B82F6',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterTextActive: {
    color: '#fff',
  },
  list: {
    padding: 16,
  },
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  reportType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    textTransform: 'capitalize',
  },
  reportDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  reportBody: {
    gap: 8,
  },
  reportRow: {
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    minWidth: 100,
  },
  value: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  descriptionContainer: {
    marginTop: 4,
  },
  description: {
    fontSize: 14,
    color: '#111827',
    marginTop: 4,
    lineHeight: 20,
  },
  actionButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  actionButtonText: {
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

