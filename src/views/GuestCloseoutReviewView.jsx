import React from 'react';
import { useParams } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';

const fnBase = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('VITE_SUPABASE_URL is not set');
  return `${url.replace(/\/$/, '')}/functions/v1/guest-closeout-review`;
};

async function fetchReview(token) {
  const res = await fetch(fnBase(), {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Unable to load punch list');
  return data;
}

async function submitSignOff(token, signerName) {
  const res = await fetch(fnBase(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      signer_name: signerName,
      signature: { typed_name: signerName },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Unable to sign off');
  return data;
}

function IssueRow({ issue }) {
  const closed = Boolean(issue.resolved_at) || String(issue.status || '').toLowerCase() === 'closed';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-gray-900">{issue.title}</div>
          {issue.description ? (
            <p className="mt-1 text-sm text-gray-600">{issue.description}</p>
          ) : null}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${closed ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
          {closed ? 'Closed' : 'Open'}
        </span>
      </div>
      {(issue.before_photo_url || issue.after_photo_url) ? (
        <div className="mt-3 flex gap-2">
          {issue.before_photo_url ? (
            <img src={issue.before_photo_url} alt="Before" className="h-20 w-20 rounded-lg border object-cover" />
          ) : null}
          {issue.after_photo_url ? (
            <img src={issue.after_photo_url} alt="After" className="h-20 w-20 rounded-lg border object-cover" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function GuestCloseoutReviewView() {
  const { token } = useParams();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [payload, setPayload] = React.useState(null);
  const [signerName, setSignerName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [signedOff, setSignedOff] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchReview(token);
        if (cancelled) return;
        setPayload(data);
        setSignedOff(Boolean(data.project?.punch_list_signed_off_at));
      } catch (e) {
        if (!cancelled) setError(e.message || 'Unable to load punch list');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSignOff = async () => {
    if (!signerName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await submitSignOff(token, signerName.trim());
      setSignedOff(true);
    } catch (e) {
      setError(e.message || 'Unable to sign off');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Loading punch list..." />
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Punch list unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const project = payload?.project;
  const groups = payload?.groups || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Punch list review</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{project?.name || 'Project'}</h1>
          {project?.address ? (
            <p className="mt-1 text-sm text-gray-600">{project.address}</p>
          ) : null}
        </header>

        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.location || 'general'}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {group.location || 'General'}
              </h2>
              <div className="space-y-3">
                {(group.items || []).map((issue) => (
                  <IssueRow key={issue.id} issue={issue} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Client sign-off</h2>
          {signedOff ? (
            <p className="mt-2 text-sm text-green-700">
              Signed off by {project?.punch_list_signed_off_by_name || signerName || 'Client'}.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-600">
                Type your name to acknowledge you have reviewed this punch list.
              </p>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Your full name"
                className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <button
                type="button"
                onClick={handleSignOff}
                disabled={submitting || !signerName.trim()}
                className="app-action-primary mt-4 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Sign off punch list'}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
