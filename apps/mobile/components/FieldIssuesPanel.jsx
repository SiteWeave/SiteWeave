import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Share,
  Image,
  SectionList,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  fetchProjectIssues,
  updateProjectIssue,
  subscribeProjectIssues,
  groupIssuesByLocation,
  isProjectCloseoutReady,
  createProjectCloseoutReviewLink,
} from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';
import PanelEmptyState from './PanelEmptyState';
import FieldIssueWalkthroughSheet from './FieldIssueWalkthroughSheet';
import ProgressReportUpgradeSheet from './ProgressReportUpgradeSheet';
import Button from './ui/Button';
import { Text } from './ui/Text';
import { useHaptics } from '../hooks/useHaptics';
import { useBranding } from '../context/BrandingContext';
import { useTranslation } from 'react-i18next';
import { colors, spacing, touch, radius } from '../theme';
import { uploadIssueAfterPhotoFromUri } from '../utils/uploadIssuePhoto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VIEW_MODES = ['list', 'location'];
const PUNCH_LIST_COACH_KEY = 'siteweave_punch_list_coach_seen';
const CLOSEOUT_BANNER_KEY_PREFIX = 'siteweave_closeout_banner_dismissed_';

const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images
  ? [ImagePicker.MediaType.Images]
  : (ImagePicker.MediaTypeOptions?.Images ?? ['images']);

function getPriorityColor(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'critical':
      return '#991B1B';
    case 'high':
      return '#9A3412';
    case 'medium':
      return '#854D0E';
    case 'low':
      return '#166534';
    default:
      return colors.textMuted;
  }
}

function isIssueClosed(issue) {
  const status = (issue?.status || '').toLowerCase();
  return (
    Boolean(issue?.resolved_at) ||
    ['closed', 'resolved', 'complete', 'done', 'cancelled'].includes(status)
  );
}

