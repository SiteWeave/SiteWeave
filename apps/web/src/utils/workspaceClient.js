const PENDING_PROJECT_INVITE_KEY = 'pendingProjectInviteToken';

let inviteBootstrapInFlight = null;
let inviteBootstrapDoneForUser = null;
let autoRedeemDoneForUser = null;

export function storePendingProjectInviteToken(token) {
  if (token) {
    sessionStorage.setItem(PENDING_PROJECT_INVITE_KEY, token);
  }
}

export function peekPendingProjectInviteToken() {
  try {
    return sessionStorage.getItem(PENDING_PROJECT_INVITE_KEY);
  } catch {
    return null;
  }
}

export function consumePendingProjectInviteToken() {
  const token = peekPendingProjectInviteToken();
  if (token) {
    try {
      sessionStorage.removeItem(PENDING_PROJECT_INVITE_KEY);
    } catch {
      /* ignore */
    }
  }
  return token;
}

/** After login/signup/OAuth, return to pending project invite when present. */
export function getPostAuthNavigatePath(search = typeof window !== 'undefined' ? window.location.search : '') {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    params = new URLSearchParams();
  }
  const tokenFromQuery = params.get('inviteToken') || params.get('token');
  const pending = tokenFromQuery || peekPendingProjectInviteToken();
  if (pending) {
    storePendingProjectInviteToken(pending);
    return `/project-invite/${encodeURIComponent(pending)}`;
  }
  return '/';
}

/** Clear invite bootstrap caches (e.g. on sign-out). */
export function resetInviteBootstrapState() {
  inviteBootstrapInFlight = null;
  inviteBootstrapDoneForUser = null;
  autoRedeemDoneForUser = null;
}

export async function invokeEdgeFunction(supabase, functionName, body = {}) {
  // getUser() validates/refreshes the JWT; getSession() can return a stale access_token
  // on cold start, which the functions gateway rejects with 400.
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    return { success: false, error: error.message };
  }
  return data ?? { success: false, error: 'Empty response' };
}

export async function provisionPersonalWorkspace(supabase, { force = false } = {}) {
  return invokeEdgeFunction(supabase, 'provision-personal-workspace', force ? { force: true } : {});
}

export async function redeemProjectInvite(supabase, { token, shortCode }) {
  return invokeEdgeFunction(supabase, 'redeem-project-invite', { token, shortCode });
}

export async function autoRedeemProjectInvites(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return { success: true, redeemedProjectIds: [], skipped: true };
  }
  if (autoRedeemDoneForUser === user.id) {
    return { success: true, skipped: true };
  }

  const result = await invokeEdgeFunction(supabase, 'auto-redeem-project-invites', {});
  if (result?.success !== false) {
    autoRedeemDoneForUser = user.id;
  }
  return result;
}

export function extractProjectInviteTokenFromUrl(urlOrPath) {
  const str = urlOrPath || '';
  const match = str.match(/\/project-invite\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Redeem pending invite tokens and auto-redeem email invites (call after sign-in). */
export async function runInviteBootstrap(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  if (inviteBootstrapDoneForUser === user.id) {
    return { success: true, skipped: true };
  }
  if (inviteBootstrapInFlight) {
    return inviteBootstrapInFlight;
  }

  inviteBootstrapInFlight = (async () => {
    try {
      const redeemedProjectIds = [];
      const pending = peekPendingProjectInviteToken();
      let pendingRedeem = null;
      if (pending) {
        pendingRedeem = await redeemProjectInvite(supabase, { token: pending });
        if (pendingRedeem?.success) {
          consumePendingProjectInviteToken();
          if (pendingRedeem.projectId) {
            redeemedProjectIds.push(pendingRedeem.projectId);
          }
        }
      }
      const result = await autoRedeemProjectInvites(supabase);
      if (result?.success !== false) {
        inviteBootstrapDoneForUser = user.id;
      }
      const autoIds = Array.isArray(result?.redeemedProjectIds) ? result.redeemedProjectIds : [];
      return {
        ...(result || { success: true }),
        pendingRedeem,
        redeemedProjectIds: [...new Set([...redeemedProjectIds, ...autoIds])],
      };
    } finally {
      inviteBootstrapInFlight = null;
    }
  })();

  return inviteBootstrapInFlight;
}
