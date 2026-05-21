import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_PROJECT_INVITE_KEY = 'pendingProjectInviteToken';

export async function storePendingProjectInviteToken(token) {
  if (token) {
    await AsyncStorage.setItem(PENDING_PROJECT_INVITE_KEY, token);
  }
}

export async function consumePendingProjectInviteToken() {
  const token = await AsyncStorage.getItem(PENDING_PROJECT_INVITE_KEY);
  if (token) await AsyncStorage.removeItem(PENDING_PROJECT_INVITE_KEY);
  return token;
}

export async function peekPendingProjectInviteToken() {
  return AsyncStorage.getItem(PENDING_PROJECT_INVITE_KEY);
}

async function invokeEdgeFunction(supabase, functionName, body = {}) {
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

export async function redeemProjectInvite(supabase, { token, shortCode }) {
  return invokeEdgeFunction(supabase, 'redeem-project-invite', { token, shortCode });
}

export async function autoRedeemProjectInvites(supabase) {
  return invokeEdgeFunction(supabase, 'auto-redeem-project-invites', {});
}

export function extractProjectInviteTokenFromUrl(urlOrPath) {
  if (!urlOrPath) return null;
  const str = String(urlOrPath);
  const match = str.match(/project-invite\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function runInviteBootstrap(supabase) {
  const pending = await consumePendingProjectInviteToken();
  if (pending) {
    await redeemProjectInvite(supabase, { token: pending });
  }
  await autoRedeemProjectInvites(supabase);
}
