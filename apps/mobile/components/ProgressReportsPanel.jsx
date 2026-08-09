import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Alert, RefreshControl, ActivityIndicator, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  getProjectProgressReportSchedules,
  sendManualReport,
  exportReportToPDF,
  deleteProgressReportSchedule,
  formatScheduleNextSendAt,
} from '@siteweave/core-logic';
import { getLocalizedFrequencyLabel } from '@siteweave/i18n';
import BottomSheet from './ui/BottomSheet';
import { Text } from './ui/Text';
import Button from './ui/Button';
import PressableWithFade from './PressableWithFade';
import { SkeletonList } from './ui/Skeleton';
import ProgressReportFormSheet from './ProgressReportFormSheet';
import ProgressReportHistorySheet from './ProgressReportHistorySheet';
import ProgressReportUpgradeSheet from './ProgressReportUpgradeSheet';
import PanelEmptyState from './PanelEmptyState';
import { saveProgressReportPdf } from '../utils/saveProgressReportPdf';
import { useWorkspaceTier } from '../hooks/useWorkspaceTier';
import { useHaptics } from '../hooks/useHaptics';
import { useBranding } from '../context/BrandingContext';
import { colors, spacing, touch } from '../theme';
import { useAfterSheetDismiss } from '../utils/runAfterSheetDismiss';

function audienceLabel(schedule, t) {
  const map = {
    client: t('progressReports.audience_client'),
    internal: t('progressReports.audience_internal'),
    executive: t('progressReports.audience_executive'),
  };
  return map[schedule.report_audience_type] || schedule.report_audience_type;
}

function ScheduleActionButton({ icon, label, onPress, disabled, loading, testID, primaryColor }) {
  return (
    <PressableWithFade
      style={[styles.actionBtn, disabled && styles.actionBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" color={primaryColor} />
      ) : (
        <Ionicons name={icon} size={18} color={primaryColor} />
      )}
      <Text variant="caption" style={[styles.actionText, { color: primaryColor }]}>
        {label}
      </Text>
    </PressableWithFade>
  );
}

