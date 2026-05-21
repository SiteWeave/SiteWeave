import { View, Text, StyleSheet, Modal, TextInput, Pressable } from 'react-native';
import { useEffect, useState } from 'react';
import PressableWithFade from './PressableWithFade';
import TaskCommentsSection from './TaskCommentsSection';

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
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [completionPercent, setCompletionPercent] = useState(0);

  useEffect(() => {
    if (task) {
      setText(task.text || '');
      setDescription(task.description || '');
      setPriority(task.priority || 'Medium');
      setCompletionPercent(task.completed ? 100 : 0);
    }
  }, [task]);

  if (!visible || !task) return null;

  const priorities = ['Low', 'Medium', 'High'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>Task details</Text>

          <Text style={styles.label}>Task</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            editable={!loading}
            placeholder="Task name"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            editable={!loading}
            multiline
            placeholder="Add notes for field crew"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Priority</Text>
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

          <Text style={styles.label}>Completion</Text>
          <View style={styles.percentRow}>
            {[0, 25, 50, 75, 100].map((value) => (
              <PressableWithFade
                key={value}
                style={[styles.percentButton, completionPercent === value && styles.percentButtonActive]}
                onPress={() => setCompletionPercent(value)}
                disabled={loading}
              >
                <Text style={[styles.percentText, completionPercent === value && styles.percentTextActive]}>
                  {value}%
                </Text>
              </PressableWithFade>
            ))}
          </View>

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
            <PressableWithFade style={styles.secondaryButton} onPress={onClose} disabled={loading}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </PressableWithFade>
            <PressableWithFade
              style={styles.primaryButton}
              onPress={() =>
                onSave?.({
                  text: text.trim(),
                  description: description.trim(),
                  priority,
                  completed: completionPercent >= 100,
                })
              }
              disabled={loading || !text.trim()}
            >
              <Text style={styles.primaryText}>{loading ? 'Saving...' : 'Save'}</Text>
            </PressableWithFade>
          </View>

          <PressableWithFade
            style={styles.completeButton}
            onPress={() => {
              setCompletionPercent(100);
              onSave?.({
                text: text.trim(),
                description: description.trim(),
                priority,
                completed: true,
              });
            }}
            disabled={loading}
          >
            <Text style={styles.completeText}>Set 100% and complete</Text>
          </PressableWithFade>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 28,
    gap: 10,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', color: '#4B5563' },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    fontSize: 17,
    color: '#111827',
  },
  textArea: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  priorityButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  priorityText: { fontSize: 16, fontWeight: '700', color: '#374151' },
  priorityTextActive: { color: '#1D4ED8' },
  percentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  percentButton: {
    minWidth: 64,
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  percentButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  percentText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  percentTextActive: { color: '#1D4ED8' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  secondaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 17, fontWeight: '700', color: '#374151' },
  primaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  completeButton: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  completeText: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
