import { useState, useEffect } from 'react';
import { View, StyleSheet, TextInput, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { createWeatherImpact } from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, touch } from '../theme';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

export default function WeatherShiftSheet({
  visible,
  onClose,
  supabase,
  projectId,
  organizationId,
  userId,
  projects = [],
  onSaved,
}) {
  const { t } = useTranslation();
  const lockedProjectId = projectId || null;

  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [reason, setReason] = useState('rain');
  const [note, setNote] = useState('');
  const [daysLost, setDaysLost] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const reasonOptions = [
    { id: 'rain', label: t('mobile.weather_reason_rain') },
    { id: 'wind', label: t('mobile.weather_reason_wind') },
    { id: 'heat', label: t('mobile.weather_reason_heat') },
    { id: 'other', label: t('mobile.weather_reason_other') },
  ];

  useEffect(() => {
    if (!visible) return;
    if (lockedProjectId) {
      setSelectedProjectIds([lockedProjectId]);
    } else if (projects.length > 0) {
      setSelectedProjectIds([projects[0].id]);
    } else {
      setSelectedProjectIds([]);
    }
    setReason('rain');
    setNote('');
    setDaysLost('1');
    setError(null);
  }, [visible, lockedProjectId, projects]);

  const toggleProject = (id) => {
    if (lockedProjectId) return;
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    const targetIds = lockedProjectId ? [lockedProjectId] : selectedProjectIds;
    if (!supabase || !organizationId || targetIds.length === 0) {
      setError(t('mobile.weather_select_project'));
      return;
    }
    const days = Math.max(1, parseInt(daysLost, 10) || 1);
    const reasonLabel = reasonOptions.find((r) => r.id === reason)?.label || t('mobile.weather_reason_other');
    setSaving(true);
    setError(null);
    try {
      const date = todayIso();
      for (const pid of targetIds) {
        await createWeatherImpact(supabase, {
          organization_id: organizationId,
          project_id: pid,
          impact_type: 'weather',
          title: t('mobile.weather_delay_title', { reason: reasonLabel }),
          description: note.trim() || null,
          start_date: date,
          end_date: date,
          days_lost: days,
          created_by_user_id: userId,
          apply_cascade: false,
          schedule_shift_applied: false,
        });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      console.error(e);
      setError(e.message || t('mobile.weather_log_failed'));
    } finally {
      setSaving(false);
    }
  };

  const showProjectPicker = !lockedProjectId && projects.length > 0;

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.log_weather_delay')}
      onClose={onClose}
      primaryLabel={t('mobile.weather_log_button')}
      onPrimary={handleSave}
      primaryLoading={saving}
      primaryDisabled={saving || (!lockedProjectId && selectedProjectIds.length === 0)}
      testID="weather-shift-sheet"
    >
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
        <Text variant="caption" style={styles.label}>
          {t('mobile.weather_reason')}
        </Text>
        <View style={styles.reasonRow}>
          {reasonOptions.map((r) => (
            <PressableWithFade
              key={r.id}
              style={[styles.reasonChip, reason === r.id && styles.reasonChipActive]}
              onPress={() => setReason(r.id)}
            >
              <Text style={[styles.reasonText, reason === r.id && styles.reasonTextActive]}>{r.label}</Text>
            </PressableWithFade>
          ))}
        </View>

        <Text variant="caption" style={styles.label}>
          {t('mobile.weather_days_affected')}
        </Text>
        <TextInput
          style={styles.input}
          value={daysLost}
          onChangeText={setDaysLost}
          keyboardType="number-pad"
          placeholder="1"
          placeholderTextColor={colors.textSubtle}
        />

        <Text variant="caption" style={[styles.label, { marginTop: spacing.lg }]}>
          {t('mobile.weather_note_optional')}
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={note}
          onChangeText={setNote}
          multiline
          placeholder={t('mobile.weather_note_placeholder')}
          placeholderTextColor={colors.textSubtle}
        />

        {showProjectPicker ? (
          <View style={styles.section}>
            <Text variant="caption" style={styles.label}>
              {t('mobile.weather_projects')}
            </Text>
            <Text variant="bodyMedium" style={styles.hint}>
              {t('mobile.weather_projects_hint')}
            </Text>
            {projects.map((p) => {
              const selected = selectedProjectIds.includes(p.id);
              return (
                <PressableWithFade
                  key={p.id}
                  style={[styles.projectRow, selected && styles.projectRowActive]}
                  onPress={() => toggleProject(p.id)}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={selected ? colors.primary : colors.textMuted}
                  />
                  <Text variant="body" style={styles.projectName}>
                    {p.name || p.title || t('mobile.unnamed_project')}
                  </Text>
                </PressableWithFade>
              );
            })}
          </View>
        ) : null}

        {error ? (
          <Text variant="bodyMedium" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 420 },
  section: { marginTop: spacing.lg, marginBottom: spacing.md },
  label: { marginBottom: spacing.sm, color: colors.textMuted },
  hint: { color: colors.textMuted, marginBottom: spacing.md },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.minRowHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceMuted,
  },
  projectRowActive: { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  projectName: { flex: 1 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  reasonChip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  reasonChipActive: { backgroundColor: colors.primaryLight },
  reasonText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  reasonTextActive: { color: colors.primary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    fontSize: 17,
    minHeight: touch.minSize,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  error: { color: colors.error, marginTop: spacing.md, marginBottom: spacing.lg },
});
