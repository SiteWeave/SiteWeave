import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getProgressReportHistory, sendManualReport } from '@siteweave/core-logic';
import BottomSheet, { useSheetInsets } from './ui/BottomSheet';
import Card from './ui/Card';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { SkeletonList } from './ui/Skeleton';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing, touch } from '../theme';

export default function ProgressReportHistorySheet({
  visible,
  onClose,
  supabase,
  scheduleId,
  scheduleName,
}) {
  const { t, i18n } = useTranslation();
  const haptics = useHaptics();
  const sheetInsets = useSheetInsets();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (!supabase || !scheduleId) return;
    if (!silent) setLoading(true);
    try {
      const rows = await getProgressReportHistory(supabase, scheduleId, 30);
      setRecords(rows || []);
    } catch (error) {
      console.error('Error loading progress report history:', error);
      setRecords([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, scheduleId]);

  useEffect(() => {
    if (visible) loadHistory();
  }, [visible, loadHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory({ silent: true });
  };

  const handleResend = async (record) => {
    if (!supabase || !record?.schedule_id) return;
    setBusyId(record.id);
    try {
      await sendManualReport(supabase, record.schedule_id);
      haptics.success();
      await loadHistory({ silent: true });
    } catch (error) {
      haptics.error();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.progress_reports_history_title')}
      onClose={onClose}
      testID="progress-report-history-sheet"
    >
      <BottomSheet.Scroll
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg }}
      >
        {scheduleName ? (
          <Text variant="caption" style={styles.subtitle} numberOfLines={2}>
            {scheduleName}
          </Text>
        ) : null}
        {loading ? (
          <SkeletonList count={4} rowHeight={64} />
        ) : records.length === 0 ? (
          <Text variant="body" style={styles.empty}>
            {t('mobile.progress_reports_history_empty')}
          </Text>
        ) : (
          <View style={[styles.list, { paddingBottom: sheetInsets.bottom + spacing.xl }]}>
            {records.map((item) => {
              const recipientCount = Array.isArray(item.recipient_emails)
                ? item.recipient_emails.length
                : 0;
              const sentLabel = item.sent_at
                ? new Date(item.sent_at).toLocaleString(i18n.language, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : '';
              return (
                <Card key={item.id} style={styles.row}>
                  <View style={styles.rowMain}>
                    <Text variant="bodyMedium" style={styles.rowDate}>
                      {sentLabel}
                    </Text>
                    <Text variant="caption" style={styles.rowMeta}>
                      {t('progressReports.recipients_count', { count: recipientCount })}
                      {item.was_manual_send ? ` · ${t('progressReports.manual_send')}` : ''}
                    </Text>
                  </View>
                  <PressableWithFade
                    style={styles.resendBtn}
                    onPress={() => handleResend(item)}
                    disabled={busyId === item.id}
                    testID={`progress-report-resend-${item.id}`}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text variant="caption" style={styles.resendText}>
                        {t('progressReports.resend')}
                      </Text>
                    )}
                  </PressableWithFade>
                </Card>
              );
            })}
          </View>
        )}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowMain: { flex: 1, gap: 2 },
  rowDate: { fontWeight: '600' },
  rowMeta: { color: colors.textMuted },
  resendBtn: {
    minHeight: touch.minSize,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  resendText: { color: colors.primary, fontWeight: '700' },
});
