import BottomSheet from './ui/BottomSheet';
import { View, StyleSheet } from 'react-native';
import Button from './ui/Button';
import { spacing } from '../theme';

export default function PhotoAttachSheet({ visible, onClose, onCamera, onLibrary, uploading = false }) {
  return (
    <BottomSheet visible={visible} title="Add photo" onClose={onClose} testID="photo-sheet">
      <View style={styles.actions}>
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
  actions: { gap: spacing.md, paddingBottom: spacing.xxl },
  second: { marginTop: spacing.sm },
});
