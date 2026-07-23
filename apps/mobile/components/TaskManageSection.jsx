import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchProjectContacts, updateTask, isSmsNotificationsEnabled } from '@siteweave/core-logic';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import ContactSuggestionPicker from './ui/ContactSuggestionPicker';
import { colors, spacing } from '../theme';

async function pingRecipients(supabase, { task, project, organizationName, senderName, recipients, deliveryChannels }) {
  const { data, error } = await supabase.functions.invoke('dispatch-notification', {
    body: {
      action: 'manual_task_reminder',
      taskId: task.id,
      taskText: task.text || 'Task',
      recipients: recipients.map((r) => ({
        email: r.email || null,
        phone: r.phone || null,
        name: r.name || null,
        userId: r.profile_id || null,
      })),
      deliveryChannels,
      projectId: project.id,
      projectName: project.name,
      projectAddress: project.address || null,
      organizationId: project.organization_id,
      organizationName: organizationName || 'SiteWeave',
      senderName,
    },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'ping_failed');
  return data;
}

export default function TaskManageSection({
  task,
  project,
  supabase,
  currentUser,
  organizationName,
  canAssignTasks = false,
  onTaskUpdated,
}) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState([]);
  const [pinging, setPinging] = useState(false);
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [showPingPicker, setShowPingPicker] = useState(false);
  const [pingEmails, setPingEmails] = useState([]);

  const assigneeContact = useMemo(() => {
    if (!task?.assignee_id) return null;
    return contacts.find((c) => c.id === task.assignee_id) || task.contacts || null;
  }, [task, contacts]);

  const selectedEmails = useMemo(() => {
    const email = assigneeContact?.email || task?.contacts?.email;
    return email ? [email] : [];
  }, [assigneeContact, task]);

  useEffect(() => {
    if (!supabase || !project?.id) return;
    fetchProjectContacts(supabase, project.id)
      .then((rows) => setContacts(rows || []))
      .catch(() => setContacts([]));
  }, [supabase, project?.id]);

  useEffect(() => {
    const email = assigneeContact?.email || task?.contacts?.email;
    setPingEmails(email ? [String(email).toLowerCase()] : []);
  }, [assigneeContact, task]);

  if (!task || !project || !canAssignTasks) return null;

  const handleAssigneeSelect = async (contact) => {
    if (!contact?.id || !supabase) return;
    setSavingAssignee(true);
    try {
      const updated = await updateTask(supabase, task.id, { assignee_id: contact.id });
      onTaskUpdated?.(updated);
    } catch (err) {
      Alert.alert(t('common.error'), err?.message || t('common.error'));
    } finally {
      setSavingAssignee(false);
    }
  };

  const togglePingEmail = (contact) => {
    const email = String(contact?.email || '').trim().toLowerCase();
    if (!email) return;
    setPingEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  const handlePing = async () => {
    if (!supabase) return;
    const recipients = contacts.filter((c) =>
      pingEmails.includes(String(c.email || '').trim().toLowerCase()),
    );
    if (!recipients.length) {
      Alert.alert(t('common.error'), t('tasks.ping_select_recipients'));
      return;
    }
    const smsEnabled = isSmsNotificationsEnabled();
    const deliveryChannels = ['email'];
    if (smsEnabled && recipients.some((r) => r.phone)) {
      // Prefer email on mobile unless only phone exists
    }
    setPinging(true);
    try {
      const senderName =
        currentUser?.user_metadata?.full_name || currentUser?.email || 'SiteWeave user';
      await pingRecipients(supabase, {
        task,
        project,
        organizationName,
        senderName,
        recipients,
        deliveryChannels,
      });
      Alert.alert(t('common.success'), t('mobile.task_ping_sent'));
      setShowPingPicker(false);
    } catch (err) {
      if (err?.message === 'no_email') {
        Alert.alert(t('common.error'), t('sms.no_contact'));
      } else {
        Alert.alert(t('common.error'), err?.message || t('mobile.task_ping_failed'));
      }
    } finally {
      setPinging(false);
    }
  };

  const canOpenPing = contacts.some((c) => c?.email) && !pinging;

  return (
    <View style={styles.wrap} testID="task-manage-section">
      <View style={styles.sectionHeader}>
        <Text variant="caption" style={styles.sectionLabel}>
          {t('mobile.task_set_assignee')}
        </Text>
        {canOpenPing ? (
          <PressableWithFade
            onPress={() => setShowPingPicker((v) => !v)}
            testID="task-ping-assignee"
            accessibilityLabel={t('tasks.ping_assignee_aria', { task: task.text || 'Task' })}
          >
            <Text style={styles.pingLink}>{t('tasks.ping')}</Text>
          </PressableWithFade>
        ) : pinging ? (
          <Text style={styles.pingLinkMuted}>{t('tasks.ping')}…</Text>
        ) : null}
      </View>
      <ContactSuggestionPicker
        contacts={contacts}
        selectedEmails={selectedEmails}
        onSelect={handleAssigneeSelect}
        disabled={savingAssignee}
        emailInput={assigneeEmail}
        onEmailInputChange={setAssigneeEmail}
        testID="task-assignee-picker"
      />
      {!selectedEmails.length ? (
        <Text variant="caption" style={styles.muted}>
          {t('mobile.task_assignee_none')}
        </Text>
      ) : null}

      {showPingPicker ? (
        <View style={styles.pingBox} testID="task-ping-multi">
          <Text variant="caption" style={styles.sectionLabel}>
            {t('tasks.ping_recipients')}
          </Text>
          <ScrollView style={styles.pingList} nestedScrollEnabled>
            {contacts
              .filter((c) => c?.email)
              .map((contact) => {
                const email = String(contact.email).trim().toLowerCase();
                const selected = pingEmails.includes(email);
                return (
                  <PressableWithFade
                    key={contact.id || email}
                    onPress={() => togglePingEmail(contact)}
                    style={[styles.pingRow, selected && styles.pingRowSelected]}
                  >
                    <Text style={selected ? styles.pingRowTextSelected : styles.pingRowText} numberOfLines={1}>
                      {contact.name || contact.email}
                    </Text>
                  </PressableWithFade>
                );
              })}
          </ScrollView>
          <PressableWithFade
            onPress={handlePing}
            disabled={pinging || pingEmails.length === 0}
            style={[styles.pingSend, (pinging || pingEmails.length === 0) && styles.pingSendDisabled]}
            testID="task-ping-send"
          >
            <Text style={styles.pingSendText}>
              {pinging ? t('fieldIssues.ping_sending') : t('tasks.ping_send')}
            </Text>
          </PressableWithFade>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg, gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flex: 1,
  },
  pingLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'lowercase',
  },
  pingLinkMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSubtle,
    textTransform: 'lowercase',
  },
  muted: { color: colors.textSubtle },
  pingBox: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pingList: { maxHeight: 160 },
  pingRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  pingRowSelected: {
    backgroundColor: colors.primaryLight || colors.surfaceMuted || '#EFF6FF',
  },
  pingRowText: { color: colors.text, fontSize: 14 },
  pingRowTextSelected: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  pingSend: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  pingSendDisabled: { opacity: 0.5 },
  pingSendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
