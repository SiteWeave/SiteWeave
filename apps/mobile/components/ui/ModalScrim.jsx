import { Pressable, StyleSheet } from 'react-native';

/** Fixed full-screen dim layer — does not animate or move with sheet content. */
export default function ModalScrim({ onPress, opacity = 0.4 }) {
  return (
    <Pressable
      style={[styles.scrim, { backgroundColor: `rgba(0,0,0,${opacity})` }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
    />
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
});
