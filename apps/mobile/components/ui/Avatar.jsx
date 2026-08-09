import { View, Text, StyleSheet } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { colors } from '../../theme';

const SIZES = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 72,
};

const PALETTE = [
  '#EF4444',
  '#3B82F6',
  '#10B981',
  '#EAB308',
  '#A855F7',
  '#EC4899',
  '#6366F1',
  '#F97316',
  '#14B8A6',
  '#06B6D4',
];

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function colorForName(name) {
  if (!name) return colors.textMuted;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function Avatar({
  name,
  avatarUrl = null,
  size = 'md',
  style,
  textStyle,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const dimension = SIZES[size] || SIZES.md;
  const initials = useMemo(() => getInitials(name), [name]);
  const backgroundColor = useMemo(() => colorForName(name), [name]);
  const fontSize = Math.max(12, Math.round(dimension * 0.38));

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !imageFailed) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[
          styles.image,
          { width: dimension, height: dimension, borderRadius: dimension / 2 },
          style,
        ]}
        onError={() => setImageFailed(true)}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={avatarUrl}
        accessibilityLabel={name ? `${name} avatar` : 'User avatar'}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: dimension, height: dimension, borderRadius: dimension / 2, backgroundColor },
        style,
      ]}
      accessibilityLabel={name ? `${name} avatar` : 'User avatar'}
    >
      <Text style={[styles.initials, { fontSize }, textStyle]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.border,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: colors.white,
    fontWeight: '700',
  },
});
