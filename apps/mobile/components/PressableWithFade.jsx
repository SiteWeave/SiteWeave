import { Pressable, AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useHaptics } from '../hooks/useHaptics';

const PRESS_DURATION = 150;

/**
 * Pressable with scale-on-press feedback (default scale 0.96) and optional haptics.
 * Layout styles (flex, alignItems, flexDirection, etc.) belong on `style` and
 * apply to the inner Animated.View that wraps children — not the outer Pressable.
 * Use `containerStyle` when the Pressable itself must stretch inside a flex parent.
 *
 * @param {number} [pressScale=0.96] - Scale while pressed (Jakub default).
 * @param {boolean} [static=false] - Skip scale animation for high-frequency controls (tab bar, rapid list taps).
 * @param {number} [activeOpacity=1] - Optional opacity while pressed; set below 1 for a combined fade + scale effect.
 */
export default function PressableWithFade({
  children,
  style,
  containerStyle,
  onPress,
  onPressIn: onPressInProp,
  onPressOut: onPressOutProp,
  disabled = false,
  activeOpacity = 1,
  pressScale = 0.96,
  static: isStatic = false,
  hapticType = 'light', // 'light', 'medium', 'heavy', 'selection', 'success', 'error', or null
  ...props
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);
  const haptics = useHaptics();
  const useOpacityFade = activeOpacity !== 1;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const handlePressIn = (event) => {
    if (!disabled && !isStatic && !reduceMotion) {
      scale.value = withTiming(pressScale, { duration: PRESS_DURATION });
      if (useOpacityFade) {
        opacity.value = withTiming(activeOpacity, { duration: PRESS_DURATION });
      }
    }
    onPressInProp?.(event);
  };

  const handlePressOut = (event) => {
    if (!disabled && !isStatic && !reduceMotion) {
      scale.value = withTiming(1, { duration: PRESS_DURATION });
      if (useOpacityFade) {
        opacity.value = withTiming(1, { duration: PRESS_DURATION });
      }
    }
    onPressOutProp?.(event);
  };

  const handlePress = (event) => {
    if (hapticType && !disabled) {
      if (hapticType === 'light') haptics.light();
      else if (hapticType === 'medium') haptics.medium();
      else if (hapticType === 'heavy') haptics.heavy();
      else if (hapticType === 'selection') haptics.selection();
      else if (hapticType === 'success') haptics.success();
      else if (hapticType === 'error') haptics.error();
    }

    if (onPress) {
      onPress(event);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Pressable
      style={containerStyle}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      {...props}
    >
      <Animated.View style={[animatedStyle, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
