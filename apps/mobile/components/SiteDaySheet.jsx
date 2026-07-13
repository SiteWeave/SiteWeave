import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  createStreamPost,
  fetchProjectIssues,
  fetchProjectContacts,
  listWeatherImpactsForProject,
  buildSiteDaySections,
  buildSiteDayBodyFromSections,
  isPassiveSiteDayReady,
  todayIso,
  wasCompletedToday,
  weatherImpactIsToday,
} from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import { ProjectChipPicker } from './ui/ProjectPicker';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, radius, touch } from '../theme';

const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images
  ? [ImagePicker.MediaType.Images]
  : (ImagePicker.MediaTypeOptions?.Images ?? ['images']);
import { enqueueOfflineAction } from '../utils/offlineQueue';
import { uploadSiteDayPhotoFromUri } from '../utils/uploadSiteDayPhoto';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { recordSiteDayPost } from '../utils/siteDayStreak';
import { useHaptics } from '../hooks/useHaptics';
import { useCollapsibleList, ShowMoreToggle } from './ui/CollapsibleList';

const BLOCKER_CATEGORIES = ['delay', 'safety', 'quality'];

function contactKey(contact) {
  return contact?.id || contact?.email || contact?.name || '';
}

function contactTradeLabel(contact) {
  return contact?.trade || contact?.role || contact?.company || '';
}

function contactDisplayName(contact, fallback) {
  return contact?.name?.trim() || contact?.email || fallback;
}

function emptySections() {
  return buildSiteDaySections({});
}

