import { View, StyleSheet } from 'react-native';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, spacing, touch } from '../../theme';
import { useCollapsibleList, ShowMoreToggle } from './CollapsibleList';

function contactLabel(contact, fallback) {
  return contact?.name?.trim() || contact?.email || fallback;
}

export default function ContactChipPicker({
  contacts = [],
  selectedEmails = [],
  onSelect,
  disabled = false,
  testID = 'contact-chip-picker',
}) {
  const selectedSet = new Set((selectedEmails || []).map((email) => String(email).toLowerCase()));

  const availableContacts = contacts.filter(
    (contact) => contact?.email && !selectedSet.has(String(contact.email).toLowerCase()),
  );

  const { displayedItems, expanded, setExpanded, hasMore, hiddenCount } = useCollapsibleList(
    availableContacts,
    [],
  );

  if (availableContacts.length === 0) return null;

  return (
    <View testID={testID}>
      <View style={styles.chipRow}>
        {displayedItems.map((contact) => (
          <PressableWithFade
            key={contact.id || contact.email}
            style={styles.chip}
            onPress={() => onSelect?.(contact)}
            disabled={disabled}
            testID={`${testID}-chip-${contact.id || contact.email}`}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {contactLabel(contact, contact.email)}
            </Text>
          </PressableWithFade>
        ))}
      </View>
      {hasMore ? (
        <ShowMoreToggle
          expanded={expanded}
          hiddenCount={hiddenCount}
          onPress={() => setExpanded((value) => !value)}
          testID={`${testID}-toggle`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    maxWidth: '100%',
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, flexShrink: 1 },
});
