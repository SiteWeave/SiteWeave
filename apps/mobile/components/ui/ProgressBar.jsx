import { View, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { colors, radius } from '../../theme';
import { useBranding } from '../../context/BrandingContext';

export default function ProgressBar({ percent = 0, height = 6, fillColor }) {
  const { primaryColor } = useBranding();
  const barColor = fillColor || primaryColor;
  const bounded = Math.max(0, Math.min(100, Number(percent) || 0));
  const widthAnim = useRef(new Animated.Value(bounded)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      widthAnim.setValue(bounded);
      return;
    }
    Animated.timing(widthAnim, {
      toValue: bounded,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [bounded, reduceMotion, widthAnim]);

  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            width: widthAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
            backgroundColor: barColor,
            borderRadius: height,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
});