export default function SiteDaySheet({
  visible,
  onClose,
  supabase,
  userId,
  organizationId,
  projects = [],
  tasks = [],
  onPosted,
}) {
  const { t, i18n } = useTranslation();
  const haptics = useHaptics();
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [sections, setSections] = useState(emptySections);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [userEdited, setUserEdited] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [projectContacts, setProjectContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const initialSnapshotRef = useRef(null);

  const projectOptions = useMemo(() => projects.filter((p) => p?.id), [projects]);

  const body = useMemo(
    () => buildSiteDayBodyFromSections(sections, t),
    [sections, t, i18n.language],
  );

  const passiveReady = useMemo(
    () =>
      isPassiveSiteDayReady({
        sections,
        photos,
        userEdited,
        initialSnapshot: initialSnapshotRef.current,
      }),
    [sections, photos, userEdited],
  );

  const markEdited = useCallback(() => setUserEdited(true), []);

  const updateNotes = useCallback(
    (notes) => {
      markEdited();
      setSections((prev) => ({ ...prev, notes }));
    },
    [markEdited],
  );

  const { listening, available: voiceAvailable, toggle: toggleVoice } = useVoiceDictation({
    locale: i18n.language?.startsWith('es') ? 'es-ES' : 'en-US',
    onResult: updateNotes,
    onError: (msg) => Alert.alert(t('mobile.site_day_voice_error_title'), msg),
  });

  useEffect(() => {
    if (!visible) return;
    setSelectedProjectId(projectOptions.length === 1 ? (projectOptions[0]?.id ?? null) : null);
    setUserEdited(false);
    setPhotos([]);
    setProjectContacts([]);
    setDetailsExpanded(false);
    initialSnapshotRef.current = null;
  }, [visible, projectOptions]);

  useEffect(() => {
    if (!visible || !selectedProjectId || !supabase) return;

    let cancelled = false;
    const loadDraft = async () => {
      setDrafting(true);
      try {
        const projectTasks = tasks.filter((task) => task.project_id === selectedProjectId);
        const completedToday = projectTasks.filter(wasCompletedToday);

        const [weatherImpacts, issuesResult] = await Promise.all([
          listWeatherImpactsForProject(supabase, selectedProjectId, organizationId).catch(() => []),
          fetchProjectIssues(supabase, selectedProjectId, { statusFilter: 'open', limit: 10 }).catch(
            () => ({ issues: [] }),
          ),
        ]);

        const todayWeather = (weatherImpacts || []).filter(weatherImpactIsToday);

        const built = buildSiteDaySections({
          completedTasks: completedToday,
          weatherImpacts: todayWeather,
          openIssues: issuesResult.issues || [],
        });

        if (!cancelled) {
          initialSnapshotRef.current = {
            work_completed: built.work_completed,
            weather: built.weather,
            blockers: built.blockers,
          };
          setSections(built);
          setUserEdited(false);
        }
      } finally {
        if (!cancelled) setDrafting(false);
      }
    };

    loadDraft();
    return () => {
      cancelled = true;
    };
  }, [visible, selectedProjectId, supabase, organizationId, tasks]);

  useEffect(() => {
    if (!visible || !selectedProjectId || !supabase) {
      setProjectContacts([]);
      return undefined;
    }

    let cancelled = false;
    const loadContacts = async () => {
      setLoadingContacts(true);
      try {
        const data = await fetchProjectContacts(supabase, selectedProjectId).catch(() => []);
        if (!cancelled) setProjectContacts(data || []);
      } catch (err) {
        console.error('Site day project contacts failed:', err);
        if (!cancelled) {
          setProjectContacts([]);
        }
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    };

    loadContacts();
    return () => {
      cancelled = true;
    };
  }, [visible, selectedProjectId, supabase]);

  const selectedCrewIds = useMemo(
    () => new Set((sections.crew_on_site || []).map((row) => row.contact_id).filter(Boolean)),
    [sections.crew_on_site],
  );

  const { displayedItems: displayedContacts, expanded: contactsExpanded, setExpanded: setContactsExpanded, hasMore: contactsHasMore, hiddenCount: contactsHiddenCount } =
    useCollapsibleList(projectContacts, []);

  const toggleCrewContact = useCallback(
    (contact) => {
      const id = contact?.id;
      if (!id) return;
      markEdited();
      setSections((prev) => {
        const crew = prev.crew_on_site || [];
        if (crew.some((row) => row.contact_id === id)) {
          return { ...prev, crew_on_site: crew.filter((row) => row.contact_id !== id) };
        }
        return {
          ...prev,
          crew_on_site: [
            ...crew,
            {
              contact_id: id,
              name: contactDisplayName(contact, t('mobile.site_day_crew_member')),
              trade: contactTradeLabel(contact),
              count: 1,
            },
          ],
        };
      });
    },
    [markEdited, t],
  );

  const cycleBlockerCategory = (index) => {
    markEdited();
    setSections((prev) => {
      const blockers = [...(prev.blockers || [])];
      const row = blockers[index];
      if (!row) return prev;
      const idx = BLOCKER_CATEGORIES.indexOf(row.category || 'delay');
      blockers[index] = {
        ...row,
        category: BLOCKER_CATEGORIES[(idx + 1) % BLOCKER_CATEGORIES.length],
      };
      return { ...prev, blockers };
    });
  };

  const pickPhoto = async (source) => {
    if (!selectedProjectId || !supabase) return;
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.error'), t('mobile.issue_photo_permission'));
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: IMAGE_MEDIA_TYPES,
            quality: 0.8,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: IMAGE_MEDIA_TYPES,
            quality: 0.8,
            allowsEditing: false,
          });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploadingPhoto(true);
    try {
      const uploaded = await uploadSiteDayPhotoFromUri(supabase, {
        projectId: selectedProjectId,
        uri: result.assets[0].uri,
      });
      markEdited();
      setPhotos((prev) => [...prev, uploaded]);
      haptics.success();
    } catch (err) {
      console.error('Site day photo upload failed:', err);
      Alert.alert(t('common.error'), t('mobile.site_day_photo_failed'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openPhotoPicker = () => {
    if (uploadingPhoto || loading) return;
    if (!selectedProjectId) return;
    Alert.alert(t('mobile.site_day_add_photo'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: 'Take photo', onPress: () => pickPhoto('camera') },
      { text: 'Choose from library', onPress: () => pickPhoto('library') },
    ]);
  };

  const handlePost = async () => {
    if (!supabase || !userId || !organizationId || !selectedProjectId || !body.trim()) return;

    setLoading(true);
    const structuredPayload = {
      log_date: todayIso(),
      sections,
      photos,
    };
    const streamPayload = {
      project_id: selectedProjectId,
      organization_id: organizationId,
      author_id: userId,
      post_type: 'daily_log',
      title: t('mobile.site_day_post_title'),
      body: body.trim(),
      payload: structuredPayload,
      file_url: photos[0]?.url || null,
      file_name: photos[0]?.file_name || null,
    };

    try {
      await createStreamPost(supabase, streamPayload);
      await recordSiteDayPost(userId);
      Alert.alert(t('common.success'), t('mobile.site_day_posted'));
      haptics.success();
      onPosted?.();
      onClose?.();
    } catch (error) {
      console.error('Site day post failed:', error);
      await enqueueOfflineAction({ type: 'create_stream_post', payload: streamPayload });
      await recordSiteDayPost(userId);
      Alert.alert(t('mobile.offline_queued_title'), t('mobile.site_day_queued'));
      onClose?.();
    } finally {
      setLoading(false);
    }
  };

  const categoryLabel = (cat) => {
    if (cat === 'safety') return t('mobile.site_day_category_safety');
    if (cat === 'quality') return t('mobile.site_day_category_quality');
    return t('mobile.site_day_category_delay');
  };

  const showCompactPassive = passiveReady && !detailsExpanded;

  return (
    <>
      <BottomSheet
        visible={visible}
        title={t('mobile.site_day_title')}
        onClose={onClose}
        primaryLabel={passiveReady ? t('mobile.site_day_post_ready') : t('mobile.site_day_post')}
        onPrimary={handlePost}
        primaryDisabled={loading || drafting || !body.trim() || !selectedProjectId}
        primaryLoading={loading}
        snap="large"
        expandOnFocus
        stickyPrimary
        primaryPlacement="footer"
        closeVariant="minimal"
        closePosition="right"
        testID="site-day-sheet"
      >
        <BottomSheet.Scroll>
          {projectOptions.length > 0 ? (
            <>
              <Text variant="caption" style={styles.label}>
                {t('mobile.site_day_project')}
              </Text>
              <ProjectChipPicker
                projects={projectOptions}
                selectedId={selectedProjectId}
                onSelect={setSelectedProjectId}
                disabled={loading || drafting}
                collapseWhenHidden={visible}
                hideWhenSingle={false}
                testID="site-day-project-picker"
              />
            </>
          ) : null}

          {selectedProjectId && drafting ? (
            <Text variant="bodyMedium" style={styles.drafting}>
              {t('mobile.site_day_drafting')}
            </Text>
          ) : null}

          {selectedProjectId && !drafting ? (
            <>
              {passiveReady ? (
                <View style={styles.readyBanner} testID="site-day-ready-banner">
                  <Ionicons name="checkmark-circle" size={22} color={colors.statusDone} />
                  <View style={styles.readyTextWrap}>
                    <Text variant="bodyMedium" style={styles.readyTitle}>
                      {t('mobile.site_day_ready_title')}
                    </Text>
                    <Text variant="caption" style={styles.readyBody}>
                      {t('mobile.site_day_ready_body')}
                    </Text>
                    {showCompactPassive ? (
                      <PressableWithFade
                        onPress={() => setDetailsExpanded(true)}
                        style={styles.expandLink}
                        testID="site-day-expand-details"
                      >
                        <Text variant="caption" style={styles.expandLinkText}>
                          {t('mobile.site_day_add_details')}
                        </Text>
                      </PressableWithFade>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {!showCompactPassive && (sections.work_completed || []).length > 0 ? (
                <View style={styles.section}>
                  <Text variant="caption" style={styles.sectionLabel}>
                    {t('mobile.site_day_completed')}
                  </Text>
                  {sections.work_completed.map((row, i) => (
                    <Text key={row.task_id || `w-${i}`} variant="body" style={styles.bullet}>
                      • {row.title || t('mobile.site_day_untitled_task')}
                    </Text>
                  ))}
                </View>
              ) : null}

              {!showCompactPassive && (sections.weather || []).length > 0 ? (
                <View style={styles.section}>
                  <Text variant="caption" style={styles.sectionLabel}>
                    {t('mobile.site_day_weather')}
                  </Text>
                  {sections.weather.map((row, i) => (
                    <Text key={row.impact_id || `wx-${i}`} variant="body" style={styles.bullet}>
                      • {row.summary || t('mobile.weather_reason_other')}
                      {row.days_lost ? ` (${row.days_lost}d)` : ''}
                    </Text>
                  ))}
                </View>
              ) : null}

              {!showCompactPassive && (sections.blockers || []).length > 0 ? (
                <View style={styles.section}>
                  <Text variant="caption" style={styles.sectionLabel}>
                    {t('mobile.site_day_blockers')}
                  </Text>
                  {sections.blockers.map((row, i) => (
                    <PressableWithFade
                      key={row.issue_id || `b-${i}`}
                      onPress={() => cycleBlockerCategory(i)}
                      style={styles.blockerRow}
                    >
                      <Text variant="body" style={styles.bullet}>
                        • {row.title}
                      </Text>
                      <Text variant="caption" style={styles.categoryChip}>
                        {categoryLabel(row.category)}
                      </Text>
                    </PressableWithFade>
                  ))}
                  <Text variant="caption" style={styles.hint}>
                    {t('mobile.site_day_blocker_tap_hint')}
                  </Text>
                </View>
              ) : null}

              {!showCompactPassive ? (
              <View style={styles.section}>
                <Text variant="caption" style={styles.sectionLabel}>
                  {t('mobile.site_day_crew')}
                </Text>
                {loadingContacts ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.crewLoader} />
                ) : null}
                {!loadingContacts && projectContacts.length === 0 ? (
                  <Text variant="caption" style={styles.hint}>
                    {t('mobile.site_day_crew_empty')}
                  </Text>
                ) : null}
                {!loadingContacts && projectContacts.length > 0 ? (
                  <>
                    <View style={styles.chipRow}>
                      {displayedContacts.map((contact) => {
                        const selected = selectedCrewIds.has(contact.id);
                        const trade = contactTradeLabel(contact);
                        return (
                          <PressableWithFade
                            key={contactKey(contact)}
                            style={[styles.crewChip, selected && styles.crewChipSelected]}
                            onPress={() => toggleCrewContact(contact)}
                            disabled={loading}
                            testID={`site-day-crew-${contact.id}`}
                          >
                            <Text
                              style={[styles.crewChipText, selected && styles.crewChipTextSelected]}
                              numberOfLines={1}
                            >
                              {contactDisplayName(contact, t('mobile.site_day_crew_member'))}
                            </Text>
                            {trade ? (
                              <Text
                                style={[styles.crewChipSub, selected && styles.crewChipSubSelected]}
                                numberOfLines={1}
                              >
                                {trade}
                              </Text>
                            ) : null}
                          </PressableWithFade>
                        );
                      })}
                    </View>
                    {contactsHasMore ? (
                      <ShowMoreToggle
                        expanded={contactsExpanded}
                        hiddenCount={contactsHiddenCount}
                        onPress={() => setContactsExpanded((value) => !value)}
                        testID="site-day-crew-toggle"
                      />
                    ) : null}
                  </>
                ) : null}
              </View>
              ) : null}

              {!showCompactPassive ? (
              <View style={styles.section}>
                <View style={styles.notesHeader}>
                  <Text variant="caption" style={styles.sectionLabel}>
                    {t('mobile.site_day_notes')}
                  </Text>
                  {voiceAvailable ? (
                    <PressableWithFade
                      onPress={() => toggleVoice(sections.notes || '')}
                      style={[styles.micBtn, listening && styles.micBtnActive]}
                      testID="site-day-voice-mic"
                    >
                      <Ionicons
                        name={listening ? 'mic' : 'mic-outline'}
                        size={20}
                        color={listening ? colors.white : colors.textMuted}
                      />
                    </PressableWithFade>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={sections.notes || ''}
                  onChangeText={updateNotes}
                  multiline
                  editable={!loading}
                  placeholder={t('mobile.site_day_placeholder')}
                  placeholderTextColor={colors.textSubtle}
                />
                {listening ? (
                  <Text variant="caption" style={styles.listeningHint}>
                    {t('mobile.site_day_voice_listening')}
                  </Text>
                ) : null}
              </View>
              ) : null}

              {!showCompactPassive ? (
              <View style={styles.section}>
                <View style={styles.photosHeader}>
                  <Text variant="caption" style={styles.sectionLabel}>
                    {t('mobile.site_day_photos')}
                  </Text>
                  <PressableWithFade
                    onPress={openPhotoPicker}
                    disabled={uploadingPhoto || loading}
                    style={styles.addPhotoBtn}
                    testID="site-day-add-photo"
                  >
                    <Ionicons name="camera-outline" size={18} color={colors.textMuted} />
                    <Text variant="caption" style={styles.addPhotoText}>
                      {t('mobile.site_day_add_photo')}
                    </Text>
                  </PressableWithFade>
                </View>
                {photos.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                    {photos.map((photo, i) => (
                      <Image key={photo.url || i} source={{ uri: photo.url }} style={styles.photoThumb} />
                    ))}
                  </ScrollView>
                ) : null}
              </View>
              ) : null}
            </>
          ) : null}
        </BottomSheet.Scroll>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.md, marginBottom: spacing.sm },
  section: { marginTop: spacing.lg, gap: spacing.xs },
  sectionLabel: {
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  bullet: { lineHeight: 22, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  drafting: { color: colors.textMuted, paddingVertical: spacing.lg },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: '#ECFDF5',
    borderRadius: radius.card,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  readyTextWrap: { flex: 1, gap: 2 },
  readyTitle: { fontWeight: '700', color: '#065F46' },
  readyBody: { color: '#047857' },
  expandLink: { marginTop: spacing.sm },
  expandLinkText: { color: colors.primary, fontWeight: '600' },
  blockerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: touch.minRowHeight,
  },
  categoryChip: {
    color: colors.textMuted,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  hint: { color: colors.textSubtle, marginTop: spacing.xs },
  crewLoader: { marginVertical: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  crewChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    maxWidth: '100%',
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  crewChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  crewChipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  crewChipTextSelected: { color: colors.primary },
  crewChipSub: { fontSize: 12, color: colors.textSubtle, marginTop: 2 },
  crewChipSubSelected: { color: colors.primary },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  micBtn: {
    width: touch.minSize,
    height: touch.minSize,
    borderRadius: touch.minSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  micBtnActive: {
    backgroundColor: colors.primary,
  },
  listeningHint: { color: colors.primary, marginTop: spacing.xs },
  photosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touch.minSize,
    paddingHorizontal: spacing.sm,
  },
  addPhotoText: { fontWeight: '600', color: colors.textMuted },
  photoScroll: { marginTop: spacing.sm },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.card,
    marginRight: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
});
