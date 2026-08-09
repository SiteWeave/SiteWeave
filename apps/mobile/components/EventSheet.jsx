import { View, StyleSheet, Alert, Share } from 'react-native';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { createCalendarEvent, createTask, fetchUserProjectsWithProgress, diffNewAttendeeEmails, formatAttendeeEmails, notifyCalendarInvitees, parseAttendeeEmails, resolveOrganizerDisplayName } from '@siteweave/core-logic';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from './ui/BottomSheet';
import { ProjectChipPicker } from './ui/ProjectPicker';
import DateField from './ui/DateField';
import TimeField from './ui/TimeField';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import Button from './ui/Button';
import { filterByOrganizationId } from '../utils/orgScope';
import { enqueueOfflineAction, processOfflineQueue } from '../utils/offlineQueue';
import { buildOfflineHandlers } from '../utils/offlineHandlers';
import { formatEventShareText } from '../utils/formatEventShare';
import {
  toLocalDateIso,
  formatLocalTime,
  parseTimeOnDate,
  ensureEndAfterStart,
  roundTimeToInterval,
} from '../utils/dateHelpers';
import { colors, spacing, touch } from '../theme';
import { useHaptics } from '../hooks/useHaptics';
import EventAttendeePicker from './EventAttendeePicker';
import { useAfterSheetDismiss } from '../utils/runAfterSheetDismiss';

