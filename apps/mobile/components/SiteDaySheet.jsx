import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  createStreamPost,
  fetchProjectIssues,
  fetchProjectContacts,
  listWeatherImpactsForProject,
  buildSiteDaySections,
  isPassiveSiteDayReady,
  todayIso,
  wasCompletedToday,
  weatherImpactIsToday,
} from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import { ProjectChipPicker } from './ui/ProjectPicker';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import PhotoStatusThumb from './PhotoStatusThumb';
import { colors, spacing, radius, touch } from '../theme';
import { enqueueOfflineAction } from '../utils/offlineQueue';
import { uploadSiteDayPhotoFromUri } from '../utils/uploadSiteDayPhoto';
import { alertPhotoUploadFailed } from '../utils/photoUploadFeedback';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { recordSiteDayPost } from '../utils/siteDayStreak';
import { signalReviewPromptOpportunity } from '../utils/reviewPromptEvents';
import { useHaptics } from '../hooks/useHaptics';
import { useCollapsibleList, ShowMoreToggle } from './ui/CollapsibleList';
import { pickPhotos } from '../utils/pickPhotos';
import { loadFormDraft, saveFormDraft, clearFormDraft } from '../utils/formDrafts';
import {
  runAfterInteractionsAsync,
  useAfterSheetDismiss,
} from '../utils/runAfterSheetDismiss';

const BLOCKER_CATEGORIES = ['delay', 'safety', 'quality'];

