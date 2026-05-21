import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import {
  fetchProjectIssues,
  createProjectIssue,
  updateProjectIssue,
  subscribeProjectIssues,
} from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';

export default function FieldIssuesPanel({ project, supabase, currentUserId }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!project?.id || !supabase) return;
    try {
      setLoading(true);
      const rows = await fetchProjectIssues(supabase, project.id, { statusFilter: 'open' });
      setIssues(rows);
    } catch (e) {
      console.error('FieldIssuesPanel', e);
    } finally {
      setLoading(false);
    }
  }, [project?.id, supabase]);

  useEffect(() => {
    load();
    return subscribeProjectIssues(supabase, project.id, load);
  }, [project?.id, supabase, load]);

  const handleCreate = async () => {
    const t = title.trim();
    if (!t || !currentUserId || !project?.organization_id) return;
    setCreating(true);
    try {
      await createProjectIssue(supabase, {
        project_id: project.id,
        organization_id: project.organization_id,
        title: t,
        created_by_user_id: currentUserId,
      });
      setTitle('');
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not create issue');
    } finally {
      setCreating(false);
    }
  };

  const toggleClose = async (issue) => {
    try {
      await updateProjectIssue(
        supabase,
        issue.id,
        { status: 'closed' },
        { previousStatus: issue.status, bridgeToStream: true },
      );
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update issue');
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.title}</Text>
      {item.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      <View style={styles.cardMeta}>
        <Text style={styles.priority}>{item.priority || 'Medium'}</Text>
        {item.assignee?.name ? <Text style={styles.assignee}>{item.assignee.name}</Text> : null}
      </View>
      <PressableWithFade onPress={() => toggleClose(item)} style={styles.closeBtn}>
        <Text style={styles.closeBtnText}>Mark closed</Text>
      </PressableWithFade>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="New field issue title…"
          value={title}
          onChangeText={setTitle}
        />
        <Pressable
          style={[styles.addBtn, (!title.trim() || creating) && styles.addBtnDisabled]}
          onPress={handleCreate}
          disabled={!title.trim() || creating}
        >
          {creating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.addBtnText}>Add</Text>
          )}
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : issues.length === 0 ? (
        <Text style={styles.empty}>No open field issues.</Text>
      ) : (
        <FlatList
          data={issues}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          scrollEnabled={false}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  composer: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  addBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 24, fontSize: 14 },
  list: { gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  cardDesc: { fontSize: 13, color: '#64748b', marginTop: 4 },
  cardMeta: { flexDirection: 'row', gap: 8, marginTop: 8 },
  priority: { fontSize: 11, fontWeight: '600', color: '#b45309' },
  assignee: { fontSize: 11, color: '#64748b' },
  closeBtn: { marginTop: 8, alignSelf: 'flex-start' },
  closeBtnText: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
});
