import { useState } from 'react';
import { View, StyleSheet, Keyboard } from 'react-native';
import PressableWithFade from '../PressableWithFade';
import ContactRow from './ContactRow';
import SheetInput from './SheetInput';
import { Text } from './Text';
import { colors, spacing, touch } from '../../theme';
import { useCollapsibleList, ShowMoreToggle } from './CollapsibleList';

function contactLabel(contact, fallback) {
  return contact?.name?.trim() || contact?.email || fallback;
}

export default function ContactSuggestionPicker({
  contacts = [],
  selectedEmails = [],
  onSelect,
  disabled = false,
  emailInput = '',
  onEmailInputChange,
  onAddEmail,
  emailPlaceholder,
  suggestionLabel,
  testID = 'contact-suggestion-picker',
}) {
  const [focused, setFocused] = useState(false);
  const selectedSet = new Set((selectedEmails || []).map((email) => String(email).toLowerCase()));

  const availableContacts = contacts.filter(
    (contact) => contact?.email && !selectedSet.has(String(contact.email).toLowerCase()),
  );

  const { displayedItems, expanded, setExpanded, hasMore, hiddenCount } = useCollapsibleList(
    availableContacts,
    [],
  );

  const showSuggestions = focused && availableContacts.length > 0;

  return (
    <View testID={testID}>
      {selectedEmails.length > 0 ? (
        <View style={styles.chipRow}>
          {selectedEmails.map((email) => {
            const contact = contacts.find((entry) => entry.email === email);
            return (
              <PressableWithFade
                key={email}
                style={[styles.chip, styles.chipSelected]}
                onPress={() => onSelect?.(contact || { email })}
                disabled={disabled}
              >
                <Text style={styles.chipSelectedText} numberOfLines={1}>
                  {contactLabel(contact, email)}
                </Text>
              </PressableWithFade>
            );
          })}
        </View>
      ) : null}

      {onEmailInputChange ? (
        <View style={styles.emailRow}>
          <SheetInput
            style={styles.emailInput}
            value={emailInput}
            onChangeText={onEmailInputChange}
            placeholder={emailPlaceholder}
            placeholderTextColor={colors.textSubtle}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="done"
            editable={!disabled}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            onSubmitEditing={() => {
              onAddEmail?.();
              Keyboard.dismiss();
            }}
            testID={`${testID}-email`}
          />
          {onAddEmail ? (
            <PressableWithFade
              style={styles.addBtn}
              onPress={() => {
                onAddEmail?.();
                Keyboard.dismiss();
              }}
              disabled={disabled || !emailInput?.trim()}
              testID={`${testID}-add`}
            >
              <Text style={styles.addBtnText}>+</Text>
            </PressableWithFade>
          ) : null}
        </View>
      ) : null}

      {showSuggestions ? (
        <View style={styles.suggestionPanel}>
          {suggestionLabel ? (
            <Text variant="caption" style={styles.suggestionLabel}>
              {suggestionLabel}
            </Text>
          ) : null}
          {displayedItems.map((contact) => (
            <PressableWithFade
              key={contact.id || contact.email}
              style={styles.suggestionRow}
              onPress={() => {
                onSelect?.(contact);
                setFocused(false);
              }}
              disabled={disabled}
              testID={`${testID}-suggestion-${contact.id || contact.email}`}
            >
              <ContactRow contact={contact} />
            </PressableWithFade>
          ))}
          {hasMore ? (
            <ShowMoreToggle
              expanded={expanded}
              hiddenCount={hiddenCount}
              onPress={() => setExpanded((value) => !value)}
              testID={`${testID}-toggle`}
            />
          ) : null}
        </View>
      ) : null}

      {!onEmailInputChange && availableContacts.length > 0 ? (
        <View style={styles.chipRow}>
          {displayedItems.map((contact) => (
            <PressableWithFade
              key={contact.id || contact.email}
              style={styles.chip}
              onPress={() => onSelect?.(contact)}
              disabled={disabled}
            >
              <Text style={styles.chipText} numberOfLines={1}>
                {contactLabel(contact, contact.email)}
              </Text>
            </PressableWithFade>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
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
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, flexShrink: 1 },
  chipSelectedText: { fontSize: 14, fontWeight: '600', color: colors.primary, flexShrink: 1 },
  emailRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  emailInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 17,
    fontWeight: '500',
    minHeight: touch.minSize,
    color: colors.text,
    backgroundColor: colors.surface,
    textAlignVertical: 'center',
  },
  addBtn: {
    width: touch.minSize,
    height: touch.minSize,
    borderRadius: touch.minSize / 2,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontSize: 24, fontWeight: '600', color: colors.primary },
  suggestionPanel: {
    marginTop: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  suggestionLabel: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    color: colors.textSubtle,
    fontWeight: '500',
  },
  suggestionRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: touch.minRowHeight,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
