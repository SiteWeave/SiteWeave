import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { fetchEventInviteContacts } from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';
import ContactSuggestionPicker from './ui/ContactSuggestionPicker';
import { Text } from './ui/Text';
import { colors, spacing, touch } from '../theme';

function contactLabel(contact, fallback) {
  return contact?.name?.trim() || contact?.email || fallback;
}

export default function EventAttendeePicker({
  supabase,
  organizationId,
  projectId,
  selectedEmails = [],
  onChange,
  disabled = false,
  visible = true,
}) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pickerFocused, setPickerFocused] = useState(false);

  const selectedSet = useMemo(
    () => new Set((selectedEmails || []).map((email) => String(email).toLowerCase())),
    [selectedEmails],
  );

  const loadContacts = useCallback(async () => {
    if (!supabase || !organizationId || !visible) {
      setContacts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEventInviteContacts(supabase, {
        organizationId,
        projectId: projectId || null,
      });
      setContacts(data || []);
    } catch (loadError) {
      console.error('EventAttendeePicker load failed:', loadError);
      setError(t('mobile.event_attendees_load_error'));
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, organizationId, projectId, visible, t]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const toggleEmail = (email) => {
    if (disabled || !email) return;
    const normalized = String(email).toLowerCase();
    if (selectedSet.has(normalized)) {
      onChange?.(selectedEmails.filter((entry) => String(entry).toLowerCase() !== normalized));
      return;
    }
    onChange?.([...selectedEmails, normalized]);
  };

  const availableContacts = useMemo(
    () => contacts.filter((contact) => contact?.email && !selectedSet.has(String(contact.email).toLowerCase())),
    [contacts, selectedSet],
  );

  if (!organizationId) {
    return (
      <Text variant="bodyMedium" style={styles.helperText}>
        {t('mobile.event_attendees_org_required')}
      </Text>
    );
  }

  return (
    <View style={styles.wrap}>
      {selectedEmails.length > 0 ? (
        <View style={styles.chipRow}>
          {selectedEmails.map((email) => {
            const contact = contacts.find((entry) => entry.email === email);
            return (
              <PressableWithFade
                key={email}
                style={[styles.chip, styles.chipSelected]}
                onPress={() => toggleEmail(email)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.event_attendee_remove', {
                  name: contactLabel(contact, email),
                })}
              >
                <Text style={styles.chipSelectedText} numberOfLines={1}>
                  {contactLabel(contact, email)}
                </Text>
                <Ionicons name="close-circle" size={18} color={colors.primary} />
              </PressableWithFade>
            );
          })}
        </View>
      ) : (
        <Text variant="bodyMedium" style={styles.helperText}>
          {t('mobile.event_attendees_empty')}
        </Text>
      )}

      {loading ? <ActivityIndicator size="small" color={colors.primary} style={styles.loader} /> : null}
      {error ? <Text variant="bodyMedium" style={styles.errorText}>{error}</Text> : null}

      {!loading && !error && availableContacts.length > 0 ? (
        <>
          <PressableWithFade
            style={styles.suggestTrigger}
            onPress={() => setPickerFocused((v) => !v)}
            disabled={disabled}
            testID="event-attendee-suggest-trigger"
          >
            <Text variant="bodyMedium" style={styles.suggestTriggerText}>
              {t('mobile.event_attendees_suggest')}
            </Text>
            <Ionicons name={pickerFocused ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
          </PressableWithFade>
          {pickerFocused ? (
            <ContactSuggestionPicker
              contacts={availableContacts}
              selectedEmails={selectedEmails}
              onSelect={(contact) => toggleEmail(contact.email)}
              disabled={disabled}
              suggestionLabel={t('mobile.project_invite_directory')}
              testID="event-attendee-contact-picker"
            />
          ) : null}
        </>
      ) : null}

      {!loading && !error && availableContacts.length === 0 && contacts.length === 0 ? (
        <Text variant="bodyMedium" style={styles.helperText}>
          {t('mobile.event_attendees_none')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
  chipSelectedText: { fontSize: 14, fontWeight: '600', color: colors.primary, flexShrink: 1 },
  helperText: { color: colors.textMuted },
  errorText: { color: colors.error },
  loader: { marginTop: spacing.xs },
  suggestTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touch.minSize,
    marginTop: spacing.sm,
  },
  suggestTriggerText: { color: colors.primary, fontWeight: '600' },
});
