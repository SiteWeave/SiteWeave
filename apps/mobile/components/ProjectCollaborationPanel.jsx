import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useState } from 'react';
import ProjectStreamPanel from './ProjectStreamPanel';
import FieldIssuesPanel from './FieldIssuesPanel';

export default function ProjectCollaborationPanel({
  project,
  supabase,
  currentUserId,
  initialPanel = 'stream',
}) {
  const [panel, setPanel] = useState(initialPanel);

  return (
    <View style={styles.wrap}>
      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentBtn, panel === 'stream' && styles.segmentBtnActive]}
          onPress={() => setPanel('stream')}
        >
          <Text style={[styles.segmentText, panel === 'stream' && styles.segmentTextActive]}>
            Stream
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, panel === 'issues' && styles.segmentBtnActive]}
          onPress={() => setPanel('issues')}
        >
          <Text style={[styles.segmentText, panel === 'issues' && styles.segmentTextActive]}>
            Field issues
          </Text>
        </Pressable>
      </View>
      {panel === 'stream' ? (
        <ProjectStreamPanel project={project} supabase={supabase} currentUserId={currentUserId} />
      ) : (
        <FieldIssuesPanel project={project} supabase={supabase} currentUserId={currentUserId} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 280 },
  segment: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  segmentTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
});
