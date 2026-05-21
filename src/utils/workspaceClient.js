const PENDING_PROJECT_INVITE_KEY = 'pendingProjectInviteToken';

export function storePendingProjectInviteToken(token) {
  if (token) {
    sessionStorage.setItem(PENDING_PROJECT_INVITE_KEY, token);
  }
}

export function consumePendingProjectInviteToken() {
  const token = sessionStorage.getItem(PENDING_PROJECT_INVITE_KEY);
  if (token) sessionStorage.removeItem(PENDING_PROJECT_INVITE_KEY);
  return token;
}

export async function invokeEdgeFunction(supabase, functionName, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

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
  return invokeEdgeFunction(supabase, 'auto-redeem-project-invites', {});
}

export function extractProjectInviteTokenFromUrl(urlOrPath) {
  const str = urlOrPath || '';
  const match = str.match(/\/project-invite\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}
