import React from 'react';
import { useTranslation } from 'react-i18next';
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
import { SkeletonCard } from '../ui/Skeleton';
import { useAppContext } from '../../context/AppContext';

function postMatchesSearch(post, search) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const title = (post?.title || '').toLowerCase();
  const body = (post?.body || '').toLowerCase();
  return title.includes(q) || body.includes(q);
}

export default function ProjectStreamView({ project, supabaseClient, currentUserId, embedded = false }) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { state } = useAppContext();
  const canPost = state.userRole?.permissions?.can_send_messages !== false;
  const [posts, setPosts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const loadingRef = React.useRef(false);
  const postsRef = React.useRef(posts);
  const searchRef = React.useRef(debouncedSearch);
  postsRef.current = posts;
  searchRef.current = debouncedSearch;

  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const load = React.useCallback(async ({ append = false, beforeCreatedAt = null } = {}) => {
    if (!project?.id) return;
    if (append && loadingRef.current) return;
    loadingRef.current = true;
    if (append) setLoadingOlder(true);
    else setLoading(true);
    const searchAtStart = searchRef.current;
    try {
      const { posts: rows, hasMore: more } = await fetchStreamPosts(supabaseClient, project.id, {
        beforeCreatedAt,
        search: searchAtStart || undefined,
      });
      // Drop stale responses if the query changed while fetching.
      if (searchAtStart !== searchRef.current && !append) return;
      setPosts((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(more);
    } catch (e) {
      console.error(e);
      addToast(t('stream.load_error'), 'error');
    } finally {
      setLoading(false);
      setLoadingOlder(false);
      loadingRef.current = false;
    }
  }, [project?.id, supabaseClient, addToast, t]);

  const loadOlder = React.useCallback(() => {
    const oldest = postsRef.current[postsRef.current.length - 1];
    if (!oldest?.created_at || loadingOlder) return;
    load({ append: true, beforeCreatedAt: oldest.created_at });
  }, [load, loadingOlder]);

  React.useEffect(() => {
    load();
  }, [load, debouncedSearch]);

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
    if (!postMatchesSearch(updated, searchRef.current)) {
      setPosts((prev) => removeById(prev, updated.id));
      return;
    }
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
          if (!postMatchesSearch(row, searchRef.current)) return;
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
          if (!postMatchesSearch(row, searchRef.current)) {
            setPosts((prev) => removeById(prev, row.id));
            return;
          }
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

  const handlePost = async ({ post_type, title, body, file, payload }) => {
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
      ...(payload ? { payload } : {}),
    });
    if (postMatchesSearch(newPost, searchRef.current)) {
      setPosts((prev) => upsertById(prev, newPost, 'prepend'));
    }
    addToast(t('stream.posted_success'), 'success');
  };

  if (!project) {
    return <p className="text-sm text-slate-500">{t('stream.select_project')}</p>;
  }

  const searching = Boolean(debouncedSearch);

  return (
    <div className={embedded ? 'space-y-4 h-full flex flex-col min-h-0' : 'mx-auto max-w-3xl space-y-8'}>
      <header className={embedded ? 'space-y-2 shrink-0' : 'space-y-3'}>
        <div className={embedded ? 'space-y-0.5' : 'space-y-1'}>
          <h2 className={embedded ? 'text-base font-semibold text-slate-900' : 'text-xl font-semibold tracking-tight text-slate-900'}>
            {t('stream.title')}
          </h2>
          {!embedded ? (
            <p className="text-sm text-slate-500">
              {t('stream.subtitle')}
            </p>
          ) : null}
        </div>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('stream.search_placeholder')}
          aria-label={t('stream.search_placeholder')}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full"
        />
      </header>

      <StreamComposer
        onSubmit={handlePost}
        canPost={canPost}
        project={project}
        supabaseClient={supabaseClient}
        tasks={state.tasks || []}
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-500">
            {searching ? t('stream.no_search_results') : t('stream.no_posts')}
          </p>
          {!searching ? (
            <p className="mt-1 text-xs text-slate-400">{t('stream.first_update')}</p>
          ) : null}
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
          {hasMore ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
              >
                {loadingOlder ? t('common.loading') : t('stream.load_older')}
              </button>
            </div>
          ) : null}
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
