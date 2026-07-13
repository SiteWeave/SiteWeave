import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { MOBILE_EXPERIENCE_MODES } from '../utils/mobileExperience';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, touch } from '../theme';
import { useBranding } from '../context/BrandingContext';

export default function ExperienceModeToggle({ mode, canSwitchView, onChange }) {
  const { t } = useTranslation();
  const { primaryColor } = useBranding();

  if (!canSwitchView) return null;

  const options = [
    {
      id: MOBILE_EXPERIENCE_MODES.FIELD,
      title: t('mobile.view_mode_field'),
      description: t('mobile.view_mode_field_desc'),
      icon: 'today-outline',
    },
    {
      id: MOBILE_EXPERIENCE_MODES.MANAGER,
      title: t('mobile.view_mode_manager'),
      description: t('mobile.view_mode_manager_desc'),
      icon: 'briefcase-outline',
    },
  ];

  return (
    <View style={styles.wrap}>
      <Text variant="caption" style={styles.sectionLabel}>
        {t('mobile.view_mode_section')}
      </Text>
      <View style={styles.options}>
        {options.map((opt) => {
          const active = mode === opt.id;
          return (
            <PressableWithFade
              key={opt.id}
              style={[
                styles.option,
                active && [styles.optionActive, { borderColor: primaryColor }],
              ]}
              onPress={() => onChange(opt.id)}
              testID={`experience-mode-${opt.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.iconWrap, active && { backgroundColor: colors.primaryLight }]}>
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={active ? primaryColor : colors.textMuted}
                />
              </View>
              <View style={styles.optionCopy}>
                <Text
                  style={[styles.optionTitle, active && { color: primaryColor }]}
                  numberOfLines={1}
                >
                  {opt.title}
                </Text>
                <Text style={styles.optionDescription} numberOfLines={2}>
                  {opt.description}
                </Text>
              </View>
              <Ionicons
                name={active ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={active ? primaryColor : colors.textSubtle}
              />
            </PressableWithFade>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 12,
    fontWeight: '600',
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.minRowHeight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionActive: {
    backgroundColor: colors.primaryLight,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    flexShrink: 0,
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  optionDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
});
