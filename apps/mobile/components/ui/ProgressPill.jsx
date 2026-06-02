import { Text, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import PressableWithFade from '../PressableWithFade';
import { colors, touch } from '../../theme';
import { useBranding } from '../../context/BrandingContext';

export default function ProgressPill({ percent = 0, onPress, testID }) {
  const { primaryColor } = useBranding();
  const bounded = Math.max(0, Math.min(100, Number(percent) || 0));
  const done = bounded >= 100;
  const fillAnim = useRef(new Animated.Value(bounded)).current;
  const doneAnim = useRef(new Animated.Value(done ? 1 : 0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      fillAnim.setValue(bounded);
      doneAnim.setValue(done ? 1 : 0);
      return;
    }
    Animated.parallel([
      Animated.timing(fillAnim, { toValue: bounded, duration: 200, useNativeDriver: false }),
      Animated.timing(doneAnim, { toValue: done ? 1 : 0, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [bounded, done, reduceMotion, fillAnim, doneAnim]);

  const backgroundColor = doneAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.primaryLight, colors.statusDone],
  });
  const borderColor = doneAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [primaryColor, colors.statusDone],
  });
  const textColor = doneAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [primaryColor, colors.white],
  });

  return (
    <PressableWithFade
      onPress={onPress}
      style={styles.pressable}
      hitSlop={touch.hitSlop}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Task progress ${bounded} percent`}
      accessibilityHint="Opens progress editor"
    >
      <Animated.View
        style={[
          styles.pill,
          { backgroundColor, borderColor },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              width: fillAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: primaryColor,
              opacity: doneAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0] }),
            },
          ]}
        />
        <Animated.Text style={[styles.text, { color: textColor }]}>
          {bounded}%
        </Animated.Text>
      </Animated.View>
    </PressableWithFade>
  );
}

const styles = StyleSheet.create({
  pressable: { alignSelf: 'flex-start' },
  pill: {
    minWidth: 52,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 9,
  },
  text: { fontSize: 15, fontWeight: '700' },
});
