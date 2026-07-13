import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Switch, Alert, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  createProgressReportSchedule,
  updateProgressReportSchedule,
  updateRecipients,
  fetchEventInviteContacts,
} from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import ContactSuggestionPicker from './ui/ContactSuggestionPicker';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { SkeletonList } from './ui/Skeleton';
import {
  parseProgressReportEmailsText,
  recipientsToEmailText,
} from '../utils/progressReportRecipients';
import { colors, spacing, touch } from '../theme';

const FREQUENCIES = ['manual', 'weekly', 'monthly'];
const WEEK_DAYS = [
  { value: 0, labelKey: 'day_sunday' },
  { value: 1, labelKey: 'day_monday' },
  { value: 2, labelKey: 'day_tuesday' },
  { value: 3, labelKey: 'day_wednesday' },
  { value: 4, labelKey: 'day_thursday' },
  { value: 5, labelKey: 'day_friday' },
  { value: 6, labelKey: 'day_saturday' },
];
const MONTHLY_DAYS = [
  { value: 1, labelKey: 'monthly_1st' },
  { value: 15, labelKey: 'monthly_15th' },
  { value: -1, labelKey: 'monthly_last' },
];
const SECTION_KEYS = [
  { key: 'status_changes', labelKey: 'section_status_changes' },
  { key: 'task_completion', labelKey: 'section_task_completion' },
  { key: 'phase_changes', labelKey: 'section_phase_changes' },
];
const DETAIL_KEYS = [
  { key: 'include_daily_site_logs', labelKey: 'toggle_daily_site_logs' },
];
const builderKey = (suffix) => `progressReports.builder.${suffix}`;

function getDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

const DEFAULT_SECTIONS = {
  status_changes: true,
  task_completion: true,
  phase_changes: true,
  executive_summary: false,
  include_daily_site_logs: false,
};

