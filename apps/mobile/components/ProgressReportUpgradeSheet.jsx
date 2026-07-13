import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import BottomSheet from './ui/BottomSheet';
import { Text } from './ui/Text';
import Button from './ui/Button';
import { colors, spacing } from '../theme';

export default function ProgressReportUpgradeSheet({
  visible,
  onClose,
  titleKey = 'mobile.progress_reports_upgrade_title',
  bodyKey = 'mobile.progress_reports_upgrade_body',
}) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      visible={visible}
      title={t(titleKey)}
      onClose={onClose}
      testID="progress-reports-upgrade-sheet"
    >
      <View style={styles.body}>
        <Text variant="body" style={styles.message}>
          {t(bodyKey)}
        </Text>
        <Button label={t('common.ok')} onPress={onClose} testID="progress-reports-upgrade-dismiss" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  message: {
    color: colors.textMuted,
    lineHeight: 22,
  },
});
