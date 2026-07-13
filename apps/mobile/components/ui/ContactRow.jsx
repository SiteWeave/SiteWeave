import { View, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { Text } from './Text';
import { colors, spacing } from '../../theme';

export default function ContactRow({ contact, subtitle, fallbackEmail }) {
  const name = contact?.name?.trim() || contact?.email || fallbackEmail || '';
  const detail = subtitle || contact?.email || contact?.role || '';

  return (
    <View style={styles.row}>
      <Avatar
        name={name}
        avatarUrl={contact?.avatar_url || contact?.avatarUrl || null}
        size="md"
      />
      <View style={styles.textWrap}>
        <Text variant="bodyMedium" style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {detail ? (
          <Text variant="caption" style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  textWrap: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontWeight: '600' },
  detail: { color: colors.textSubtle, marginTop: 2 },
});
