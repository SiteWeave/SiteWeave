import { View, StyleSheet, Modal, TextInput, Pressable, ScrollView } from 'react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeTaskProgressUpdate } from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';
import TaskCommentsSection from './TaskCommentsSection';
import ProgressEditor from './ui/ProgressEditor';
import DateField from './ui/DateField';
import { Text } from './ui/Text';
import Button from './ui/Button';
import { colors, spacing, touch } from '../theme';

function initialPercent(task) {
  if (!task) return 0;
  if (task.completed) return 100;
  const p = Number(task.percent_complete);
  return Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
}

export default function TaskDetailModal({
  visible,
  task,
  project = null,
  supabase = null,
  currentUserId = null,
  viewerOrgId = null,
  onClose,
  onSave,
  loading = false,
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [completionPercent, setCompletionPercent] = useState(0);
  const [startDate, setStartDate] = useState(null);
  const [dueDate, setDueDate] = useState(null);

  useEffect(() => {
    if (task) {
      setText(task.text || '');
      setDescription(task.description || '');
      setPriority(task.priority || 'Medium');
      setCompletionPercent(initialPercent(task));
      setStartDate(task.start_date || null);
      setDueDate(task.due_date || null);
    }
  }, [task]);

  if (!visible || !task) return null;

  const priorities = ['Low', 'Medium', 'High'];

  const buildPayload = (overrides = {}) => {
    const base = {
      text: text.trim(),
      description: description.trim(),
      priority,
      start_date: startDate,
      due_date: dueDate,
      percent_complete: completionPercent,
      completed: completionPercent >= 100,
      ...overrides,
    };
    return normalizeTaskProgressUpdate(base);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text variant="sectionTitle" style={styles.title}>
            {t('mobile.task_details', { defaultValue: 'Task details' })}
          </Text>

          <Text variant="caption" style={styles.label}>
            {t('mobile.task_name_label', { defaultValue: 'Task' })}
          </Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            editable={!loading}
            placeholder="Task name"
            placeholderTextColor={colors.textSubtle}
          />

          <Text variant="caption" style={styles.label}>
            Notes
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            editable={!loading}
            multiline
            placeholder="Add notes for field crew"
            placeholderTextColor={colors.textSubtle}
          />

          <Text variant="caption" style={styles.label}>
            Priority
          </Text>
          <View style={styles.priorityRow}>
            {priorities.map((value) => (
              <PressableWithFade
                key={value}
                style={[styles.priorityButton, priority === value && styles.priorityButtonActive]}
                onPress={() => setPriority(value)}
                disabled={loading}
              >
                <Text style={[styles.priorityText, priority === value && styles.priorityTextActive]}>{value}</Text>
              </PressableWithFade>
            ))}
          </View>

          <Text variant="caption" style={styles.label}>
            Progress
          </Text>
          <ProgressEditor value={completionPercent} onChange={setCompletionPercent} showMarkComplete />

          <DateField
            label={t('mobile.task_start_date', { defaultValue: 'Start date' })}
            value={startDate}
            onChange={setStartDate}
            disabled={loading}
            testID="task-start-date"
          />
          <DateField
            label={t('mobile.task_due_date', { defaultValue: 'Due date' })}
            value={dueDate}
            onChange={setDueDate}
            disabled={loading}
            testID="task-due-date"
          />

          {project && supabase && currentUserId ? (
            <TaskCommentsSection
              task={task}
              project={project}
              supabase={supabase}
              currentUserId={currentUserId}
              viewerOrgId={viewerOrgId}
            />
          ) : null}

          <View style={styles.actionRow}>
            <Button label="Cancel" variant="secondary" onPress={onClose} disabled={loading} style={styles.half} />
            <Button
              label={loading ? 'Saving…' : 'Save'}
              onPress={() => onSave?.(buildPayload())}
              disabled={loading || !text.trim()}
              testID="task-detail-save"
              style={styles.half}
            />
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xxl,
    maxHeight: '92%',
  },
  title: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.sm, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    fontSize: 17,
    minHeight: touch.minSize,
    color: colors.text,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: spacing.sm },
  priorityButton: {
    flex: 1,
    minHeight: touch.minSize,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityButtonActive: { backgroundColor: colors.primaryLight },
  priorityText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  priorityTextActive: { color: colors.primary, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl },
  half: { flex: 1 },
});