export default function ProgressReportsPanel({
  active = true,
  embedded = false,
  onClose,
  supabase,
  organizationId,
  projectId,
  projectName,
  userId,
  contentPaddingBottom = spacing.lg,
}) {
  const { t, i18n } = useTranslation();
  const { canExport } = useWorkspaceTier();
  const haptics = useHaptics();
  const { primaryColor } = useBranding();
  const { scheduleAfterDismiss, handleDismissed, clearPending } = useAfterSheetDismiss();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [sheetView, setSheetView] = useState('list');
  const [shareSuspended, setShareSuspended] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [formScheduleId, setFormScheduleId] = useState(null);
  const [historySchedule, setHistorySchedule] = useState(null);

  const loadSchedules = useCallback(async ({ silent = false } = {}) => {
    if (!supabase || !organizationId || !projectId) return;
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const rows = await getProjectProgressReportSchedules(supabase, organizationId, projectId);
      setSchedules(rows || []);
    } catch (error) {
      console.error('Error loading progress reports:', error);
      setSchedules([]);
      setLoadError(error.message || t('mobile.progress_reports_load_error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, organizationId, projectId, t]);

  useEffect(() => {
    if (active) loadSchedules();
  }, [active, loadSchedules]);

  useEffect(() => {
    if (!active) {
      setSheetView('list');
      setStatusMessage(null);
      setFormScheduleId(null);
      setHistorySchedule(null);
    }
  }, [active]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSchedules({ silent: true });
  };

  const showStatus = (message) => {
    setStatusMessage(message);
  };

  const handleSheetClose = () => {
    if (sheetView !== 'list') {
      setSheetView('list');
      return;
    }
    onClose?.();
  };

  const openCreateForm = () => {
    setFormScheduleId(null);
    setSheetView('form');
  };

  const openEditForm = (scheduleId) => {
    setFormScheduleId(scheduleId);
    setSheetView('form');
  };

  const handleSend = async (scheduleId) => {
    setBusyId(scheduleId);
    setBusyAction('send');
    try {
      await sendManualReport(supabase, scheduleId);
      haptics.success();
      showStatus(t('mobile.progress_reports_status_sent'));
      await loadSchedules({ silent: true });
    } catch (error) {
      haptics.error();
      Alert.alert(t('common.error'), error.message || t('mobile.progress_reports_send_error'));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleExport = async (scheduleId) => {
    if (!canExport) {
      setSheetView('upgrade');
      return;
    }

    const runExport = async () => {
      setBusyId(scheduleId);
      setBusyAction('export');
      try {
        const result = await exportReportToPDF(supabase, scheduleId);
        if (!result?.html) {
          throw new Error(t('mobile.progress_reports_export_empty'));
        }
        const saveResult = await saveProgressReportPdf(result.html, {
          defaultFilename: `${projectName || 'report'}-progress`,
        });
        if (!saveResult.ok && !saveResult.canceled) {
          throw new Error(saveResult.error);
        }
        if (saveResult.ok) {
          haptics.success();
          showStatus(t('mobile.progress_reports_status_exported'));
        }
      } catch (error) {
        haptics.error();
        Alert.alert(t('common.error'), error.message || t('mobile.progress_reports_export_error'));
      } finally {
        setBusyId(null);
        setBusyAction(null);
        setShareSuspended(false);
      }
    };

    if (embedded) {
      await runExport();
      return;
    }

    scheduleAfterDismiss(() => {
      void runExport();
    }, () => setShareSuspended(true));
  };

  const handleDelete = (schedule) => {
    Alert.alert(t('progressReports.delete'), t('mobile.progress_reports_delete_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('progressReports.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusyId(schedule.id);
          try {
            await deleteProgressReportSchedule(supabase, schedule.id);
            haptics.success();
            showStatus(t('mobile.progress_reports_status_deleted'));
            await loadSchedules({ silent: true });
          } catch (error) {
            haptics.error();
            Alert.alert(t('common.error'), error.message || t('mobile.progress_reports_delete_error'));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const renderScheduleMeta = (row) => {
    const parts = [
      audienceLabel(row, t),
      getLocalizedFrequencyLabel(row.frequency, row.frequency_value, t),
    ];
    if (row.last_sent_at) {
      parts.push(
        t('progressReports.sent_on', {
          date: new Date(row.last_sent_at).toLocaleDateString(i18n.language),
        }),
      );
    }
    if (row.next_send_at && row.frequency !== 'manual') {
      parts.push(
        t('progressReports.next_send', {
          date: formatScheduleNextSendAt(
            row.next_send_at,
            i18n.language,
            row.send_timezone || 'America/New_York',
          ),
        }),
      );
    }
    return parts.join(' · ');
  };

  const listBody = (
    <>
      {statusMessage ? (
        <View style={styles.statusBanner}>
          <Ionicons name="checkmark-circle" size={18} color={colors.secondary} />
          <Text variant="bodyMedium" style={styles.statusText}>
            {statusMessage}
          </Text>
        </View>
      ) : null}

      {!embedded ? (
        <Text variant="caption" style={styles.subtitle}>
          {t('mobile.progress_reports_subtitle')}
        </Text>
      ) : null}

      {loading ? (
        <SkeletonList count={3} rowHeight={120} />
      ) : loadError ? (
        <View style={styles.errorBlock}>
          <Text variant="bodyMedium" style={styles.emptyText}>
            {loadError}
          </Text>
          <Button label={t('updates.try_again')} onPress={() => loadSchedules()} />
        </View>
      ) : schedules.length === 0 ? (
        <PanelEmptyState
          icon="document-text-outline"
          title={t('mobile.progress_reports_empty')}
          hint={t('mobile.progress_reports_empty_hint')}
          ctaLabel={t('mobile.progress_reports_create')}
          onCta={openCreateForm}
          testID="progress-reports-create"
        />
      ) : (
        <View style={styles.list}>
          {schedules.map((row, rowIndex) => {
            const isBusy = busyId === row.id;
            const isLast = rowIndex === schedules.length - 1;
            return (
              <View key={row.id} style={[styles.row, isLast && styles.rowLast]}>
                <View style={styles.rowHeader}>
                  <Text variant="bodyMedium" style={styles.rowTitle} numberOfLines={2}>
                    {row.name || row.custom_subject || t('mobile.progress_reports_untitled')}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      row.is_active ? styles.statusActive : styles.statusDraft,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        row.is_active ? styles.statusTextActive : styles.statusTextDraft,
                      ]}
                    >
                      {row.is_active
                        ? t('progressReports.status_active')
                        : t('progressReports.status_draft')}
                    </Text>
                  </View>
                </View>
                <Text variant="caption" style={styles.rowMeta} numberOfLines={3}>
                  {renderScheduleMeta(row)}
                </Text>
                <Text variant="caption" style={styles.recipientMeta}>
                  {t('progressReports.recipients_count', {
                    count: row.progress_report_recipients?.length || 0,
                  })}
                </Text>

                <View style={styles.rowActionsPrimary}>
                  <ScheduleActionButton
                    icon="paper-plane-outline"
                    label={t('mobile.progress_reports_send')}
                    onPress={() => handleSend(row.id)}
                    disabled={isBusy}
                    loading={isBusy && busyAction === 'send'}
                    testID={`progress-report-send-${row.id}`}
                    primaryColor={primaryColor}
                  />
                  <ScheduleActionButton
                    icon="download-outline"
                    label={t('progressReports.export_pdf')}
                    onPress={() => handleExport(row.id)}
                    disabled={isBusy}
                    loading={isBusy && busyAction === 'export'}
                    testID={`progress-report-export-${row.id}`}
                    primaryColor={primaryColor}
                  />
                </View>

                <View style={styles.rowActionsSecondary}>
                  <PressableWithFade
                    style={styles.secondaryBtn}
                    onPress={() => {
                      setHistorySchedule(row);
                      setSheetView('history');
                    }}
                    disabled={isBusy}
                    testID={`progress-report-history-${row.id}`}
                  >
                    <Text variant="caption" style={styles.secondaryBtnText}>
                      {t('progressReports.history')}
                    </Text>
                  </PressableWithFade>
                  <PressableWithFade
                    style={styles.secondaryBtn}
                    onPress={() => openEditForm(row.id)}
                    disabled={isBusy}
                    testID={`progress-report-edit-${row.id}`}
                  >
                    <Text variant="caption" style={styles.secondaryBtnText}>
                      {t('progressReports.edit')}
                    </Text>
                  </PressableWithFade>
                  <PressableWithFade
                    style={styles.secondaryBtn}
                    onPress={() => handleDelete(row)}
                    disabled={isBusy}
                    testID={`progress-report-delete-${row.id}`}
                  >
                    <Text variant="caption" style={[styles.secondaryBtnText, styles.deleteText]}>
                      {t('progressReports.delete')}
                    </Text>
                  </PressableWithFade>
                </View>
              </View>
            );
          })}
          <Button
            label={t('mobile.progress_reports_add')}
            variant="secondary"
            onPress={openCreateForm}
            testID="progress-reports-add"
          />
        </View>
      )}
    </>
  );

  const listVisible = active && sheetView === 'list' && !shareSuspended;
  const formVisible = active && sheetView === 'form';
  const historyVisible = active && sheetView === 'history';
  const upgradeVisible = active && sheetView === 'upgrade';

  useEffect(() => {
    if (!active) {
      setShareSuspended(false);
      clearPending();
    }
  }, [active, clearPending]);

  return (
    <>
      {embedded ? (
        <ScrollView
          style={styles.embeddedScroll}
          contentContainerStyle={[
            styles.embeddedContent,
            { paddingBottom: contentPaddingBottom },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {listBody}
        </ScrollView>
      ) : (
        <BottomSheet
          visible={listVisible}
          title={t('mobile.progress_reports_title')}
          onClose={handleSheetClose}
          onDismissed={handleDismissed}
          dismissWithoutAnimation={shareSuspended}
          testID="progress-reports-sheet"
        >
          <BottomSheet.Scroll
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {listBody}
          </BottomSheet.Scroll>
        </BottomSheet>
      )}

      <ProgressReportFormSheet
        visible={formVisible}
        onClose={() => setSheetView('list')}
        onSaved={() => {
          showStatus(t('mobile.progress_reports_status_saved'));
          loadSchedules({ silent: true });
        }}
        supabase={supabase}
        organizationId={organizationId}
        projectId={projectId}
        projectName={projectName}
        userId={userId}
        scheduleId={formScheduleId}
      />

      <ProgressReportHistorySheet
        visible={historyVisible}
        onClose={() => setSheetView('list')}
        supabase={supabase}
        scheduleId={historySchedule?.id}
        scheduleName={historySchedule?.name}
      />

      <ProgressReportUpgradeSheet visible={upgradeVisible} onClose={() => setSheetView('list')} />
    </>
  );
}

const styles = StyleSheet.create({
  embeddedScroll: { flex: 1 },
  embeddedContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  statusText: { flex: 1, color: '#15803D' },
  subtitle: { color: colors.textMuted, marginBottom: spacing.md },
  errorBlock: { paddingVertical: spacing.lg, gap: spacing.md },
  emptyText: { color: colors.textMuted },
  emptyHint: { color: colors.textSubtle, lineHeight: 18 },
  list: { marginTop: spacing.xs },
  row: {
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowTitle: { flex: 1, fontWeight: '700' },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusActive: { backgroundColor: '#DCFCE7' },
  statusDraft: { backgroundColor: colors.surfaceMuted },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  statusTextActive: { color: '#15803D' },
  statusTextDraft: { color: colors.textMuted },
  rowMeta: { color: colors.textMuted, lineHeight: 18 },
  recipientMeta: { color: colors.textSubtle },
  rowActionsPrimary: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  rowActionsSecondary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touch.minRowHeight,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionText: { fontWeight: '700' },
  secondaryBtn: {
    minHeight: touch.minSize,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  secondaryBtnText: { color: colors.primary, fontWeight: '700' },
  deleteText: { color: colors.error },
});
