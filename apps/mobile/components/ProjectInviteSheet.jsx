import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchEventInviteContacts,
  canInviteGuestCollaborator,
  isGuestCollaboratorLimitError,
  defaultProjectCrewRoleForContact,
  PROJECT_CREW_ROLES,
} from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import ContactSuggestionPicker from './ui/ContactSuggestionPicker';
import PressableWithFade from './PressableWithFade';
import { Text } from './ui/Text';
import { colors, spacing, touch } from '../theme';
import { markGettingStartedInviteSent } from '../utils/onboarding';
import { signalReviewPromptOpportunity } from '../utils/reviewPromptEvents';

function parseEmails(input) {
  return Array.from(
    new Set(
      String(input || '')
        .split(/[\s,;]+/)
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.includes('@')),
    ),
  );
}

export default function ProjectInviteSheet({
  visible,
  onClose,
  onDismissed,
  dismissWithoutAnimation = false,
  supabase,
  project,
  userId,
  userEmail,
  onInvited,
}) {
  const { t } = useTranslation();
  const [emailInput, setEmailInput] = useState('');
  const [entries, setEntries] = useState([]);
  const [defaultRole, setDefaultRole] = useState('Team');
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const projectId = project?.id;
  const organizationId = project?.organization_id;

  const resetForm = useCallback(() => {
    setEmailInput('');
    setEntries([]);
    setDefaultRole('Team');
    setError(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    resetForm();
  }, [visible, resetForm]);

  const loadContacts = useCallback(async () => {
    if (!supabase || !organizationId || !visible) {
      setContacts([]);
      return;
    }
    setLoadingContacts(true);
    try {
      const data = await fetchEventInviteContacts(supabase, {
        organizationId,
        projectId: projectId || null,
      });
      setContacts(data || []);
    } catch (loadError) {
      console.error('ProjectInviteSheet contacts load failed:', loadError);
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, [supabase, organizationId, projectId, visible]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const queuedEmails = useMemo(
    () => new Set(entries.map((entry) => entry.email)),
    [entries],
  );

  const directoryContacts = useMemo(() => {
    const selfEmail = String(userEmail || '').trim().toLowerCase();
    return (contacts || []).filter((c) => {
      const email = String(c?.email || '').trim().toLowerCase();
      if (!email) return false;
      if (selfEmail && email === selfEmail) return false;
      if (queuedEmails.has(email)) return false;
      return true;
    });
  }, [contacts, queuedEmails, userEmail]);

  const addEmail = (rawEmail, role = defaultRole) => {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email.includes('@')) return;
    if (userEmail && email === userEmail.trim().toLowerCase()) {
      setError(t('mobile.project_invite_own_email'));
      return;
    }
    if (queuedEmails.has(email)) return;
    setEntries((prev) => [...prev, { email, role }]);
    setError(null);
  };

  const handleAddFromInput = () => {
    const emails = parseEmails(emailInput);
    if (emails.length === 0) {
      setError(t('mobile.project_invite_invalid_email'));
      return;
    }
    emails.forEach((email) => addEmail(email, defaultRole));
    setEmailInput('');
  };

  /** Merge typed input into the queue so Send works without tapping +. */
  const collectEntriesForSend = useCallback(() => {
    const pendingEmails = parseEmails(emailInput);
    if (pendingEmails.length === 0) return entries;

    const known = new Set(entries.map((entry) => entry.email));
    const next = [...entries];
    for (const email of pendingEmails) {
      if (userEmail && email === userEmail.trim().toLowerCase()) {
        setError(t('mobile.project_invite_own_email'));
        continue;
      }
      if (known.has(email)) continue;
      known.add(email);
      next.push({ email, role: defaultRole });
    }
    return next;
  }, [emailInput, entries, userEmail, defaultRole, t]);

  const handleSelectContact = (contact) => {
    const role = defaultProjectCrewRoleForContact({
      contactType: contact?.type,
      hasOrgAccount: Boolean(contact?.profile_id),
    });
    addEmail(contact.email, role);
  };

  const handleRemoveEntry = (email) => {
    setEntries((prev) => prev.filter((entry) => entry.email !== email));
  };

  const handleSend = async () => {
    if (!supabase || !projectId || !userId) return;

    const toSend = collectEntriesForSend();
    if (toSend.length === 0) {
      if (emailInput.trim()) {
        setError(t('mobile.project_invite_invalid_email'));
      }
      return;
    }

    // Reflect flushed input in the queue UI if send fails mid-flight.
    if (toSend.length !== entries.length) {
      setEntries(toSend);
      setEmailInput('');
    }

    setSubmitting(true);
    setError(null);
    try {
      if (organizationId) {
        const allowed = await canInviteGuestCollaborator(supabase, organizationId, projectId);
        if (!allowed) {
          Alert.alert(t('common.error'), t('mobile.project_invite_guest_limit'));
          return;
        }
      }

      const { data, error: fnError } = await supabase.functions.invoke('invite_or_add_member', {
        body: {
          projectId,
          entries: toSend.map(({ email, role }) => ({ email, role })),
          addedByUserId: userId,
        },
      });

      if (fnError) throw new Error(fnError.message || t('mobile.project_invite_error'));

      const results = data?.results || [];
      const failed = results.filter((row) => row?.error);
      if (failed.length === results.length && results.length > 0) {
        throw new Error(failed[0]?.error || t('mobile.project_invite_error'));
      }

      await markGettingStartedInviteSent(userId);
      signalReviewPromptOpportunity();
      onInvited?.();
      onClose?.();
      Alert.alert(t('common.success'), t('mobile.project_invite_success'));
    } catch (err) {
      console.error('ProjectInviteSheet send failed:', err);
      if (isGuestCollaboratorLimitError(err) || err?.message?.includes('GUEST_COLLABORATOR_LIMIT')) {
        Alert.alert(t('common.error'), t('mobile.project_invite_guest_limit'));
      } else {
        setError(err?.message || t('mobile.project_invite_error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSend =
    !submitting && (entries.length > 0 || parseEmails(emailInput).length > 0);

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.project_invite_title')}
      onClose={onClose}
      onDismissed={onDismissed}
      dismissWithoutAnimation={dismissWithoutAnimation}
      primaryLabel={t('mobile.project_invite_send')}
      onPrimary={handleSend}
      primaryDisabled={!canSend}
      primaryLoading={submitting}
      snap="content"
      maxSnap="large"
      expandOnFocus
      expandOnFocusSnap="large"
      stickyPrimary
      primaryPlacement="footer"
      closeVariant="minimal"
      closePosition="right"
      testID="project-invite-sheet"
    >
      <BottomSheet.Scroll contentContainerStyle={styles.scrollContent}>
        <Text variant="caption" style={styles.hint}>
          {t('mobile.project_invite_hint')}
        </Text>

        <Text variant="bodyMedium" style={styles.label}>
          {t('mobile.project_invite_role')}
        </Text>
        <View style={styles.chipRow}>
          {PROJECT_CREW_ROLES.map((role) => {
            const active = defaultRole === role;
            return (
              <PressableWithFade
                key={role}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setDefaultRole(role)}
                disabled={submitting}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{role}</Text>
              </PressableWithFade>
            );
          })}
        </View>

        <Text variant="bodyMedium" style={styles.label}>
          {t('mobile.project_invite_email_label')}
        </Text>
        {loadingContacts ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        ) : (
          <ContactSuggestionPicker
            contacts={directoryContacts}
            selectedEmails={[]}
            onSelect={handleSelectContact}
            disabled={submitting}
            emailInput={emailInput}
            onEmailInputChange={setEmailInput}
            onAddEmail={handleAddFromInput}
            emailPlaceholder={t('mobile.project_invite_email_placeholder')}
            suggestionLabel={t('mobile.project_invite_directory')}
            testID="project-invite-contact-picker"
          />
        )}

        {entries.length > 0 ? (
          <View style={styles.queueSection}>
            <Text variant="bodyMedium" style={styles.label}>
              {t('mobile.project_invite_queue', { count: entries.length })}
            </Text>
            {entries.map((entry) => (
              <View key={entry.email} style={styles.queueRow}>
                <View style={styles.queueCopy}>
                  <Text variant="bodyMedium" style={styles.queueEmail}>
                    {entry.email}
                  </Text>
                  <Text variant="caption" style={styles.queueRole}>
                    {entry.role}
                  </Text>
                </View>
                <PressableWithFade
                  onPress={() => handleRemoveEntry(entry.email)}
                  disabled={submitting}
                  style={styles.removeBtn}
                  testID={`project-invite-remove-${entry.email}`}
                >
                  <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                </PressableWithFade>
              </View>
            ))}
          </View>
        ) : null}

        {error ? (
          <Text variant="caption" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: spacing.sm },
  hint: { color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 18 },
  label: { fontWeight: '600', marginBottom: spacing.sm, color: colors.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touch.minRowHeight,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  addBtn: {
    minWidth: touch.minSize,
    minHeight: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueSection: { marginBottom: spacing.lg, gap: spacing.sm },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  queueCopy: { flex: 1 },
  queueEmail: { fontWeight: '600' },
  queueRole: { color: colors.textMuted },
  removeBtn: {
    minWidth: touch.minSize,
    minHeight: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginVertical: spacing.md },
  error: { color: colors.error, marginTop: spacing.md },
});
