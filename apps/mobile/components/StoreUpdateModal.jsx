import { Modal, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';
import { useAppUpdate } from '../context/AppUpdateContext';
import { colors, spacing, touch } from '../theme';

export default function StoreUpdateModal() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { storeUpdateRequired, openStore } = useAppUpdate();

  if (!storeUpdateRequired) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.root}>
        <ModalScrim opacity={0.55} />
        <View style={[styles.card, { marginBottom: insets.bottom + spacing.xl }]}>
          <Text variant="screenTitle" style={styles.title}>
            {t('mobile.update_store_required_title')}
          </Text>
          <Text variant="body" style={styles.body}>
            {t('mobile.update_store_required_body')}
          </Text>
          <PressableWithFade
            style={styles.button}
            onPress={openStore}
            testID="store-update-open-store"
          >
            <Text variant="bodyMedium" style={styles.buttonText}>
              {t('mobile.update_open_store')}
            </Text>
          </PressableWithFade>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1,
  },
  title: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    minHeight: touch.minSize,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
