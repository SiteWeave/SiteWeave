import React, { useEffect, useState } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import { colors, radius, spacing } from '../../theme';

export function Skeleton({ width, height, style, borderRadius = radius.card }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        { width, height, borderRadius },
        !reduceMotion && styles.pulse,
        style,
      ]}
    />
  );
}

export function SkeletonText({ lines = 3, style }) {
  return (
    <View style={[styles.textGroup, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          style={{ width: i === lines - 1 ? '60%' : '100%', marginBottom: spacing.sm }}
        />
      ))}
    </View>
  );
}

export function SkeletonCard({ height = 112, style }) {
  return <Skeleton height={height} style={[{ width: '100%' }, style]} borderRadius={radius.card} />;
}

export function SkeletonRow({ height = 56, style }) {
  return <Skeleton height={height} style={[{ width: '100%' }, style]} borderRadius={radius.button} />;
}

export function SkeletonList({ count = 4, rowHeight = 56, gap = spacing.md, style }) {
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} height={rowHeight} style={{ marginBottom: i < count - 1 ? gap : 0 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  pulse: {
    opacity: 0.65,
  },
  textGroup: {
    width: '100%',
  },
});
