import React from 'react';
import {
  fetchStreamPosts,
  createStreamPost,
  enrichStreamPost,
  uploadFile,
} from '@siteweave/core-logic';
import { upsertById, removeById } from '@siteweave/core-logic';
import { useToast } from '../../context/ToastContext';
import { markStreamRead } from '../../utils/streamReadState';
import { maybeNotifyStreamUpdate } from '../../utils/browserNotify';
import StreamComposer from './StreamComposer';
import StreamPostCard from './StreamPostCard';
import ReportContentModal from '../moderation/ReportContentModal';

export default function ProjectStreamView({ project, supabaseClient, currentUserId, embedded = false }) {
  const { addToast } = useToast();
  const [posts, setPosts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [reportTarget, setReportTarget] = React.useState(null);
  const loadingRef = React.useRef(false);
  const postsRef = React.useRef(posts);
  postsRef.current = posts;

  const load = React.useCallback(async () => {
    if (!project?.id || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const rows = await fetchStreamPosts(supabaseClient, project.id);
      setPosts(rows);
    } catch (e) {
      console.error(e);
      addToast('Could not load project stream.', 'error');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [project?.id, supabaseClient, addToast]);

  React.useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  React.useEffect(() => {
    if (project?.id) markStreamRead(project.id);
  }, [project?.id]);

  const bumpReplyCount = React.useCallback((postId, delta = 1) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, reply_count: Math.max(0, (p.reply_count || 0) + delta) }
          : p,
      ),
    );
  }, []);

  const handlePostChange = React.useCallback((updated) => {
    setPosts((prev) => upsertById(prev, updated, 'prepend'));
  }, []);

  const handlePostDelete = React.useCallback((postId) => {
    setPosts((prev) => removeById(prev, postId));
  }, []);

  React.useEffect(() => {
    if (!project?.id) return;

    const channel = supabaseClient
      .channel(`stream_posts:${project.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_stream_posts',
          filter: `project_id=eq.${project.id}`,
        },
        async (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          try {
            const enriched = await enrichStreamPost(supabaseClient, row, { reply_count: 0 });
            setPosts((prev) => upsertById(prev, enriched, 'prepend'));
            if (row.author_id && row.author_id !== currentUserId) {
              maybeNotifyStreamUpdate({
                title: project.name ? `Update · ${project.name}` : 'New project update',
                body: row.title || row.body?.slice(0, 120) || 'New stream post',
                projectId: project.id,
              });
            }
          } catch (e) {
            console.error(e);
            load();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'project_stream_posts',
          filter: `project_id=eq.${project.id}`,
        },
        async (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          const existing = postsRef.current.find((p) => p.id === row.id);
          try {
            const enriched = await enrichStreamPost(supabaseClient, row, {
              reply_count: existing?.reply_count ?? 0,
            });
            setPosts((prev) => upsertById(prev, enriched, 'prepend'));
          } catch (e) {
            console.error(e);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'project_stream_posts',
          filter: `project_id=eq.${project.id}`,
        },
        (payload) => {
          const id = payload.old?.id;
          if (id) setPosts((prev) => removeById(prev, id));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_stream_replies',
          filter: `organization_id=eq.${project.organization_id}`,
        },
        (payload) => {
          const postId = payload.new?.post_id;
          if (!postId || !postsRef.current.some((p) => p.id === postId)) return;
          if (payload.new?.author_id === currentUserId) return;
          bumpReplyCount(postId, 1);
        },
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [project?.id, project?.organization_id, project?.name, supabaseClient, currentUserId, load, bumpReplyCount]);

  const handlePost = async ({ post_type, title, body, file }) => {
    if (!currentUserId || !project) return;
    let file_url = null;
    let file_name = null;
    if (file) {
      const path = `stream/${project.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const uploaded = await uploadFile(supabaseClient, 'message_files', path, file);
      file_url = uploaded.publicUrl;
      file_name = file.name;
    }
    const newPost = await createStreamPost(supabaseClient, {
      project_id: project.id,
      organization_id: project.organization_id,
      author_id: currentUserId,
      post_type,
      title,
      body,
      file_url,
      file_name,
    });
    setPosts((prev) => upsertById(prev, newPost, 'prepend'));
    addToast('Posted to stream.', 'success');
  };

  if (!project) {
    return <p className="text-sm text-slate-500">Select a project to view the stream.</p>;
  }

  return (
    <div className={embedded ? 'space-y-4 h-full flex flex-col min-h-0' : 'mx-auto max-w-3xl space-y-8'}>
      <header className={embedded ? 'space-y-0.5 shrink-0' : 'space-y-1'}>
        <h2 className={embedded ? 'text-base font-semibold text-slate-900' : 'text-xl font-semibold tracking-tight text-slate-900'}>
          Project stream
        </h2>
        {!embedded ? (
          <p className="text-sm text-slate-500">
            Daily logs, announcements, and milestones for everyone on this project.
          </p>
        ) : null}
      </header>

      <StreamComposer onSubmit={handlePost} />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-500">No posts yet.</p>
          <p className="mt-1 text-xs text-slate-400">Share the first project update above.</p>
        </div>
      ) : (
        <div className={`space-y-5 ${embedded ? 'flex-1 min-h-0 overflow-y-auto pr-1' : ''}`}>
          {posts.map((post) => (
            <StreamPostCard
              key={post.id}
              post={post}
              project={project}
              currentUserId={currentUserId}
              supabaseClient={supabaseClient}
              onPostChange={handlePostChange}
              onPostDelete={handlePostDelete}
              onReplyCountChange={bumpReplyCount}
              onReport={(p) =>
                setReportTarget({
                  contentType: 'stream_post',
                  contentId: p.id,
                  reportedUserId: p.author_id,
                })
              }
            />
          ))}
        </div>
      )}

      {reportTarget ? (
        <ReportContentModal
          show
          onClose={() => setReportTarget(null)}
          contentType={reportTarget.contentType}
          contentId={reportTarget.contentId}
          reportedUserId={reportTarget.reportedUserId}
        />
      ) : null}
    </div>
  );
}