export default function FieldIssuesPanel({
  project,
  supabase,
  currentUserId,
  projectTasks = [],
  canExport = false,
  onReportIssue,
  onEditIssue,
  contentPaddingBottom = spacing.lg,
}) {
  const { t, i18n } = useTranslation();
  const haptics = useHaptics();
  const { primaryColor } = useBranding();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [busyId, setBusyId] = useState(null);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCoachMark, setShowCoachMark] = useState(false);
  const [closeoutBannerDismissed, setCloseoutBannerDismissed] = useState(false);

  const hasLocations = useMemo(
    () => issues.some((issue) => String(issue.location || '').trim()),
    [issues],
  );

  const existingLocations = useMemo(
    () => [...new Set(issues.map((i) => String(i.location || '').trim()).filter(Boolean))],
    [issues],
  );

  const locationSections = useMemo(() => {
    const groups = groupIssuesByLocation(issues);
    return groups.map((group) => ({
      title: group.location || t('punchList.unlocated_section'),
      data: group.items,
    }));
  }, [issues, t]);

  const closeoutReady = useMemo(
    () => isProjectCloseoutReady(projectTasks),
    [projectTasks],
  );

  const showCloseoutBanner = closeoutReady && !closeoutBannerDismissed;

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!project?.id || !supabase) return;
      try {
        if (!silent) setLoading(true);
        const { issues: rows } = await fetchProjectIssues(supabase, project.id, {
          statusFilter,
        });
        setIssues(rows);
      } catch (e) {
        console.error('FieldIssuesPanel', e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [project?.id, supabase, statusFilter],
  );

  useEffect(() => {
    load();
    return subscribeProjectIssues(supabase, project.id, () => load({ silent: true }));
  }, [project?.id, supabase, load]);

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(PUNCH_LIST_COACH_KEY);
        if (seen !== '1') setShowCoachMark(true);
        const dismissed = await AsyncStorage.getItem(`${CLOSEOUT_BANNER_KEY_PREFIX}${project?.id}`);
        if (dismissed === '1') setCloseoutBannerDismissed(true);
      } catch {
        // ignore
      }
    })();
  }, [project?.id]);

  const dismissCoachMark = async () => {
    setShowCoachMark(false);
    try {
      await AsyncStorage.setItem(PUNCH_LIST_COACH_KEY, '1');
    } catch {
      // ignore
    }
  };

  const dismissCloseoutBanner = async () => {
    setCloseoutBannerDismissed(true);
    try {
      await AsyncStorage.setItem(`${CLOSEOUT_BANNER_KEY_PREFIX}${project?.id}`, '1');
    } catch {
      // ignore
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    load({ silent: true });
  };

  const promptAfterPhoto = (issue) =>
    new Promise((resolve) => {
      Alert.alert(t('punchList.after_photo_title'), t('punchList.after_photo_prompt'), [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
        {
          text: t('punchList.take_after_photo'),
          onPress: async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              resolve(null);
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: IMAGE_MEDIA_TYPES,
              quality: 0.8,
              allowsEditing: false,
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
              resolve(result.assets[0].uri);
            } else {
              resolve(null);
            }
          },
        },
      ]);
    });

  const handleToggleStatus = async (issue) => {
    const closed = isIssueClosed(issue);
    if (closed) {
      setBusyId(issue.id);
      try {
        await updateProjectIssue(
          supabase,
          issue.id,
          { status: 'open' },
          { previousStatus: issue.status, bridgeToStream: true },
        );
        haptics.success();
        await load({ silent: true });
      } catch (e) {
        haptics.error();
        Alert.alert(t('common.error'), e.message || t('fieldIssues.status_error'));
      } finally {
        setBusyId(null);
      }
      return;
    }

    let afterUri = null;
    if (issue.before_photo_path) {
      afterUri = await promptAfterPhoto(issue);
    }

    setBusyId(issue.id);
    try {
      if (afterUri) {
        await uploadIssueAfterPhotoFromUri(supabase, {
          issueId: issue.id,
          uri: afterUri,
          userId: currentUserId,
          organizationId: project.organization_id,
        });
      }
      await updateProjectIssue(
        supabase,
        issue.id,
        { status: 'closed' },
        { previousStatus: issue.status, bridgeToStream: true },
      );
      haptics.success();
      await load({ silent: true });
    } catch (e) {
      haptics.error();
      Alert.alert(t('common.error'), e.message || t('fieldIssues.status_error'));
    } finally {
      setBusyId(null);
    }
  };

  const handleShareReviewLink = async () => {
    if (!canExport) {
      setShowUpgrade(true);
      return;
    }
    if (!project?.id || !project?.organization_id) return;
    try {
      const { url } = await createProjectCloseoutReviewLink(supabase, {
        projectId: project.id,
        organizationId: project.organization_id,
      });
      await Share.share({ message: url, url });
    } catch (e) {
      Alert.alert(t('common.error'), e.message || t('punchList.share_error'));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderIssueRow = (item, index, total) => {
    const closed = isIssueClosed(item);
    const priorityColor = getPriorityColor(item.priority);
    const isLast = index === total - 1;
    const attachmentPhotos = (item.issue_files || [])
      .filter((file) => {
        const type = String(file?.file_type || '').toLowerCase();
        return Boolean(file?.file_url) && type.startsWith('image/');
      })
      .slice(0, 2);

    return (
      <View style={[styles.row, isLast && styles.rowLast]} key={String(item.id)}>
        <View style={styles.rowBody}>
          <View style={styles.cardTopRow}>
            <Text variant="bodyMedium" style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View
              style={[
                styles.statusBadge,
                closed ? styles.statusBadgeClosed : styles.statusBadgeOpen,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  closed ? styles.statusBadgeTextClosed : styles.statusBadgeTextOpen,
                ]}
              >
                {closed ? t('fieldIssues.status_closed') : t('fieldIssues.status_open')}
              </Text>
            </View>
          </View>

          {item.location ? (
            <Text variant="caption" style={styles.locationText}>
              {item.location}
            </Text>
          ) : null}

          {item.description ? (
            <Text variant="caption" style={styles.cardDesc} numberOfLines={3}>
              {item.description}
            </Text>
          ) : null}

          {(item.before_photo_url || item.after_photo_url) ? (
            <View style={styles.photoPair}>
              {item.before_photo_url ? (
                <Image source={{ uri: item.before_photo_url }} style={styles.thumb} />
              ) : null}
              {item.after_photo_url ? (
                <Image source={{ uri: item.after_photo_url }} style={styles.thumb} />
              ) : null}
            </View>
          ) : null}

          {attachmentPhotos.length > 0 ? (
            <View style={styles.photoPair}>
              {attachmentPhotos.map((file) => (
                <Image key={String(file.id)} source={{ uri: file.file_url }} style={styles.thumb} />
              ))}
            </View>
          ) : null}

          <View style={styles.cardMetaRow}>
            <View style={styles.cardMetaLeft}>
              {item.priority ? (
                <View style={[styles.priorityPill, { backgroundColor: `${priorityColor}20` }]}>
                  <Text style={[styles.priorityText, { color: priorityColor }]}>
                    {item.priority}
                  </Text>
                </View>
              ) : null}
              {item.created_at ? (
                <Text variant="caption" style={styles.metaText}>
                  {formatDate(item.created_at)}
                </Text>
              ) : null}
            </View>
            <View style={styles.rowActions}>
              <PressableWithFade
                onPress={() => onEditIssue?.(item)}
                style={styles.secondaryActionBtn}
                disabled={busyId === item.id}
                testID={`field-issue-edit-${item.id}`}
              >
                <Text variant="caption" style={styles.secondaryActionBtnText}>
                  {t('common.edit')}
                </Text>
              </PressableWithFade>
              <PressableWithFade
                onPress={() => handleToggleStatus(item)}
                style={styles.statusBtn}
                disabled={busyId === item.id}
                testID={`field-issue-toggle-${item.id}`}
              >
                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={primaryColor} />
                ) : (
                  <Text variant="caption" style={[styles.statusBtnText, { color: primaryColor }]}>
                    {closed ? t('fieldIssues.reopen') : t('fieldIssues.mark_closed')}
                  </Text>
                )}
              </PressableWithFade>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View style={styles.headerBlock}>
      {showCloseoutBanner ? (
        <View style={styles.closeoutBanner}>
          <View style={styles.closeoutBannerTextWrap}>
            <Text variant="bodyMedium" style={styles.closeoutBannerTitle}>
              {t('punchList.closeout_banner_title')}
            </Text>
            <Text variant="caption" style={styles.closeoutBannerBody}>
              {t('punchList.closeout_banner_body')}
            </Text>
          </View>
          <View style={styles.closeoutBannerActions}>
            <PressableWithFade onPress={() => { dismissCloseoutBanner(); setShowWalkthrough(true); }}>
              <Text variant="caption" style={[styles.closeoutBannerCta, { color: primaryColor }]}>
                {t('punchList.start_walkthrough')}
              </Text>
            </PressableWithFade>
            <PressableWithFade onPress={dismissCloseoutBanner} style={styles.bannerDismiss}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </PressableWithFade>
          </View>
        </View>
      ) : null}

      {showCoachMark ? (
        <View style={styles.coachBanner}>
          <Text variant="caption" style={styles.coachText}>{t('punchList.coach_mark')}</Text>
          <PressableWithFade onPress={dismissCoachMark}>
            <Text variant="caption" style={{ color: primaryColor, fontWeight: '700' }}>
              {t('common.ok')}
            </Text>
          </PressableWithFade>
        </View>
      ) : null}

      <View style={styles.primaryCtaRow}>
        <PressableWithFade
          style={styles.secondaryCta}
          onPress={() => setShowWalkthrough(true)}
          accessibilityLabel={t('punchList.start_walkthrough')}
          accessibilityRole="button"
          testID="field-issue-walkthrough"
        >
          <Ionicons name="camera-outline" size={18} color={primaryColor} />
          <Text
            variant="caption"
            numberOfLines={1}
            style={[styles.secondaryCtaText, { color: primaryColor }]}
          >
            {t('punchList.start_walkthrough')}
          </Text>
        </PressableWithFade>
        <PressableWithFade
          style={styles.secondaryCta}
          onPress={handleShareReviewLink}
          accessibilityLabel={t('punchList.share_review_link')}
          accessibilityRole="button"
          testID="field-issue-share"
        >
          <Ionicons name="share-outline" size={18} color={primaryColor} />
          <Text
            variant="caption"
            numberOfLines={1}
            style={[styles.secondaryCtaText, { color: primaryColor }]}
          >
            {t('punchList.share_review_link')}
          </Text>
        </PressableWithFade>
      </View>

      {hasLocations ? (
        <View style={styles.utilityRow}>
          {hasLocations ? (
            <View style={styles.viewSegmented}>
              {VIEW_MODES.map((mode) => (
                <PressableWithFade
                  key={mode}
                  style={[
                    styles.viewSegment,
                    viewMode === mode && styles.viewSegmentActive,
                  ]}
                  onPress={() => setViewMode(mode)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: viewMode === mode }}
                  accessibilityLabel={
                    mode === 'list' ? t('punchList.view_list') : t('punchList.view_location')
                  }
                >
                  <Text
                    variant="caption"
                    style={viewMode === mode ? styles.viewSegmentTextActive : styles.viewSegmentText}
                  >
                    {mode === 'list' ? t('punchList.view_list') : t('punchList.view_location')}
                  </Text>
                </PressableWithFade>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const listFooterComponent = (
    <View style={styles.listFooter}>
      <Button
        label={t('fieldIssues.add_another')}
        onPress={onReportIssue}
        variant="secondary"
        style={styles.addAnotherBtn}
        testID="field-issue-add-another"
      />
    </View>
  );

  const emptyComponent = (
    <PanelEmptyState
      icon="construct-outline"
      title={t('fieldIssues.no_issues')}
      hint={t('fieldIssues.no_issues_hint')}
      ctaLabel={t('fieldIssues.create_first')}
      onCta={onReportIssue}
      testID="field-issue-empty-cta"
    />
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={primaryColor} />
      </View>
    );
  }

  return (
    <>
      {viewMode === 'location' && hasLocations ? (
        <SectionList
          style={styles.container}
          sections={locationSections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index, section }) =>
            renderIssueRow(item, index, section.data.length)
          }
          renderSectionHeader={({ section: { title } }) => (
            <Text variant="bodyMedium" style={styles.sectionHeader}>{title}</Text>
          )}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyComponent}
          ListFooterComponent={issues.length > 0 ? listFooterComponent : null}
          contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          style={styles.container}
          data={issues}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index }) => renderIssueRow(item, index, issues.length)}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyComponent}
          ListFooterComponent={issues.length > 0 ? listFooterComponent : null}
          contentContainerStyle={[styles.listContent, { paddingBottom: contentPaddingBottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}

      <FieldIssueWalkthroughSheet
        visible={showWalkthrough}
        onClose={() => setShowWalkthrough(false)}
        supabase={supabase}
        projectId={project?.id}
        organizationId={project?.organization_id}
        userId={currentUserId}
        existingLocations={existingLocations}
        onCreated={() => load({ silent: true })}
      />

      <ProgressReportUpgradeSheet
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        titleKey="mobile.punch_list_upgrade_title"
        bodyKey="mobile.punch_list_upgrade_body"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexGrow: 1,
  },
  headerBlock: { marginBottom: spacing.md, gap: spacing.md },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  primaryCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secondaryCta: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  secondaryCtaText: { fontWeight: '700', fontSize: 12, flexShrink: 1 },
  utilityRow: {
    alignItems: 'flex-start',
  },
  viewSegmented: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  viewSegment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    minHeight: 32,
    justifyContent: 'center',
  },
  viewSegmentActive: {
    backgroundColor: colors.surfaceMuted,
  },
  viewSegmentText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  viewSegmentTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  listFooter: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  addAnotherBtn: { minHeight: 44 },
  closeoutBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    gap: spacing.sm,
  },
  closeoutBannerTextWrap: { gap: 2 },
  closeoutBannerTitle: { fontWeight: '700' },
  closeoutBannerBody: { color: colors.textMuted },
  closeoutBannerCta: { fontWeight: '700' },
  closeoutBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bannerDismiss: {
    minHeight: 28,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  coachText: { flex: 1, color: colors.textMuted },
  sectionHeader: { fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    overflow: 'hidden',
  },
  rowLast: { borderBottomWidth: 0 },
  rowBody: { flex: 1, paddingVertical: spacing.lg, gap: spacing.sm },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, fontWeight: '700' },
  locationText: { color: colors.primary, fontWeight: '600' },
  statusBadge: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusBadgeOpen: { backgroundColor: '#DBEAFE' },
  statusBadgeClosed: { backgroundColor: colors.surfaceMuted },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadgeTextOpen: { color: '#1D4ED8' },
  statusBadgeTextClosed: { color: colors.textMuted },
  cardDesc: { color: colors.textMuted, lineHeight: 18 },
  photoPair: { flexDirection: 'row', gap: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.surfaceMuted },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    flex: 1,
  },
  priorityPill: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  priorityText: { fontSize: 11, fontWeight: '700' },
  metaText: { color: colors.textSubtle },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  secondaryActionBtn: {
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  secondaryActionBtnText: {
    fontWeight: '700',
    color: colors.textSecondary,
  },
  statusBtn: {
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  statusBtnText: { fontWeight: '700' },
});
