import { View, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import DateRangeField from './ui/DateRangeField';
import SuggestionField from './ui/SuggestionField';
import SheetInput from './ui/SheetInput';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, touch, shadows, typography } from '../theme';

const PROJECT_TYPES = ['Residential', 'Commercial', 'Industrial', 'Infrastructure', 'Other'];
const PROJECT_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Completed'];

const TYPE_ICONS = {
  Residential: 'home-outline',
  Commercial: 'business-outline',
  Industrial: 'construct-outline',
  Infrastructure: 'train-outline',
  Other: 'ellipsis-horizontal-outline',
};

const TYPE_TINTS = {
  Residential: '#EFF6FF',
  Commercial: '#ECFDF5',
  Industrial: '#FFF7ED',
  Infrastructure: '#F5F3FF',
  Other: colors.surfaceMuted,
};

export default function ProjectFormFields({
  values,
  onChange,
  disabled = false,
  compact = false,
  recentAddresses = [],
  nameOnly = false,
  addressOnly = false,
}) {
  const { t } = useTranslation();

  const set = (key, value) => onChange({ ...values, [key]: value });

  if (nameOnly) {
    return (
      <View style={styles.wrap}>
        <Text variant="caption" style={styles.label}>
          {t('mobile.project_name_label')}
        </Text>
        <SheetInput
          style={styles.input}
          value={values.name}
          onChangeText={(v) => set('name', v)}
          editable={!disabled}
          placeholder={t('mobile.project_name_placeholder')}
          placeholderTextColor={colors.textSubtle}
          testID="project-name-input"
        />
      </View>
    );
  }

  if (addressOnly) {
    return (
      <View style={styles.wrap}>
        <SuggestionField
          label={t('mobile.project_address_label')}
          value={values.address || ''}
          onChangeText={(v) => set('address', v)}
          suggestions={recentAddresses}
          suggestionLabel={t('mobile.recent_addresses')}
          onSelectSuggestion={(item) => set('address', item.address || item.label)}
          placeholder={t('mobile.project_address_placeholder')}
          editable={!disabled}
          testID="project-address-input"
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text variant="caption" style={styles.label}>
        {t('mobile.project_name_label')}
      </Text>
      <SheetInput
        style={styles.input}
        value={values.name}
        onChangeText={(v) => set('name', v)}
        editable={!disabled}
        placeholder={t('mobile.project_name_placeholder')}
        placeholderTextColor={colors.textSubtle}
        testID="project-name-input"
      />

      <SuggestionField
        label={t('mobile.project_address_label')}
        value={values.address || ''}
        onChangeText={(v) => set('address', v)}
        suggestions={recentAddresses}
        suggestionLabel={t('mobile.recent_addresses')}
        onSelectSuggestion={(item) => set('address', item.address || item.label)}
        placeholder={t('mobile.project_address_placeholder')}
        editable={!disabled}
        testID="project-address-input"
      />

      {!compact ? (
        <>
          <Text variant="caption" style={styles.label}>
            {t('mobile.project_status_label')}
          </Text>
          <View style={styles.chipRow}>
            {PROJECT_STATUSES.map((status) => (
              <PressableWithFade
                key={status}
                style={[styles.chip, values.status === status && styles.chipActive]}
                onPress={() => set('status', status)}
                disabled={disabled}
              >
                <Text style={[styles.chipText, values.status === status && styles.chipTextActive]}>
                  {status}
                </Text>
              </PressableWithFade>
            ))}
          </View>

          <Text variant="caption" style={styles.label}>
            {t('mobile.project_type_label')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.typeScroll}
            contentContainerStyle={styles.typeScrollContent}
          >
            {PROJECT_TYPES.map((type) => {
              const active = values.project_type === type;
              return (
                <PressableWithFade
                  key={type}
                  style={[
                    styles.typeCard,
                    { backgroundColor: TYPE_TINTS[type] || colors.surfaceMuted },
                    active && styles.typeCardActive,
                    active && shadows.cardSelected,
                    !active && shadows.card,
                  ]}
                  onPress={() => set('project_type', type)}
                  disabled={disabled}
                  testID={`project-type-${type}`}
                >
                  <Ionicons
                    name={TYPE_ICONS[type] || 'ellipse-outline'}
                    size={24}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.typeCardText, active && styles.typeCardTextActive]} numberOfLines={1}>
                    {type}
                  </Text>
                </PressableWithFade>
              );
            })}
          </ScrollView>

          <View style={styles.scheduleSection}>
            <DateRangeField
              label={t('mobile.project_date_range')}
              startValue={values.start_date}
              endValue={values.due_date}
              onChange={({ start_date, due_date }) =>
                onChange({ ...values, start_date, due_date })
              }
              placeholder={t('mobile.project_date_range_placeholder')}
              disabled={disabled}
              testID="project-date-range"
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    color: colors.textSubtle,
    fontWeight: '500',
    ...typography.caption,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    fontSize: 17,
    fontWeight: '500',
    minHeight: touch.minSize,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  typeScroll: { marginTop: spacing.xs },
  typeScrollContent: { paddingRight: spacing.sm, gap: spacing.sm },
  typeCard: {
    width: 108,
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  typeCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  typeCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  typeCardTextActive: { color: colors.primary, fontWeight: '700' },
  scheduleSection: { marginTop: spacing.xl },
});