export default function EventSheet({
  visible,
  onClose,
  selectedDate,
  onEventCreated,
  eventToEdit = null,
  onEventDeleted,
}) {
  const { t } = useTranslation();
  const { user, supabase, activeOrganization, syncPulse } = useAuth();
  const haptics = useHaptics();
  const { scheduleAfterDismiss, handleDismissed, clearPending } = useAfterSheetDismiss();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [category, setCategory] = useState('meeting');
  const [isAllDay, setIsAllDay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createFollowUpTask, setCreateFollowUpTask] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [attendeeEmails, setAttendeeEmails] = useState([]);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [shareSuspended, setShareSuspended] = useState(false);

  const isEditing = Boolean(eventToEdit?.id);

  const canSave = useMemo(
    () => Boolean(title.trim() && eventDate && user && supabase),
    [title, eventDate, user, supabase],
  );

  const categories = [
    { value: 'meeting', label: t('mobile.event_category_meeting') },
    { value: 'site-visit', label: t('mobile.event_category_site_visit') },
    { value: 'progress-review', label: t('mobile.event_category_progress') },
    { value: 'other', label: t('mobile.event_category_other') },
  ];

  const buildEventTimes = useCallback(() => {
    if (!eventDate) return null;
    if (isAllDay) {
      const start = parseTimeOnDate(eventDate, '00:00');
      const end = parseTimeOnDate(eventDate, '23:59');
      end.setSeconds(59, 999);
      return { startDateTime: start.toISOString(), endDateTime: end.toISOString(), dateStr: eventDate };
    }
    const adjustedEnd = ensureEndAfterStart(startTime, endTime, 60);
    const start = parseTimeOnDate(eventDate, startTime);
    const end = parseTimeOnDate(eventDate, adjustedEnd);
    return { startDateTime: start.toISOString(), endDateTime: end.toISOString(), dateStr: eventDate };
  }, [eventDate, isAllDay, startTime, endTime]);

  const loadProjects = async () => {
    if (!supabase || !user) return;
    try {
      const data = await fetchUserProjectsWithProgress(supabase, user.id);
      const scoped =
        activeOrganization?.id != null
          ? filterByOrganizationId(data || [], activeOrganization.id)
          : data || [];
      setProjects(scoped);
    } catch (error) {
      console.error('Error loading projects for event sheet:', error);
    }
  };

  const flushOfflineEvents = async () => {
    if (!supabase) return;
    await processOfflineQueue(buildOfflineHandlers(supabase));
  };

  useEffect(() => {
    if (!visible) return;
    loadProjects();
    flushOfflineEvents();
  }, [visible, activeOrganization?.id]);

  useEffect(() => {
    flushOfflineEvents();
  }, [syncPulse]);

  useEffect(() => {
    if (!visible) return;
    if (eventToEdit) {
      setTitle(eventToEdit.title || '');
      setDescription(eventToEdit.description || '');
      setLocation(eventToEdit.location || '');
      setCategory(eventToEdit.category || 'meeting');
      setIsAllDay(Boolean(eventToEdit.is_all_day));
      const start = eventToEdit.start_time ? new Date(eventToEdit.start_time) : selectedDate || new Date();
      const end = eventToEdit.end_time ? new Date(eventToEdit.end_time) : start;
      setEventDate(toLocalDateIso(start));
      setStartTime(formatLocalTime(roundTimeToInterval(start, 15)));
      setEndTime(formatLocalTime(roundTimeToInterval(end, 15)));
      setProjectId(eventToEdit.project_id || null);
      setAttendeeEmails(parseAttendeeEmails(eventToEdit.attendees));
      setShowMoreOptions(true);
    } else {
      setTitle('');
      setDescription('');
      setLocation('');
      setEventDate(toLocalDateIso(selectedDate || new Date()));
      setStartTime('09:00');
      setEndTime('10:00');
      setCategory('meeting');
      setIsAllDay(false);
      setCreateFollowUpTask(false);
      setProjectId(null);
      setAttendeeEmails([]);
      setShowMoreOptions(false);
      setShowAdvancedOptions(false);
    }
  }, [visible, eventToEdit?.id, selectedDate]);

  const handleStartTimeChange = (nextStart) => {
    setStartTime(nextStart);
    setEndTime((prev) => ensureEndAfterStart(nextStart, prev, 60));
  };

  const handleSave = async () => {
    if (!canSave) return;
    if (createFollowUpTask && !projectId) {
      Alert.alert(t('common.error'), t('mobile.event_follow_up_project_required'));
      return;
    }
    const times = buildEventTimes();
    if (!times) return;

    try {
      haptics.medium();
      setLoading(true);
      const attendeesValue = formatAttendeeEmails(attendeeEmails);
      const previousAttendees = eventToEdit?.attendees;
      const newInviteEmails = diffNewAttendeeEmails(previousAttendees, attendeesValue);
      const eventData = {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_time: times.startDateTime,
        end_time: times.endDateTime,
        category,
        is_all_day: isAllDay,
        user_id: user.id,
        organization_id: activeOrganization?.id || null,
        project_id: projectId || null,
        attendees: attendeesValue || null,
      };

      let savedEventId = eventToEdit?.id || null;

      if (eventToEdit?.id) {
        const { error: updateError } = await supabase
          .from('calendar_events')
          .update(eventData)
          .eq('id', eventToEdit.id);
        if (updateError) throw updateError;
      } else {
        const created = await createCalendarEvent(supabase, eventData);
        savedEventId = created?.id || null;
      }

      if (newInviteEmails.length > 0 && savedEventId) {
        try {
          const organizerName = await resolveOrganizerDisplayName(supabase, {
            userId: user.id,
            userEmail: user.email,
            fallback: t('calendar.team_member_fallback'),
          });
          await notifyCalendarInvitees(supabase, {
            eventId: savedEventId,
            newAttendeeEmails: newInviteEmails,
            organizerName,
          });
        } catch (notifyError) {
          console.warn('Calendar invite notification failed:', notifyError);
        }
      }

      if (createFollowUpTask && projectId) {
        await createTask(supabase, {
          text: `Event follow-up: ${title.trim()}`,
          project_id: projectId,
          organization_id: activeOrganization?.id || null,
          due_date: times.dateStr,
          priority: 'Medium',
          completed: false,
        });
      }

      haptics.success();
      if (createFollowUpTask && projectId) {
        Alert.alert(t('common.success'), t('mobile.event_follow_up_created'));
      }
      onEventCreated?.();
      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
      haptics.error();
      const times = buildEventTimes();
      const attendeesValue = formatAttendeeEmails(attendeeEmails);
      const newInviteEmails = diffNewAttendeeEmails(eventToEdit?.attendees, attendeesValue);
      const offlinePayload = {
        ...(eventToEdit?.id ? { id: eventToEdit.id } : {}),
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_time: times?.startDateTime,
        end_time: times?.endDateTime,
        category,
        is_all_day: isAllDay,
        user_id: user.id,
        organization_id: activeOrganization?.id || null,
        project_id: projectId || null,
        attendees: attendeesValue || null,
        _notifyEmails: newInviteEmails,
        _organizerName: user.email?.split('@')[0] || 'Team member',
      };
      await enqueueOfflineAction({
        type: eventToEdit?.id ? 'update_calendar_event' : 'create_calendar_event',
        payload: offlinePayload,
      });
      Alert.alert(t('mobile.offline_queued_title'), t('mobile.offline_event_queued'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!eventToEdit?.id || loading) return;
    Alert.alert(t('mobile.event_delete_title'), t('mobile.event_delete_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            const { error } = await supabase.from('calendar_events').delete().eq('id', eventToEdit.id);
            if (error) throw error;
            onEventDeleted?.();
            onClose();
          } catch (error) {
            await enqueueOfflineAction({
              type: 'delete_calendar_event',
              payload: { id: eventToEdit.id },
            });
            Alert.alert(t('mobile.offline_queued_title'), t('mobile.offline_event_queued'));
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleShare = () => {
    const times = buildEventTimes();
    const message = formatEventShareText({
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      start_time: times?.startDateTime,
      end_time: times?.endDateTime,
      is_all_day: isAllDay,
    });
    scheduleAfterDismiss(async () => {
      try {
        await Share.share({ message, title: title.trim() || t('mobile.calendar_share_title') });
      } catch {
        // user dismissed
      } finally {
        setShareSuspended(false);
      }
    }, () => setShareSuspended(true));
  };

  useEffect(() => {
    if (!visible) {
      setShareSuspended(false);
      clearPending();
    }
  }, [visible, clearPending]);

  return (
    <BottomSheet
      visible={visible && !shareSuspended}
      title={eventToEdit ? t('mobile.event_edit_title') : t('mobile.event_new_title')}
      onClose={onClose}
      onDismissed={handleDismissed}
      dismissWithoutAnimation={shareSuspended}
      primaryLabel={eventToEdit ? t('common.update') : t('common.save')}
      onPrimary={handleSave}
      primaryDisabled={!canSave || loading}
      primaryLoading={loading}
      snap="medium"
      maxSnap="fullscreen"
      expandOnFocus
      expandOnFocusSnap="large"
      allowExpand
      expandDragThreshold={-45}
      expandVelocityThreshold={-0.55}
      stickyPrimary
      primaryPlacement="footer"
      closeVariant="minimal"
      closePosition="right"
      testID="event-sheet"
    >
      <BottomSheet.Scroll>
        <Text variant="caption" style={styles.label}>
          {t('mobile.event_title_label')}
        </Text>
        <BottomSheet.Input
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('mobile.event_title_placeholder')}
          placeholderTextColor={colors.textSubtle}
          editable={!loading}
        />

        <DateField
          label={t('mobile.event_date_label')}
          value={eventDate}
          onChange={setEventDate}
          disabled={loading}
          testID="event-date"
        />

        <PressableWithFade
          style={styles.checkboxRow}
          onPress={() => !loading && setIsAllDay(!isAllDay)}
          disabled={loading}
        >
          <Ionicons
            name={isAllDay ? 'checkbox' : 'square-outline'}
            size={24}
            color={isAllDay ? colors.primary : colors.textMuted}
          />
          <Text variant="bodyMedium">{t('mobile.event_all_day')}</Text>
        </PressableWithFade>

        {!isAllDay ? (
          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <TimeField
                label={t('mobile.event_start_time')}
                value={startTime}
                onChange={handleStartTimeChange}
                dateIso={eventDate}
                disabled={loading || !eventDate}
              />
            </View>
            <View style={styles.timeCol}>
              <TimeField
                label={t('mobile.event_end_time')}
                value={endTime}
                onChange={setEndTime}
                dateIso={eventDate}
                disabled={loading || !eventDate}
              />
            </View>
          </View>
        ) : null}

        <Text variant="caption" style={styles.label}>
          {t('mobile.event_category_label')}
        </Text>
        <View style={styles.chipRow}>
          {categories.map((cat) => (
            <PressableWithFade
              key={cat.value}
              style={[styles.chip, category === cat.value && styles.chipActive]}
              onPress={() => setCategory(cat.value)}
              disabled={loading}
            >
              <Text style={[styles.chipText, category === cat.value && styles.chipTextActive]}>
                {cat.label}
              </Text>
            </PressableWithFade>
          ))}
        </View>

        {!isEditing ? (
          <PressableWithFade
            style={styles.moreToggle}
            onPress={() => setShowMoreOptions((v) => !v)}
            disabled={loading}
            testID="event-more-options"
          >
            <Text variant="bodyMedium" style={styles.moreToggleText}>
              {showMoreOptions ? t('mobile.event_fewer_options') : t('mobile.event_more_options')}
            </Text>
            <Ionicons
              name={showMoreOptions ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.primary}
            />
          </PressableWithFade>
        ) : null}

        {(isEditing || showMoreOptions) ? (
          <>
            <Text variant="caption" style={styles.label}>
              {t('mobile.event_location_label')}
            </Text>
            <BottomSheet.Input
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder={t('mobile.event_location_placeholder')}
              placeholderTextColor={colors.textSubtle}
              editable={!loading}
            />

            {activeOrganization?.id ? (
              <>
                <Text variant="caption" style={styles.label}>
                  {t('mobile.event_invite_team')}
                </Text>
                <EventAttendeePicker
                  supabase={supabase}
                  organizationId={activeOrganization?.id}
                  projectId={projectId}
                  selectedEmails={attendeeEmails}
                  onChange={setAttendeeEmails}
                  disabled={loading}
                  visible={visible}
                />
              </>
            ) : null}

            <Text variant="caption" style={styles.label}>
              {t('mobile.event_description_label')}
            </Text>
            <BottomSheet.Input
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder={t('mobile.event_description_placeholder')}
              placeholderTextColor={colors.textSubtle}
              editable={!loading}
            />

            <Text variant="caption" style={styles.label}>
              {t('mobile.event_project_label')}
            </Text>
            {projects.length === 0 ? (
              <Text variant="bodyMedium" style={styles.helperText}>
                {t('mobile.event_no_projects')}
              </Text>
            ) : (
              <ProjectChipPicker
                projects={projects}
                selectedId={projectId}
                onSelect={(id) => {
                  setProjectId(id);
                  if (!id) {
                    setCreateFollowUpTask(false);
                    setShowAdvancedOptions(false);
                  }
                }}
                disabled={loading}
                collapseWhenHidden={visible}
                hideWhenSingle={false}
                testID="event-project-picker"
              />
            )}

            {!isEditing && projectId ? (
              <>
                <PressableWithFade
                  style={styles.moreToggle}
                  onPress={() => setShowAdvancedOptions((v) => !v)}
                  disabled={loading}
                  testID="event-advanced-options"
                >
                  <Text variant="bodyMedium" style={styles.moreToggleText}>
                    {showAdvancedOptions
                      ? t('mobile.event_hide_advanced')
                      : t('mobile.event_advanced_options')}
                  </Text>
                  <Ionicons
                    name={showAdvancedOptions ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.primary}
                  />
                </PressableWithFade>

                {showAdvancedOptions ? (
                  <>
                    <PressableWithFade
                      style={styles.checkboxRow}
                      onPress={() => !loading && setCreateFollowUpTask((v) => !v)}
                      disabled={loading}
                    >
                      <Ionicons
                        name={createFollowUpTask ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={createFollowUpTask ? colors.primary : colors.textMuted}
                      />
                      <Text variant="bodyMedium">{t('mobile.event_create_task')}</Text>
                    </PressableWithFade>
                    {createFollowUpTask ? (
                      <Text variant="caption" style={styles.helperText}>
                        {t('mobile.event_follow_up_hint')}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {eventToEdit ? (
          <View style={styles.footerActions}>
            <Button label={t('mobile.event_share_details')} variant="secondary" onPress={handleShare} disabled={loading} />
            <Button label={t('common.delete')} variant="secondary" onPress={handleDelete} disabled={loading} />
          </View>
        ) : null}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.md, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 17,
    minHeight: touch.minSize,
    color: colors.text,
    textAlignVertical: 'center',
    marginBottom: spacing.md,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touch.minSize, marginTop: spacing.md },
  timeRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  timeCol: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    minHeight: touch.minSize - 8,
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  helperText: { color: colors.textMuted, marginBottom: spacing.sm },
  footerActions: { gap: spacing.sm, marginTop: spacing.lg },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  moreToggleText: { color: colors.primary, fontWeight: '600' },
});
