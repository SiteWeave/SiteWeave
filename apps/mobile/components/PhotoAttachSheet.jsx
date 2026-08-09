import BottomSheet, { useSheetInsets } from './ui/BottomSheet';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from './ui/Button';
import { spacing } from '../theme';
import { sheetListEndPadding } from '../utils/layoutInsets';

export default function PhotoAttachSheet({
  visible,
  onClose,
  onDismissed,
  dismissWithoutAnimation = false,
  onCamera,
  onLibrary,
  uploading = false,
}) {
  const { t } = useTranslation();
  const sheetInsets = useSheetInsets();

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.add_photo')}
      onClose={onClose}
      onDismissed={onDismissed}
      dismissWithoutAnimation={dismissWithoutAnimation}
      testID="photo-sheet"
    >
      <View style={[styles.actions, { paddingBottom: sheetListEndPadding(sheetInsets) }]}>
        <Button
          label={t('mobile.photo_take', { defaultValue: 'Take photo' })}
          onPress={onCamera}
          disabled={uploading}
          testID="photo-camera"
        />
        <Button
          label={t('mobile.photo_library', { defaultValue: 'Choose from library' })}
          variant="secondary"
          onPress={onLibrary}
          disabled={uploading}
          testID="photo-library"
          style={styles.second}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.md },
  second: { marginTop: spacing.sm },
});