function newLocalPhotoId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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
  const { scheduleAfterDismiss, handleDismissed, clearPending } = useAfterSheetDismiss();
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [sections, setSections] = useState(emptySections);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [userEdited, setUserEdited] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pickerSuspended, setPickerSuspended] = useState(false);
  const [projectContacts, setProjectContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const initialSnapshotRef = useRef(null);
  const pickerGenerationRef = useRef(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const projectOptions = useMemo(() => projects.filter((p) => p?.id), [projects]);

  const note = String(sections.notes || '').trim();
  const hasSectionContent =
    (sections.work_completed?.length || 0) > 0 ||
    (sections.weather?.length || 0) > 0 ||
    (sections.blockers?.length || 0) > 0 ||
    (sections.crew_on_site?.length || 0) > 0 ||
    photos.length > 0 ||
    Boolean(note);
  const submitBody = note || t('mobile.site_day_heading');

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
    let cancelled = false;
    loadFormDraft('site_day', 'last').then((draft) => {
      if (cancelled || !draft?.data?.selectedProjectId) return;
      const stillValid = projectOptions.some((p) => p.id === draft.data.selectedProjectId);
      if (stillValid) setSelectedProjectId(draft.data.selectedProjectId);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, projectOptions]);

  useEffect(() => {
    if (!visible || !selectedProjectId || !supabase) return;

    let cancelled = false;
    const loadDraft = async () => {
      setDrafting(true);
      try {
        const projectTasks = tasks.filter((task) => task.project_id === selectedProjectId);
        const completedToday = projectTasks.filter((task) => wasCompletedToday(task));

        const [weatherImpacts, issuesResult, savedDraft] = await Promise.all([
          listWeatherImpactsForProject(supabase, selectedProjectId, organizationId).catch(() => []),
          fetchProjectIssues(supabase, selectedProjectId, { statusFilter: 'open', limit: 10 }).catch(
            () => ({ issues: [] }),
          ),
          loadFormDraft('site_day', selectedProjectId),
        ]);

        const todayWeather = (weatherImpacts || []).filter((impact) => weatherImpactIsToday(impact));

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
          const savedNotes = savedDraft?.data?.notes;
          if (savedNotes && String(savedNotes).trim()) {
            setSections({ ...built, notes: savedNotes });
            setUserEdited(true);
          } else {
            setSections(built);
            setUserEdited(false);
          }
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
    if (!visible || !selectedProjectId) return undefined;
    const handle = setTimeout(() => {
      const notes = String(sections.notes || '').trim();
      if (!notes && !userEdited) {
        clearFormDraft('site_day', selectedProjectId);
        return;
      }
      saveFormDraft('site_day', selectedProjectId, {
        notes: sections.notes || '',
        selectedProjectId,
      });
      saveFormDraft('site_day', 'last', { selectedProjectId });
    }, 400);
    return () => clearTimeout(handle);
  }, [visible, selectedProjectId, sections.notes, userEdited]);

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

  const pickPhoto = async (source, { retryLocalId, retryUri } = {}) => {
    if (!visibleRef.current || !selectedProjectId || !supabase) {
      setPickerSuspended(false);
      return;
    }
    const generation = ++pickerGenerationRef.current;
    try {
      let assets;
      if (retryUri) {
        assets = [{ uri: retryUri, localId: retryLocalId }];
      } else {
        try {
          assets = await pickPhotos({ mode: source, t });
        } catch (error) {
          if (error?.code === 'CAMERA_PERMISSION_DENIED') {
            Alert.alert(t('common.error'), t('mobile.issue_photo_permission'));
            return;
          }
          throw error;
        }
      }

      if (!visibleRef.current || generation !== pickerGenerationRef.current) return;
      if (!assets?.length) return;

      markEdited();
      setUploadingPhoto(true);

      const queued = assets.map((asset) => ({
        localId: asset.localId || newLocalPhotoId(),
        localUri: asset.uri,
      }));

      setPhotos((prev) => {
        const retryIds = new Set(queued.map((q) => q.localId));
        const without = prev.filter((p) => !retryIds.has(p.localId));
        return [
          ...without,
          ...queued.map(({ localId, localUri }) => ({
            localId,
            localUri,
            url: null,
            file_name: null,
            status: 'uploading',
          })),
        ];
      });

      const failures = [];
      for (const item of queued) {
        if (!visibleRef.current || generation !== pickerGenerationRef.current) return;
        try {
          const uploaded = await uploadSiteDayPhotoFromUri(supabase, {
            projectId: selectedProjectId,
            uri: item.localUri,
          });
          if (!visibleRef.current || generation !== pickerGenerationRef.current) return;
          setPhotos((prev) =>
            prev.map((p) =>
              p.localId === item.localId
                ? {
                    ...p,
                    ...uploaded,
                    localUri: item.localUri,
                    status: 'ready',
                  }
                : p,
            ),
          );
          haptics.success();
        } catch (error) {
          console.error('Site day photo upload failed:', error);
          if (!visibleRef.current || generation !== pickerGenerationRef.current) return;
          setPhotos((prev) =>
            prev.map((p) =>
              p.localId === item.localId ? { ...p, status: 'failed' } : p,
            ),
          );
          failures.push({ ...item, error });
        }
      }

      if (failures.length === 1) {
        const failed = failures[0];
        alertPhotoUploadFailed({
          t,
          message: failed.error?.message || t('mobile.site_day_photo_failed'),
          onRetry: () => {
            void pickPhoto(source, {
              retryLocalId: failed.localId,
              retryUri: failed.localUri,
            });
          },
          onRetake: () => {
            setPhotos((prev) => prev.filter((p) => p.localId !== failed.localId));
            void runAfterInteractionsAsync(() => pickPhoto(source));
          },
        });
      } else if (failures.length > 1) {
        alertPhotoUploadFailed({
          t,
          message: t('mobile.site_day_photos_failed', {
            defaultValue: '{{count}} photos did not upload. Tap a thumbnail to retry.',
            count: failures.length,
          }),
          onRetry: () => {
            void pickPhoto(source, {
              retryLocalId: failures[0].localId,
              retryUri: failures[0].localUri,
            });
          },
          onRetake: () => {
            const failedIds = new Set(failures.map((f) => f.localId));
            setPhotos((prev) => prev.filter((p) => !failedIds.has(p.localId)));
            void runAfterInteractionsAsync(() => pickPhoto(source));
          },
        });
      }
    } catch (error) {
      console.error('Site day photo pick failed:', error);
      alertPhotoUploadFailed({
        t,
        message: error?.message || t('mobile.site_day_photo_failed'),
        onRetake: () => {
          void runAfterInteractionsAsync(() => pickPhoto(source));
        },
      });
    } finally {
      setUploadingPhoto(false);
      if (generation === pickerGenerationRef.current) setPickerSuspended(false);
    }
  };

  const openPhotoPicker = () => {
    if (uploadingPhoto || loading || pickerSuspended) return;
    if (!selectedProjectId) return;
    scheduleAfterDismiss(() => {
      let sourceSelected = false;
      Alert.alert(t('mobile.site_day_add_photo', { defaultValue: 'Add photos' }), undefined, [
        {
          text: t('common.cancel'),
          style: 'cancel',
          onPress: () => setPickerSuspended(false),
        },
        {
          text: t('mobile.photo_take', { defaultValue: 'Take photos' }),
          onPress: () => {
            sourceSelected = true;
            void runAfterInteractionsAsync(() => pickPhoto('camera'));
          },
        },
        {
          text: t('mobile.photo_library', { defaultValue: 'Choose from library' }),
          onPress: () => {
            sourceSelected = true;
            void runAfterInteractionsAsync(() => pickPhoto('library'));
          },
        },
      ], {
        cancelable: true,
        onDismiss: () => {
          if (!sourceSelected) setPickerSuspended(false);
        },
      });
    }, () => setPickerSuspended(true));
  };

  const handlePost = async () => {
    if (!supabase || !userId || !organizationId || !selectedProjectId || !hasSectionContent) return;

    if (photos.some((p) => p.status === 'uploading')) {
      Alert.alert(
        t('mobile.photo_still_uploading_title', { defaultValue: 'Photo still uploading' }),
        t('mobile.photo_still_uploading_message', {
          defaultValue: 'Wait a moment for the photo to finish, then post.',
        }),
      );
      return;
    }

    const readyPhotos = photos
      .filter((p) => p.status === 'ready' && p.url)
      .map(({ url, caption, file_name }) => ({ url, caption: caption || '', file_name }));

    setLoading(true);
    const structuredPayload = {
      log_date: todayIso(),
      sections,
      photos: readyPhotos,
    };
    const streamPayload = {
      project_id: selectedProjectId,
      organization_id: organizationId,
      author_id: userId,
      post_type: 'daily_log',
      title: t('mobile.site_day_post_title'),
      body: submitBody,
      payload: structuredPayload,
      file_url: readyPhotos[0]?.url || null,
      file_name: readyPhotos[0]?.file_name || null,
    };

    try {
      await createStreamPost(supabase, streamPayload);
      await recordSiteDayPost(userId);
      signalReviewPromptOpportunity();
      Alert.alert(t('common.success'), t('mobile.site_day_posted'));
      haptics.success();
      await clearFormDraft('site_day', selectedProjectId);
      await clearFormDraft('site_day', 'last');
      onPosted?.();
      onClose?.();
    } catch (error) {
      console.error('Site day post failed:', error);
      await enqueueOfflineAction({ type: 'create_stream_post', payload: streamPayload });
      await recordSiteDayPost(userId);
      await clearFormDraft('site_day', selectedProjectId);
      await clearFormDraft('site_day', 'last');
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
  const sheetVisible = visible && !pickerSuspended;

  useEffect(() => {
    if (!visible) {
      pickerGenerationRef.current += 1;
      setPickerSuspended(false);
      clearPending();
      return;
    }
    // Always clear a stuck suspend when the sheet is (re)opened — otherwise
    // sheetVisible stays false and project chips never receive presses.
    setPickerSuspended(false);
    clearPending();
  }, [visible, clearPending]);

  useEffect(() => {
    if (!pickerSuspended) return undefined;
    // Failsafe: never leave the sheet unmounted forever after a native picker handoff.
    const timer = setTimeout(() => {
      setPickerSuspended(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, [pickerSuspended]);

  return (
    <>
      <BottomSheet
        visible={sheetVisible}
        title={t('mobile.site_day_title')}
        onClose={onClose}
        onDismissed={handleDismissed}
        dismissWithoutAnimation={pickerSuspended}
        primaryLabel={passiveReady ? t('mobile.site_day_post_ready') : t('mobile.site_day_post')}
        onPrimary={handlePost}
        primaryDisabled={loading || drafting || !hasSectionContent || !selectedProjectId || pickerSuspended}
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
                disabled={loading}
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
                <BottomSheet.Input
                  style={[styles.input, styles.textArea]}
                  value={sections.notes || ''}
                  onChangeText={updateNotes}
                  multiline
                  editable={!loading}
                  placeholder={t('mobile.site_day_placeholder')}
                  placeholderTextColor={colors.textSubtle}
                  testID="site-day-notes"
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
                      <PhotoStatusThumb
                        key={photo.localId || photo.url || i}
                        uri={photo.localUri || photo.url}
                        status={photo.status === 'uploading' ? 'uploading' : photo.status === 'failed' ? 'failed' : 'ready'}
                        onRetry={() => {
                          void pickPhoto('camera', {
                            retryLocalId: photo.localId,
                            retryUri: photo.localUri,
                          });
                        }}
                        testID={`site-day-photo-${i}`}
                        accessibilityLabel={t('mobile.site_day_photos')}
                      />
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
});
