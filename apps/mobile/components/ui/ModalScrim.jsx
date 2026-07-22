import { Pressable, StyleSheet, Animated } from 'react-native';

/** Full-screen dim layer. Pass animatedOpacity (0–1) for fade-in with sheets. */
export default function ModalScrim({ onPress, opacity = 0.4, animatedOpacity, pointerEvents = 'auto' }) {
  const maxOpacity = opacity;

  if (animatedOpacity) {
    const backgroundColor = animatedOpacity.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(0,0,0,0)', `rgba(0,0,0,${maxOpacity})`],
    });

    return (
      <Animated.View
        pointerEvents={pointerEvents}
        style={[styles.scrim, { backgroundColor }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>
    );
  }

  return (
    <Pressable
      pointerEvents={pointerEvents}
      style={[styles.scrim, { backgroundColor: `rgba(0,0,0,${maxOpacity})` }]}
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
