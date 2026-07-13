import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchProjectContacts, updateTask } from '@siteweave/core-logic';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import ContactSuggestionPicker from './ui/ContactSuggestionPicker';
import { colors, spacing } from '../theme';

async function pingAssignee(supabase, { task, project, organizationName, senderName }) {
  const email = String(task?.contacts?.email || '').trim();
  if (!email || !email.includes('@')) {
    throw new Error('no_email');
  }
  const { data, error } = await supabase.functions.invoke('dispatch-notification', {
    body: {
      action: 'manual_task_reminder',
      taskId: task.id,
      taskText: task.text || 'Task',
      recipientEmail: email,
      recipientPhone: null,
      deliveryChannels: ['email'],
      recipientName: task.contacts?.name || 'there',
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

  const handlePing = async () => {
    if (!supabase) return;
    setPinging(true);
    try {
      const senderName =
        currentUser?.user_metadata?.full_name || currentUser?.email || 'SiteWeave user';
      await pingAssignee(supabase, { task, project, organizationName, senderName });
      Alert.alert(t('common.success'), t('mobile.task_ping_sent'));
    } catch (err) {
      if (err?.message === 'no_email') {
        Alert.alert(t('common.error'), t('sms.no_contact'));
      } else {
        Alert.alert(t('common.error'), t('mobile.task_ping_failed'));
      }
    } finally {
      setPinging(false);
    }
  };

  const canPing = selectedEmails.length > 0 && !pinging;

  return (
    <View style={styles.wrap} testID="task-manage-section">
      <View style={styles.sectionHeader}>
        <Text variant="caption" style={styles.sectionLabel}>
          {t('mobile.task_set_assignee')}
        </Text>
        {canPing ? (
          <PressableWithFade
            onPress={handlePing}
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
});
