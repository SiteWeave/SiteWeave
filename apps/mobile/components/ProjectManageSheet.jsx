import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { useSheetInsets } from './ui/BottomSheet';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, touch } from '../theme';
import { useBranding } from '../context/BrandingContext';
import { sheetListEndPadding } from '../utils/layoutInsets';

export default function ProjectManageSheet({
  visible,
  onClose,
  canEditProjects = false,
  canManageProgressReports = false,
  onEditProject,
  onProgressReports,
  onTeam,
}) {
  const { t } = useTranslation();
  const { primaryColor } = useBranding();
  const sheetInsets = useSheetInsets();

  const items = [
    canEditProjects
      ? {
          id: 'edit',
          label: t('mobile.manage_edit_project'),
          icon: 'create-outline',
          onPress: onEditProject,
        }
      : null,
    canManageProgressReports
      ? {
          id: 'reports',
          label: t('mobile.manage_progress_reports'),
          icon: 'document-text-outline',
          onPress: onProgressReports,
        }
      : null,
    {
      id: 'team',
      label: t('mobile.manage_team'),
      icon: 'people-outline',
      onPress: onTeam,
    },
  ].filter(Boolean);

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.manage_project_title')}
      onClose={onClose}
      testID="project-manage-sheet"
    >
      <View style={[styles.list, { paddingBottom: sheetListEndPadding(sheetInsets) }]}>
        {items.map((item) => (
          <PressableWithFade
            key={item.id}
            style={styles.row}
            onPress={() => {
              onClose?.();
              item.onPress?.();
            }}
            testID={`project-manage-${item.id}`}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name={item.icon} size={22} color={primaryColor} />
            </View>
            <Text variant="bodyMedium" style={styles.label}>
              {item.label}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          </PressableWithFade>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.minRowHeight,
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, fontWeight: '600' },
});
