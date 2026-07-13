import BottomSheet, { useSheetInsets } from './ui/BottomSheet';
import { View, StyleSheet } from 'react-native';
import Button from './ui/Button';
import { spacing } from '../theme';
import { sheetListEndPadding } from '../utils/layoutInsets';

export default function PhotoAttachSheet({ visible, onClose, onCamera, onLibrary, uploading = false }) {
  const sheetInsets = useSheetInsets();

  return (
    <BottomSheet visible={visible} title="Add photo" onClose={onClose} testID="photo-sheet">
      <View style={[styles.actions, { paddingBottom: sheetListEndPadding(sheetInsets) }]}>
        <Button label="Take photo" onPress={onCamera} disabled={uploading} testID="photo-camera" />
        <Button
          label="Choose from library"
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