export default function ProgressReportFormSheet({
  visible,
  onClose,
  onSaved,
  supabase,
  organizationId,
  projectId,
  projectName,
  userId,
  scheduleId = null,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [audience, setAudience] = useState('standard');
  const [frequency, setFrequency] = useState('manual');
  const [frequencyValue, setFrequencyValue] = useState(1);
  const [recipientText, setRecipientText] = useState('');
  const [recipientEmails, setRecipientEmails] = useState([]);
  const [emailInput, setEmailInput] = useState('');
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [sections, setSections] = useState({ ...DEFAULT_SECTIONS });

  const frequencyOptions = useMemo(
    () =>
      FREQUENCIES.map((value) => ({
        value,
        label: t(builderKey(`frequency_${value === 'bi-weekly' ? 'biweekly' : value}`)),
      })),
    [t],
  );

  const audienceOptions = useMemo(
    () => [
      { value: 'standard', label: t(builderKey('type_standard')) },
      { value: 'executive', label: t(builderKey('type_executive')) },
    ],
    [t],
  );

  const resetForm = () => {
    setName(projectName ? t(builderKey('default_report_name'), { project: projectName }) : '');
    setAudience('standard');
    setFrequency('manual');
    setFrequencyValue(1);
    setRecipientText('');
    setRecipientEmails([]);
    setEmailInput('');
    setWizardStep(1);
    setIsActive(true);
    setSections({ ...DEFAULT_SECTIONS });
  };

  const loadSchedule = async () => {
    if (!supabase || !scheduleId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('progress_report_schedules')
        .select('*, progress_report_recipients(*)')
        .eq('id', scheduleId)
        .single();
      if (error) throw error;

      const mappedAudience = data.report_audience_type === 'executive' ? 'executive' : 'standard';
      const base = data.report_sections || {};
      setName(data.name || '');
      setAudience(mappedAudience);
      setFrequency(data.frequency || 'manual');
      const fv = data.frequency_value;
      if (data.frequency === 'weekly') {
        setFrequencyValue(fv != null && fv <= 6 ? fv : 1);
      } else if (data.frequency === 'monthly') {
        setFrequencyValue(fv === 15 ? 15 : fv === -1 || fv === 31 ? -1 : 1);
      } else {
        setFrequencyValue(1);
      }
      setIsActive(Boolean(data.is_active));
      setSections({
        ...DEFAULT_SECTIONS,
        ...base,
      });
      const existingRecipientsText = recipientsToEmailText(data.progress_report_recipients || []);
      setRecipientText(existingRecipientsText);
      setRecipientEmails(parseProgressReportEmailsText(existingRecipientsText).map((entry) => entry.email));
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('mobile.progress_reports_form_save_error'));
      onClose?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    if (scheduleId) {
      loadSchedule();
      return;
    }
    resetForm();
  }, [visible, scheduleId, projectName]);

  useEffect(() => {
    if (!visible || !supabase || !organizationId) return;
    let cancelled = false;
    (async () => {
      setLoadingContacts(true);
      try {
        const data = await fetchEventInviteContacts(supabase, {
          organizationId,
          projectId: projectId || null,
        });
        if (!cancelled) setContacts(data || []);
      } catch {
        if (!cancelled) setContacts([]);
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, supabase, organizationId, projectId]);

  const addRecipientEmail = (rawEmail) => {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    setRecipientEmails((prev) => {
      if (prev.includes(email)) return prev;
      const next = [...prev, email];
      setRecipientText(next.join(', '));
      return next;
    });
    setEmailInput('');
    return true;
  };

  const handleAddEmailFromInput = () => {
    const parsed = parseProgressReportEmailsText(emailInput);
    if (parsed.length > 0) {
      let added = false;
      parsed.forEach((entry) => {
        if (addRecipientEmail(entry.email)) added = true;
      });
      if (added) Keyboard.dismiss();
      return;
    }
    if (addRecipientEmail(emailInput)) {
      Keyboard.dismiss();
    } else if (emailInput.trim()) {
      Alert.alert(t('common.error'), t('mobile.progress_reports_form_recipients_invalid'));
    }
  };

  const handleSelectContact = (contact) => {
    if (contact?.email) addRecipientEmail(contact.email);
  };

  const toggleSection = (key) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFrequencyChange = (value) => {
    setFrequency(value);
    if (value === 'weekly') {
      setFrequencyValue((prev) => (prev != null && prev <= 6 ? prev : 1));
    } else if (value === 'monthly') {
      setFrequencyValue((prev) => (prev === 15 ? 15 : prev === -1 ? -1 : 1));
    }
  };

  const handleSave = async () => {
    if (!supabase || !organizationId || !userId) return;
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('mobile.progress_reports_form_name_required'));
      return;
    }
    const recipients = recipientEmails.length
      ? recipientEmails.map((email) => ({ email, recipient_type: 'to' }))
      : parseProgressReportEmailsText(recipientText);
    if (recipients.length === 0) {
      Alert.alert(t('common.error'), t('mobile.progress_reports_form_recipients_required'));
      return;
    }

    setSaving(true);
    try {
      const dbAudience = audience === 'executive' ? 'executive' : 'client';
      const templateType = audience === 'executive' ? 'executive_summary' : 'client_standard';
      const scheduleData = {
        name: name.trim(),
        report_audience_type: dbAudience,
        template_type: templateType,
        organization_id: organizationId,
        project_id: projectId,
        frequency,
        frequency_value:
          frequency === 'weekly' || frequency === 'monthly' ? frequencyValue : null,
        is_active: isActive,
        requires_approval: false,
        include_branding: true,
        send_hour: 8,
        send_timezone: getDeviceTimezone(),
        report_sections: {
          ...sections,
          executive_summary: audience === 'executive',
        },
        created_by_user_id: userId,
      };

      let saved;
      if (scheduleId) {
        saved = await updateProgressReportSchedule(supabase, scheduleId, scheduleData);
      } else {
        saved = await createProgressReportSchedule(supabase, scheduleData);
      }
      await updateRecipients(supabase, saved.id, recipients);
      onSaved?.();
      onClose?.();
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('mobile.progress_reports_form_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handlePrimary = () => {
    if (wizardStep === 1) {
      if (!name.trim()) {
        Alert.alert(t('common.error'), t('mobile.progress_reports_form_name_required'));
        return;
      }
      setWizardStep(2);
      return;
    }
    handleSave();
  };

  return (
    <BottomSheet
      visible={visible}
      title={
        scheduleId
          ? t('mobile.progress_reports_form_title_edit')
          : t('mobile.progress_reports_form_title_create')
      }
      onClose={onClose}
      primaryLabel={wizardStep === 1 ? t('common.next') : t('common.save')}
      onPrimary={handlePrimary}
      onSecondary={wizardStep === 2 ? () => setWizardStep(1) : undefined}
      secondaryLabel={wizardStep === 2 ? t('common.back') : undefined}
      primaryDisabled={saving || loading || (wizardStep === 1 ? !name.trim() : false)}
      primaryLoading={saving}
      snap={wizardStep === 1 ? 'medium' : 'large'}
      maxSnap="large"
      expandOnFocus
      stickyPrimary
      testID="progress-report-form-sheet"
    >
      <BottomSheet.Scroll>
        {loading ? (
          <SkeletonList count={5} rowHeight={56} />
        ) : (
          <View style={styles.form}>
            {wizardStep === 1 ? (
              <>
            <Text variant="caption" style={styles.label}>
              {t('mobile.progress_reports_form_name')}
            </Text>
            <BottomSheet.Input
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t(builderKey('report_name_placeholder'))}
              placeholderTextColor={colors.textSubtle}
              editable={!saving}
            />

            <Text variant="caption" style={styles.label}>
              {t(builderKey('report_type'))}
            </Text>
            <View style={[styles.chipRow, styles.audienceRow]}>
              {audienceOptions.map((opt) => (
                <PressableWithFade
                  key={opt.value}
                  style={[styles.chip, styles.chipHalf, audience === opt.value && styles.chipActive]}
                  onPress={() => setAudience(opt.value)}
                  disabled={saving}
                >
                  <Text style={[styles.chipText, audience === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </PressableWithFade>
              ))}
            </View>

            <Text variant="caption" style={styles.label}>
              {t('mobile.progress_reports_form_frequency')}
            </Text>
            <View style={styles.chipRow}>
              {frequencyOptions.map((opt) => (
                <PressableWithFade
                  key={opt.value}
                  style={[styles.chip, frequency === opt.value && styles.chipActive]}
                  onPress={() => handleFrequencyChange(opt.value)}
                  disabled={saving}
                >
                  <Text style={[styles.chipText, frequency === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </PressableWithFade>
              ))}
            </View>
              </>
            ) : (
              <>
            <Text variant="caption" style={styles.label}>
              {t('mobile.progress_reports_form_recipients')}
            </Text>
            {recipientEmails.length > 0 ? (
              <View style={styles.chipRow}>
                {recipientEmails.map((email) => (
                  <PressableWithFade
                    key={email}
                    style={[styles.chip, styles.chipActive]}
                    onPress={() => setRecipientEmails((prev) => prev.filter((e) => e !== email))}
                    disabled={saving}
                  >
                    <Text style={[styles.chipText, styles.chipTextActive]}>{email}</Text>
                  </PressableWithFade>
                ))}
              </View>
            ) : null}
            {loadingContacts ? null : (
              <ContactSuggestionPicker
                contacts={contacts.filter((c) => !recipientEmails.includes(String(c.email).toLowerCase()))}
                selectedEmails={[]}
                onSelect={handleSelectContact}
                disabled={saving}
                emailInput={emailInput}
                onEmailInputChange={setEmailInput}
                onAddEmail={handleAddEmailFromInput}
                emailPlaceholder={t('mobile.progress_reports_form_recipients_hint')}
                suggestionLabel={t('mobile.project_invite_directory')}
                testID="progress-report-recipients"
              />
            )}

            {frequency === 'weekly' ? (
              <>
                <Text variant="caption" style={styles.label}>
                  {t(builderKey('schedule'))}
                </Text>
                <View style={styles.chipRow}>
                  {WEEK_DAYS.map((day) => (
                    <PressableWithFade
                      key={day.value}
                      style={[styles.chip, frequencyValue === day.value && styles.chipActive]}
                      onPress={() => setFrequencyValue(day.value)}
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          frequencyValue === day.value && styles.chipTextActive,
                        ]}
                      >
                        {t(builderKey(day.labelKey))}
                      </Text>
                    </PressableWithFade>
                  ))}
                </View>
              </>
            ) : null}

            {frequency === 'monthly' ? (
              <>
                <Text variant="caption" style={styles.label}>
                  {t(builderKey('date_each_month'))}
                </Text>
                <View style={styles.chipRow}>
                  {MONTHLY_DAYS.map((day) => (
                    <PressableWithFade
                      key={day.value}
                      style={[styles.chip, frequencyValue === day.value && styles.chipActive]}
                      onPress={() => setFrequencyValue(day.value)}
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          frequencyValue === day.value && styles.chipTextActive,
                        ]}
                      >
                        {t(builderKey(day.labelKey))}
                      </Text>
                    </PressableWithFade>
                  ))}
                </View>
              </>
            ) : null}

            <Text variant="caption" style={styles.label}>
              {t('mobile.progress_reports_form_sections')}
            </Text>
            {SECTION_KEYS.map(({ key, labelKey }) => (
              <View key={key} style={styles.switchRow}>
                <Text variant="body" style={styles.switchLabel}>
                  {t(builderKey(labelKey))}
                </Text>
                <Switch
                  value={Boolean(sections[key])}
                  onValueChange={() => toggleSection(key)}
                  disabled={saving}
                />
              </View>
            ))}

            {DETAIL_KEYS.map(({ key, labelKey }) => (
              <View key={key} style={styles.switchRow}>
                <Text variant="body" style={styles.switchLabel}>
                  {t(builderKey(labelKey))}
                </Text>
                <Switch
                  value={Boolean(sections[key])}
                  onValueChange={() => toggleSection(key)}
                  disabled={saving}
                />
              </View>
            ))}

            <View style={styles.switchRow}>
              <Text variant="body" style={styles.switchLabel}>
                {t('mobile.progress_reports_form_active')}
              </Text>
              <Switch value={isActive} onValueChange={setIsActive} disabled={saving} />
            </View>
              </>
            )}
          </View>
        )}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, paddingBottom: spacing.lg },
  stepIndicator: {
    color: colors.textSubtle,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: touch.minRowHeight,
    textAlignVertical: 'center',
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  audienceRow: {
    gap: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    minHeight: touch.minSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipHalf: {
    flex: 1,
    minWidth: '45%',
  },
  chipActive: {
    backgroundColor: colors.primaryLight,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.primary,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touch.minRowHeight,
    paddingVertical: spacing.xs,
  },
  switchLabel: { flex: 1, paddingRight: spacing.md },
});
